import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCompany, type CompanyAccess } from "./authorization";
import { crmGrant, crmRecordAllowed } from "./access-policy";
import { getAdmin } from "./firebase-admin";
import { serializeFirestore } from "./firestore-serialization";
import type { CrmAction, CrmSection } from "./types";
import { appendAudit } from "./audit";
import {
  filterReadableFields,
  rejectUnwritableFields,
} from "./permission-engine";
export function crmReadable(
  access: CompanyAccess,
  record: Record<string, unknown> & { id: string },
  resource = "crm.opportunity",
) {
  if (access.membership.role === "owner") return record;
  return {
    ...filterReadableFields(access.effectivePermissions, resource, record),
    id: record.id,
    version: record.version ?? 0,
  };
}
export function demandWritable(access: CompanyAccess, fields: string[]) {
  if (access.membership.role === "owner") return;
  if (
    rejectUnwritableFields(
      access.effectivePermissions,
      "crm.opportunity",
      fields,
    ).length
  )
    throw new CrmError("One or more fields are read-only for your role", 403);
}
export function readableHistory(
  access: CompanyAccess,
  event: Record<string, unknown> & { id: string },
) {
  const policy = access.effectivePermissions.fields["crm.opportunity"];
  if (!policy || access.membership.role === "owner") return event;
  // Historical values must not bypass current field-level visibility.
  return {
    ...event,
    changes: filterReadableFields(
      access.effectivePermissions,
      "crm.opportunity",
      (event.changes ?? {}) as Record<string, unknown>,
    ),
  };
}
export class CrmError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function crmError(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof z.ZodError
          ? error.issues
              .map((i) => i.path.join(".") + ": " + i.message)
              .join("; ")
          : error instanceof CrmError
            ? error.message
            : "Could not complete CRM operation",
    },
    {
      status:
        error instanceof CrmError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500,
    },
  );
}
export function crmAllowed(
  access: CompanyAccess,
  section: CrmSection,
  action: CrmAction,
  record?: Record<string, unknown>,
) {
  const grant = crmGrant(access.membership, section, action);
  return (
    grant === true ||
    (typeof grant === "string" &&
      grant !== "none" &&
      (!record ||
        crmRecordAllowed(access.user.uid, access.membership, grant, record)))
  );
}
export async function crmAccess(companyId: string) {
  const auth = await authorizeCompany(companyId, { module: "crm" });
  if (!auth.ok)
    throw new CrmError(
      "Access denied",
      auth.reason === "unauthenticated" ? 401 : 403,
    );
  return auth.access;
}
export function demand(
  access: CompanyAccess,
  section: CrmSection,
  action: CrmAction,
  record?: Record<string, unknown>,
) {
  if (!crmAllowed(access, section, action, record))
    throw new CrmError("Access denied", 403);
}
export function privileged(access: CompanyAccess, action: string) {
  if (access.membership.role === "owner") return true;
  const explicit = access.effectivePermissions.actions[action];
  return explicit !== undefined
    ? explicit === true
    : access.membership.role === "admin";
}
export function plainDoc(doc: FirebaseFirestore.DocumentSnapshot) {
  return serializeFirestore({ id: doc.id, ...doc.data() }) as Record<
    string,
    unknown
  > & { id: string };
}
export async function opportunityAccess(
  companyId: string,
  id: string,
  action: CrmAction = "view",
) {
  const access = await crmAccess(companyId);
  const ref = getAdmin().db.doc(
    `companies/${companyId}/crmOpportunities/${id}`,
  );
  const doc = await ref.get();
  if (!doc.exists) throw new CrmError("Opportunity not found", 404);
  demand(access, "opportunities", "view", doc.data());
  demand(access, "opportunities", action, doc.data());
  return { access, ref, record: plainDoc(doc) };
}
export function history(
  db: FirebaseFirestore.Firestore,
  writer: FirebaseFirestore.Transaction | FirebaseFirestore.WriteBatch,
  companyId: string,
  access: CompanyAccess,
  id: string,
  eventType: string,
  changes: Record<string, unknown> = {},
  body = "",
) {
  const ref = db.collection(`companies/${companyId}/crmTimeline`).doc();
  writer.create(ref, {
    companyId,
    entityType: "opportunity",
    entityId: id,
    eventType,
    actorId: access.user.uid,
    actorName: access.user.name ?? access.user.email ?? "User",
    changes,
    body,
    internal: true,
    timestamp: FieldValue.serverTimestamp(),
  });
  appendAudit(
    db,
    companyId,
    {
      actorId: access.user.uid,
      action: `crm.${eventType}`,
      entityType: "opportunity",
      entityId: id,
    },
    writer,
  );
  return ref;
}
export function notify(
  db: FirebaseFirestore.Firestore,
  writer: FirebaseFirestore.Transaction | FirebaseFirestore.WriteBatch,
  companyId: string,
  recipientId: string,
  title: string,
  opportunityId: string,
) {
  writer.create(db.collection(`companies/${companyId}/notifications`).doc(), {
    companyId,
    recipientId,
    title,
    message: title,
    read: false,
    eventType: "crm.assignment",
    relatedRecord: { type: "opportunity", id: opportunityId },
    href: `/workspace/${companyId}/crm/opportunities/${opportunityId}`,
    createdAt: FieldValue.serverTimestamp(),
  });
}
export async function validateLinks(
  db: FirebaseFirestore.Firestore,
  companyId: string,
  data: Record<string, unknown>,
  reader?: FirebaseFirestore.Transaction,
  access?: CompanyAccess,
) {
  for (const [field, collection] of [
    ["ownerId", "members"],
    ["salesTeamId", "crmSalesTeams"],
    ["customerId", "contacts"],
    ["primaryContactId", "contacts"],
    ["contactId", "contacts"],
    ["organizationId", "contacts"],
    ["lostReasonId", "crmLostReasons"],
  ] as const) {
    if (!data[field]) continue;
    const ref = db.doc(`companies/${companyId}/${collection}/${data[field]}`);
    const doc = reader ? await reader.get(ref) : await ref.get();
    if (
      !doc.exists ||
      doc.data()?.active === false ||
      (field === "ownerId" && doc.data()?.status !== "active")
    )
      throw new CrmError(`Invalid ${field}`);
    if (collection === "contacts" && access)
      demand(access, "contacts", "view", doc.data());
  }
}
