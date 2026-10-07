import { getAdmin } from "./firebase-admin";
import {
  crmAccess,
  crmAllowed,
  plainDoc,
  privileged,
  CrmError,
  crmReadable,
} from "./crm-server";
import { filterCrmRecords, normalizePriority, type CrmItem } from "./crm-query";
import { ensureDefaultCrmStages } from "./crm-defaults";
import { crmGrant } from "./access-policy";
import { FieldPath } from "firebase-admin/firestore";
export async function crmList(
  companyId: string,
  query: Record<string, string> = {},
  after?: string,
) {
  const access = await crmAccess(companyId),
    db = getAdmin().db;
  if (!crmAllowed(access, "opportunities", "view"))
    throw new CrmError("Access denied", 403);
  let opportunityQuery: FirebaseFirestore.Query = db.collection(
    `companies/${companyId}/crmOpportunities`,
  );
  // Apply ownership before the safety cap, so other employees' records cannot
  // push a user's own pipeline out of the result window. Avoid composite indexes.
  if (
    crmGrant(access.membership, "opportunities", "view") === "own" ||
    query.mine === "true"
  )
    opportunityQuery = opportunityQuery.where("ownerId", "==", access.user.uid);
  else if (query.ownerId)
    opportunityQuery = opportunityQuery.where("ownerId", "==", query.ownerId);
  opportunityQuery = opportunityQuery.orderBy(FieldPath.documentId());
  if (after) {
    if (after.length > 1500 || after.includes("/"))
      throw new CrmError("Invalid page cursor");
    opportunityQuery = opportunityQuery.startAfter(after);
  }
  const [
    snap,
    initialStageSnap,
    contactsSnap,
    membersSnap,
    teamsSnap,
    tagsSnap,
    lostSnap,
    favoritesSnap,
    company,
  ] = await Promise.all([
    opportunityQuery.limit(1001).get(),
    db.collection(`companies/${companyId}/crmPipelineStages`).get(),
    db.collection(`companies/${companyId}/contacts`).limit(500).get(),
    db
      .collection(`companies/${companyId}/members`)
      .where("status", "==", "active")
      .get(),
    db.collection(`companies/${companyId}/crmSalesTeams`).get(),
    db.collection(`companies/${companyId}/crmTags`).get(),
    db.collection(`companies/${companyId}/crmLostReasons`).get(),
    db
      .collection(`companies/${companyId}/crmSavedSearches`)
      .where("userId", "==", access.user.uid)
      .get(),
    db.doc(`companies/${companyId}`).get(),
  ]);
  let stageSnap = initialStageSnap;
  if (stageSnap.empty) {
    await ensureDefaultCrmStages(db, companyId, access.user.uid);
    stageSnap = await db.collection(`companies/${companyId}/crmPipelineStages`).get();
  }
  const contacts = contactsSnap.docs
    .filter((d) => crmAllowed(access, "contacts", "view", d.data()))
    .map((d) => {
      const x = crmReadable(access, plainDoc(d), "contacts.contact");
      return {
        id: d.id,
        displayName: x.displayName ?? x.title ?? x.name ?? "",
        name: x.displayName ?? x.title ?? x.name ?? "",
        email: x.email ?? "",
        phone: x.phone ?? "",
        mobile: x.mobile ?? "",
        contactType: x.contactType ?? "person",
        tags: Array.isArray(x.tags) ? x.tags : [],
        address:
          x.address && typeof x.address === "object"
            ? {
                city: (x.address as Record<string, unknown>).city ?? "",
                country: (x.address as Record<string, unknown>).country ?? "",
              }
            : null,
      };
    });
  const members = membersSnap.docs.map((d) => ({
    id: d.id,
    displayName: d.data().displayName ?? d.data().email ?? "Member",
    email: d.data().email ?? "",
  }));
  const tagNames = new Map(
    tagsSnap.docs.map((doc) => [doc.id, String(doc.data().name ?? doc.id)]),
  );
  const records = snap.docs
    .slice(0, 1000)
    .filter((d) => crmAllowed(access, "opportunities", "view", d.data()))
    .map((d) => {
      const r = plainDoc(d);
      return {
        ...r,
        version: Number(r.version ?? 0),
        priority: normalizePriority(r.priority),
        customerName:
          contacts.find((c) => c.id === (r.customerId ?? r.contactId))?.name ??
          "",
        ownerName: members.find((m) => m.id === r.ownerId)?.displayName ?? "",
        tagNames: Array.isArray(r.tags)
          ? r.tags.map((id) => tagNames.get(String(id)) ?? String(id)).join(" ")
          : "",
      };
    }) as CrmItem[];
  return {
    records: filterCrmRecords(
      records,
      query,
      access.user.uid,
      new Date(),
      company.data()?.timezone ?? "UTC",
    ).map((record) => crmReadable(access, record)),
    truncated: snap.size > 1000,
    nextCursor: snap.size > 1000 ? snap.docs[999].id : null,
    stages: stageSnap.docs
      .filter((d) => d.data().active !== false)
      .map(plainDoc)
      .sort(
        (a, b) =>
          Number(a.sequence ?? a.order ?? 0) -
          Number(b.sequence ?? b.order ?? 0),
      ),
    contacts,
    members,
    teams: teamsSnap.docs.map(plainDoc),
    tags: tagsSnap.docs.map(plainDoc),
    lostReasons: lostSnap.docs
      .filter((d) => d.data().active !== false)
      .map(plainDoc),
    favorites: favoritesSnap.docs.map(plainDoc),
    userId: access.user.uid,
    currency: company.data()?.currency ?? "INR",
    timezone: company.data()?.timezone ?? "UTC",
    canCreate: crmAllowed(access, "opportunities", "create"),
    canEdit: crmAllowed(access, "opportunities", "edit"),
    canMoveStage: crmAllowed(access, "opportunities", "moveStage"),
    canAssign: crmAllowed(access, "opportunities", "assign"),
    canConfigure: crmAllowed(access, "pipelines", "manage"),
    canExport: privileged(access, "crm.export"),
    canImport: privileged(access, "crm.import"),
  };
}
