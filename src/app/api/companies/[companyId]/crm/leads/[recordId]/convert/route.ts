import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { crmGrant, crmRecordAllowed } from "@/lib/access-policy";
import { appendAudit } from "@/lib/audit";
import { CRM_COLLECTIONS, leadConversionInput } from "@/lib/crm-model";
import { getAdmin } from "@/lib/firebase-admin";
import type { CrmScope, CrmSection } from "@/lib/types";

const requiredActions: Array<[CrmSection, "create" | "edit"]> = [
  ["leads", "edit"],
  ["contacts", "create"],
  ["organizations", "create"],
  ["opportunities", "create"],
];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string; recordId: string }> },
) {
  const { companyId, recordId } = await params;
  const auth = await authorizeCompany(companyId, { module: "crm" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  try {
    const input = leadConversionInput.parse(await req.json());
    const needed = requiredActions.filter(([section]) => {
      if (section === "contacts")
        return input.createContact && !input.contactId;
      if (section === "organizations")
        return input.createOrganization && !input.organizationId;
      if (section === "opportunities") return input.createOpportunity;
      return true;
    });
    if (
      needed.some(([section, action]) =>
        [false, "none"].includes(
          crmGrant(auth.access.membership, section, action),
        ),
      )
    )
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (input.createOpportunity && (!input.pipelineId || !input.stageId))
      return NextResponse.json(
        { error: "Pipeline and initial stage are required." },
        { status: 400 },
      );

    const db = getAdmin().db;
    const leadRef = db.doc(
      `companies/${companyId}/${CRM_COLLECTIONS.leads}/${recordId}`,
    );
    const result = await db.runTransaction(async (transaction) => {
      const refs = {
        contact: input.contactId
          ? db.doc(
              `companies/${companyId}/${CRM_COLLECTIONS.contacts}/${input.contactId}`,
            )
          : null,
        organization: input.organizationId
          ? db.doc(
              `companies/${companyId}/${CRM_COLLECTIONS.organizations}/${input.organizationId}`,
            )
          : null,
        stage: input.stageId
          ? db.doc(
              `companies/${companyId}/${CRM_COLLECTIONS.stages}/${input.stageId}`,
            )
          : null,
      };
      const [leadDoc, contactDoc, organizationDoc, stageDoc] =
        await Promise.all([
          transaction.get(leadRef),
          refs.contact ? transaction.get(refs.contact) : Promise.resolve(null),
          refs.organization
            ? transaction.get(refs.organization)
            : Promise.resolve(null),
          refs.stage ? transaction.get(refs.stage) : Promise.resolve(null),
        ]);
      if (!leadDoc.exists) throw new Error("Lead not found");
      const lead = leadDoc.data()!;
      const scope = crmGrant(auth.access.membership, "leads", "edit");
      if (
        typeof scope !== "string" ||
        !crmRecordAllowed(
          auth.access.user.uid,
          auth.access.membership,
          scope as CrmScope,
          lead,
        )
      )
        throw new Error("Access denied");
      if (lead.convertedAt) throw new Error("Lead has already been converted");
      if (contactDoc && !contactDoc.exists)
        throw new Error("Contact not found");
      if (organizationDoc && !organizationDoc.exists)
        throw new Error("Company not found");
      if (
        input.createOpportunity &&
        (!stageDoc?.exists || stageDoc.data()?.pipelineId !== input.pipelineId)
      )
        throw new Error("Initial stage does not belong to the pipeline");

      let contactRef = refs.contact;
      let organizationRef = refs.organization;
      if (!organizationRef && input.createOrganization) {
        organizationRef = db
          .collection(`companies/${companyId}/${CRM_COLLECTIONS.organizations}`)
          .doc();
        transaction.create(organizationRef, {
          companyId,
          name: lead.organizationName || `${lead.name} company`,
          email: "",
          phone: lead.phone || "",
          website: "",
          industry: "",
          address: "",
          ownerId: lead.ownerId || auth.access.user.uid,
          departmentIds: lead.departmentIds || [],
          tags: lead.tags || [],
          sourceLeadId: recordId,
          createdBy: auth.access.user.uid,
          updatedBy: auth.access.user.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (!contactRef && input.createContact) {
        contactRef = db
          .collection(`companies/${companyId}/${CRM_COLLECTIONS.contacts}`)
          .doc();
        const [firstName, ...last] = String(lead.name).trim().split(/\s+/);
        transaction.create(contactRef, {
          companyId,
          firstName,
          lastName: last.join(" "),
          email: lead.email || "",
          phone: lead.phone || "",
          alternativePhone: "",
          jobTitle: "",
          organizationId: organizationRef?.id ?? null,
          source: lead.source || "",
          address: "",
          notes: lead.description || "",
          ownerId: lead.ownerId || auth.access.user.uid,
          departmentIds: lead.departmentIds || [],
          tags: lead.tags || [],
          sourceLeadId: recordId,
          createdBy: auth.access.user.uid,
          updatedBy: auth.access.user.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      let opportunityRef: FirebaseFirestore.DocumentReference | null = null;
      if (input.createOpportunity) {
        opportunityRef = db
          .collection(`companies/${companyId}/${CRM_COLLECTIONS.opportunities}`)
          .doc();
        transaction.create(opportunityRef, {
          companyId,
          name: input.opportunityTitle || lead.title || lead.name,
          contactId: contactRef?.id ?? null,
          organizationId: organizationRef?.id ?? null,
          pipelineId: input.pipelineId,
          stageId: input.stageId,
          status: "open",
          value: Number(lead.estimatedValue || 0),
          currency: "INR",
          probability: Number(stageDoc?.data()?.probability || 0),
          expectedCloseDate: lead.expectedCloseDate || "",
          source: lead.source || "",
          sourceLeadId: recordId,
          priority: lead.priority || "medium",
          description: lead.description || "",
          tags: lead.tags || [],
          customFields: lead.customFields || {},
          ownerId: lead.ownerId || auth.access.user.uid,
          departmentIds: lead.departmentIds || [],
          createdBy: auth.access.user.uid,
          updatedBy: auth.access.user.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      const targets = [
        contactRef && ["contact", contactRef.id, "converted_contact"],
        organizationRef && [
          "organization",
          organizationRef.id,
          "converted_customer",
        ],
        opportunityRef && [
          "opportunity",
          opportunityRef.id,
          "converted_opportunity",
        ],
      ].filter(Boolean) as string[][];
      for (const [toType, toId, role] of targets) {
        const association = db
          .collection(`companies/${companyId}/${CRM_COLLECTIONS.associations}`)
          .doc();
        transaction.create(association, {
          companyId,
          fromType: "lead",
          fromId: recordId,
          toType,
          toId,
          role,
          createdBy: auth.access.user.uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.update(leadRef, {
        status: "Converted",
        convertedAt: FieldValue.serverTimestamp(),
        convertedBy: auth.access.user.uid,
        contactId: contactRef?.id ?? null,
        organizationId: organizationRef?.id ?? null,
        opportunityId: opportunityRef?.id ?? null,
        updatedBy: auth.access.user.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      const timeline = db
        .collection(`companies/${companyId}/${CRM_COLLECTIONS.timeline}`)
        .doc();
      transaction.create(timeline, {
        entityType: "lead",
        entityId: recordId,
        eventType: "converted",
        actorId: auth.access.user.uid,
        changes: { opportunityId: opportunityRef?.id ?? null },
        timestamp: FieldValue.serverTimestamp(),
      });
      appendAudit(
        db,
        companyId,
        {
          actorId: auth.access.user.uid,
          action: "crm.lead_converted",
          entityType: "lead",
          entityId: recordId,
          metadata: { opportunityId: opportunityRef?.id ?? "" },
        },
        transaction,
      );
      return {
        contactId: contactRef?.id ?? null,
        organizationId: organizationRef?.id ?? null,
        opportunityId: opportunityRef?.id ?? null,
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Invalid conversion request"
        : error instanceof Error
          ? error.message
          : "Could not convert lead";
    const status =
      message === "Lead not found"
        ? 404
        : message === "Access denied"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
