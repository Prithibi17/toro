import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { crmGrant, crmRecordAllowed } from "@/lib/access-policy";
import { appendAudit } from "@/lib/audit";
import {
  CRM_COLLECTIONS,
  CRM_SECTIONS,
  sectionInputs,
  type CrmEntitySection,
} from "@/lib/crm-model";
import { getAdmin } from "@/lib/firebase-admin";
import {
  crmEntityType,
  linkedModule,
  relatedCollection,
} from "@/lib/crm-workflow";
import type { CrmScope, CrmSection } from "@/lib/types";
const defaults: CrmSection[] = [
  "overview",
  "leads",
  "contacts",
  "organizations",
  "opportunities",
  "activities",
  "pipelines",
];
async function context(
  companyId: string,
  section: string,
  action: "view" | "create" | "edit" | "delete" | "manage",
) {
  if (!CRM_SECTIONS.includes(section as CrmSection))
    return {
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  const auth = await authorizeCompany(companyId, { module: "crm" });
  if (!auth.ok)
    return {
      response: NextResponse.json(
        { error: "Access denied" },
        { status: authorizationStatus(auth.reason) },
      ),
    };
  const db = getAdmin().db;
  const settings = await db
    .doc(`companies/${companyId}/crmSettings/general`)
    .get();
  const enabled = (settings.data()?.enabledSections ??
    defaults) as CrmSection[];
  if (!enabled.includes(section as CrmSection))
    return {
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  const grant = crmGrant(auth.access.membership, section as CrmSection, action);
  if (grant === false || grant === "none")
    return {
      response: NextResponse.json({ error: "Access denied" }, { status: 403 }),
    };
  const visibleSections = enabled.filter((s) => {
    const view = crmGrant(auth.access.membership, s, "view");
    return view !== false && view !== "none";
  });
  return { db, access: auth.access, grant, enabled: visibleSections };
}
const serialize = (d: FirebaseFirestore.QueryDocumentSnapshot) => ({
  id: d.id,
  ...d.data(),
  createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
  updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null,
  dueAt: d.data().dueAt?.toDate?.()?.toISOString?.() ?? d.data().dueAt ?? null,
});
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string; section: string }> },
) {
  const { companyId, section } = await params;
  const c = await context(companyId, section, "view");
  if (c.response) return c.response;
  const { db, access, grant, enabled } = c;
  if (section === "overview") {
    const names = ["leads", "opportunities", "activities"] as const;
    const snaps = await Promise.all(
      names.map((s) =>
        db
          .collection(`companies/${companyId}/${CRM_COLLECTIONS[s]}`)
          .limit(500)
          .get(),
      ),
    );
    const visible = snaps.map((s, index) =>
      s.docs.filter((d) => {
        const sectionGrant = crmGrant(access.membership, names[index], "view");
        return (
          typeof sectionGrant === "string" &&
          crmRecordAllowed(
            access.user.uid,
            access.membership,
            sectionGrant,
            d.data(),
          )
        );
      }),
    );
    const now = new Date(),
      today = now.toISOString().slice(0, 10);
    const opportunities = visible[1],
      activities = visible[2];
    return NextResponse.json({
      enabledSections: enabled,
      metrics: {
        openOpportunities: opportunities.filter(
          (d) => d.data().status !== "won" && d.data().status !== "lost",
        ).length,
        pipelineValue: opportunities
          .filter((d) => d.data().status !== "lost")
          .reduce((n, d) => n + Number(d.data().value || 0), 0),
        wonValue: opportunities
          .filter((d) => d.data().status === "won")
          .reduce((n, d) => n + Number(d.data().value || 0), 0),
        lostOpportunities: opportunities.filter(
          (d) => d.data().status === "lost",
        ).length,
        newLeads: visible[0].filter(
          (d) => String(d.data().status).toLowerCase() === "new",
        ).length,
        qualifiedLeads: visible[0].filter(
          (d) => String(d.data().status).toLowerCase() === "qualified",
        ).length,
        dueToday: activities.filter(
          (d) =>
            String(
              d.data().dueAt?.toDate?.()?.toISOString?.() ??
                d.data().dueAt ??
                "",
            ).startsWith(today) && d.data().status === "scheduled",
        ).length,
        overdue: activities.filter((d) => {
          const due =
            d.data().dueAt?.toDate?.() ??
            (d.data().dueAt ? new Date(d.data().dueAt) : null);
          return due && due < now && d.data().status === "scheduled";
        }).length,
      },
    });
  }
  if (section === "pipelines") {
    const [pipes, stages] = await Promise.all([
      db
        .collection(`companies/${companyId}/${CRM_COLLECTIONS.pipelines}`)
        .where("active", "==", true)
        .get(),
      db.collection(`companies/${companyId}/${CRM_COLLECTIONS.stages}`).get(),
    ]);
    return NextResponse.json({
      records: pipes.docs.map((p) => ({
        ...serialize(p),
        stages: stages.docs
          .filter((s) => s.data().pipelineId === p.id)
          .sort((a, b) => a.data().order - b.data().order)
          .map(serialize),
      })),
      enabledSections: enabled,
      canCreate: crmGrant(access.membership, "pipelines", "manage") === true,
    });
  }
  const key = section as CrmEntitySection;
  const collection = CRM_COLLECTIONS[key];
  if (!collection)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const snap = await db
    .collection(`companies/${companyId}/${collection}`)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  const [stageSnap, contactSnap] =
    section === "opportunities"
      ? await Promise.all([
          db
            .collection(`companies/${companyId}/${CRM_COLLECTIONS.stages}`)
            .get(),
          db.collection(`companies/${companyId}/contacts`).limit(500).get(),
        ])
      : [null, null];
  return NextResponse.json({
    records: snap.docs
      .filter((d) =>
        crmRecordAllowed(
          access.user.uid,
          access.membership,
          grant as CrmScope,
          d.data(),
        ),
      )
      .map(serialize),
    stages: stageSnap?.docs
      .filter((doc) => doc.data().active !== false)
      .sort(
        (a, b) =>
          Number(a.data().sequence ?? a.data().order ?? 0) -
          Number(b.data().sequence ?? b.data().order ?? 0),
      )
      .map(serialize),
    contacts: contactSnap?.docs.map(serialize),
    enabledSections: enabled,
    canCreate:
      crmGrant(access.membership, section as CrmSection, "create") === true,
    canEdit: ![false, "none"].includes(
      crmGrant(access.membership, section as CrmSection, "edit"),
    ),
    canMoveStage:
      section === "opportunities" &&
      crmGrant(access.membership, "opportunities", "moveStage") === true,
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string; section: string }> },
) {
  const { companyId, section } = await params;
  const action = section === "pipelines" ? "manage" : "create";
  const c = await context(companyId, section, action);
  if (c.response) return c.response;
  const { db, access } = c;
  const schema = sectionInputs[section as CrmEntitySection];
  if (!schema)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const input = schema.parse(await req.json());
    if (
      "ownerId" in input &&
      input.ownerId &&
      input.ownerId !== access.user.uid
    ) {
      const assign = crmGrant(
        access.membership,
        section as CrmSection,
        "assign",
      );
      if (assign === false || assign === "none")
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      const target = await db
        .doc(`companies/${companyId}/members/${input.ownerId}`)
        .get();
      if (!target.exists || target.data()?.status !== "active")
        return NextResponse.json({ error: "Invalid owner" }, { status: 400 });
    }
    if (section === "opportunities") {
      const opportunity = input as z.infer<typeof sectionInputs.opportunities>;
      const stage = await db
        .doc(
          `companies/${companyId}/${CRM_COLLECTIONS.stages}/${opportunity.stageId}`,
        )
        .get();
      if (!stage.exists || stage.data()?.active === false)
        return NextResponse.json(
          { error: "Select an active CRM stage." },
          { status: 400 },
        );
      for (const [kind, recordId] of [
        ["contact", opportunity.primaryContactId ?? opportunity.contactId],
        ["organization", opportunity.customerId ?? opportunity.organizationId],
      ] as const) {
        if (recordId) {
          const linked = await db
            .doc(
              `companies/${companyId}/${relatedCollection(kind)}/${recordId}`,
            )
            .get();
          if (!linked.exists)
            return NextResponse.json(
              { error: `The selected ${kind} does not exist.` },
              { status: 400 },
            );
        }
      }
    }
    if (section === "activities") {
      const activity = input as z.infer<typeof sectionInputs.activities>;
      const linkedCollection = relatedCollection(activity.relatedType);
      const linked = await db
        .doc(`companies/${companyId}/${linkedCollection}/${activity.relatedId}`)
        .get();
      if (!linked.exists)
        return NextResponse.json(
          { error: "The related CRM record does not exist." },
          { status: 400 },
        );
    }
    const collection = CRM_COLLECTIONS[section as CrmEntitySection];
    const ref = db.collection(`companies/${companyId}/${collection}`).doc();
    const batch = db.batch();
    const ownerId =
      "ownerId" in input && input.ownerId ? input.ownerId : access.user.uid;
    const record = {
      ...input,
      companyId,
      ownerId,
      createdBy: access.user.uid,
      updatedBy: access.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (section === "pipelines") {
      const stages = (input as z.infer<typeof sectionInputs.pipelines>).stages;
      const pipeline = { ...record } as typeof record & {
        stages?: typeof stages;
      };
      delete pipeline.stages;
      batch.create(ref, pipeline);
      stages.forEach((stage, order) => {
        const s = db
          .collection(`companies/${companyId}/${CRM_COLLECTIONS.stages}`)
          .doc();
        batch.create(s, {
          ...stage,
          pipelineId: ref.id,
          order,
          createdBy: access.user.uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    } else {
      const linkedIds: Record<string, string> = {};
      if (section === "activities") {
        const activity = input as z.infer<typeof sectionInputs.activities>;
        const linkedApp = linkedModule(activity.type);
        if (linkedApp === "calendar") {
          const event = db
            .collection(`companies/${companyId}/calendarEvents`)
            .doc();
          linkedIds.calendarEventId = event.id;
          batch.create(event, {
            companyId,
            title: activity.title,
            subtitle: activity.description,
            status:
              activity.status === "scheduled" ? "confirmed" : activity.status,
            date: activity.dueAt?.slice(0, 10) ?? "",
            dueAt: activity.dueAt,
            crmActivityId: ref.id,
            relatedType: activity.relatedType,
            relatedId: activity.relatedId,
            ownerId,
            creatorId: access.user.uid,
            createdBy: access.user.uid,
            createdAt: FieldValue.serverTimestamp(),
            updatedBy: access.user.uid,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else if (linkedApp === "todo") {
          const task = db.collection(`companies/${companyId}/tasks`).doc();
          linkedIds.taskId = task.id;
          const assigneeId = activity.assigneeId || ownerId;
          batch.create(task, {
            companyId,
            title: activity.title,
            description: activity.description,
            priority: activity.priority,
            dueDate: activity.dueAt?.slice(0, 10) ?? "",
            status: "todo",
            crmActivityId: ref.id,
            relatedType: activity.relatedType,
            relatedId: activity.relatedId,
            ownerId,
            creatorId: access.user.uid,
            creatorName: access.user.name ?? access.user.email ?? "User",
            assigneeIds: [assigneeId],
            viewerIds: [],
            departmentIds: activity.departmentIds,
            createdAt: FieldValue.serverTimestamp(),
            updatedBy: access.user.uid,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        if (
          activity.relatedType === "opportunity" &&
          activity.status === "scheduled"
        ) {
          batch.update(
            db.doc(
              `companies/${companyId}/${CRM_COLLECTIONS.opportunities}/${activity.relatedId}`,
            ),
            {
              nextActivityId: ref.id,
              nextActivityTitle: activity.title,
              nextActivityType: activity.type,
              nextActivityDueAt: activity.dueAt,
              updatedAt: FieldValue.serverTimestamp(),
            },
          );
        }
      }
      batch.create(ref, { ...record, ...linkedIds });
      if (section === "opportunities") {
        const opportunity = input as z.infer<
          typeof sectionInputs.opportunities
        >;
        for (const [toType, toId, role] of [
          [
            "contact",
            opportunity.primaryContactId ?? opportunity.contactId,
            "primary",
          ],
          [
            "organization",
            opportunity.customerId ?? opportunity.organizationId,
            "customer",
          ],
        ] as const) {
          if (!toId) continue;
          const association = db
            .collection(
              `companies/${companyId}/${CRM_COLLECTIONS.associations}`,
            )
            .doc();
          batch.create(association, {
            companyId,
            fromType: "opportunity",
            fromId: ref.id,
            toType,
            toId,
            role,
            createdBy: access.user.uid,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        const stageHistory = db
          .collection(`companies/${companyId}/${CRM_COLLECTIONS.stageHistory}`)
          .doc();
        batch.create(stageHistory, {
          companyId,
          opportunityId: ref.id,
          fromStageId: null,
          toStageId: opportunity.stageId,
          actorId: access.user.uid,
          changedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    const entityType = crmEntityType(section)!;
    appendAudit(
      db,
      companyId,
      {
        actorId: access.user.uid,
        action: `crm.${entityType}_created`,
        entityType,
        entityId: ref.id,
      },
      batch,
    );
    const timeline = db
      .collection(`companies/${companyId}/${CRM_COLLECTIONS.timeline}`)
      .doc();
    batch.create(timeline, {
      entityType,
      entityId: ref.id,
      eventType: "created",
      actorId: access.user.uid,
      changes: {},
      timestamp: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid request"
            : "Could not create record",
      },
      { status: 400 },
    );
  }
}
