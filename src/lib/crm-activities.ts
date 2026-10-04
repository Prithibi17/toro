import { FieldValue } from "firebase-admin/firestore";
import { activityInput } from "./crm-model";
import {
  crmAccess,
  crmAllowed,
  CrmError,
  demand,
  history,
  notify,
  plainDoc,
} from "./crm-server";
import { relatedCollection } from "./crm-workflow";
import { getAdmin } from "./firebase-admin";
import type { CompanyAccess } from "./authorization";
import type { CrmSection } from "./types";
import { appAllowed } from "./permission-engine";
export async function activityParent(
  companyId: string,
  access: CompanyAccess,
  data: Record<string, unknown>,
  tx?: FirebaseFirestore.Transaction,
) {
  const collection = relatedCollection(String(data.relatedType));
  if (!collection) throw new CrmError("Invalid activity relationship");
  const ref = getAdmin().db.doc(
      `companies/${companyId}/${collection}/${data.relatedId}`,
    ),
    doc = tx ? await tx.get(ref) : await ref.get();
  if (!doc.exists) throw new CrmError("Related record not found", 404);
  const section = (
    {
      opportunity: "opportunities",
      lead: "leads",
      contact: "contacts",
      organization: "contacts",
    } as Record<string, CrmSection>
  )[String(data.relatedType)];
  if (!section)
    throw new CrmError("Use the To-Do workflow for task-linked activities");
  demand(access, section, "view", doc.data());
  return { ref, doc, section };
}
export async function createActivity(companyId: string, raw: unknown) {
  const access = await crmAccess(companyId);
  demand(access, "activities", "create");
  const data = activityInput.parse(raw),
    db = getAdmin().db;
  if (data.status !== "scheduled")
    throw new CrmError(
      "New activities must be scheduled; complete them after creation",
    );
  const assigneeId = data.assigneeId ?? data.ownerId ?? access.user.uid;
  if (assigneeId !== access.user.uid) demand(access, "activities", "assign");
  const member = await db
    .doc(`companies/${companyId}/members/${assigneeId}`)
    .get();
  if (!member.exists || member.data()?.status !== "active")
    throw new CrmError("Invalid assignee");
  const parent = await activityParent(companyId, access, data);
  if (
    data.type === "meeting" &&
    (!data.dueAt || !data.endAt || new Date(data.endAt) <= new Date(data.dueAt))
  )
    throw new CrmError("Meeting end must be after start");
  if (
    data.type === "meeting" &&
    (!access.membership.enabledModules.includes("calendar") ||
      !appAllowed(access.membership, access.effectivePermissions, "calendar"))
  )
    throw new CrmError("Enable Calendar before scheduling a meeting");
  for (const uid of data.attendeeIds) {
    const m = await db.doc(`companies/${companyId}/members/${uid}`).get();
    if (!m.exists || m.data()?.status !== "active")
      throw new CrmError("Invalid attendee");
  }
  const ref = db.collection(`companies/${companyId}/crmActivities`).doc();
  await db.runTransaction(async (batch) => {
    const parentSnapshot = await batch.get(parent.ref);
    if (!parentSnapshot.exists)
      throw new CrmError("Related record no longer exists", 404);
    demand(access, parent.section, "view", parentSnapshot.data());
    const record: Record<string, unknown> = {
      ...data,
      companyId,
      ownerId: assigneeId,
      assigneeId,
      salesTeamId: parentSnapshot.data()?.salesTeamId ?? null,
      createdBy: access.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (data.type === "meeting") {
      const event = db
        .collection(`companies/${companyId}/calendarEvents`)
        .doc();
      record.calendarEventId = event.id;
      batch.create(event, {
        companyId,
        title: data.title,
        description: data.description,
        start: data.dueAt,
        end: data.endAt,
        allDay: false,
        location: "",
        status: "confirmed",
        ownerId: assigneeId,
        creatorId: access.user.uid,
        createdBy: access.user.uid,
        attendeeIds: Array.from(new Set([assigneeId, ...data.attendeeIds])),
        relatedType: data.relatedType,
        relatedId: data.relatedId,
        crmActivityId: ref.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    batch.create(ref, record);
    if (data.relatedType === "opportunity") {
      const current = parentSnapshot.data()!;
      if (
        data.status === "scheduled" &&
        data.dueAt &&
        (!current.nextActivityDueAt ||
          String(current.nextActivityDueAt) > data.dueAt)
      )
        batch.update(parent.ref, {
          nextActivityId: ref.id,
          nextActivityTitle: data.title,
          nextActivityType: data.type,
          nextActivityDueAt: data.dueAt,
        });
      history(
        db,
        batch,
        companyId,
        access,
        data.relatedId,
        "activity_scheduled",
        {},
        data.title,
      );
      if (assigneeId !== access.user.uid)
        notify(
          db,
          batch,
          companyId,
          assigneeId,
          `Activity assigned: ${data.title}`,
          data.relatedId,
        );
    }
  });
  return plainDoc(await ref.get());
}
export async function visibleActivities(companyId: string) {
  const access = await crmAccess(companyId),
    db = getAdmin().db;
  demand(access, "activities", "view");
  const docs = (
    await db
      .collection(`companies/${companyId}/crmActivities`)
      .orderBy("createdAt", "desc")
      .limit(1000)
      .get()
  ).docs;
  const visible = docs.filter((d) =>
    crmAllowed(access, "activities", "view", d.data()),
  );
  // Read each parent once, in batches, rather than making one sequential
  // network round-trip for every activity on the screen.
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const doc of visible) {
    const data = doc.data(),
      collection = relatedCollection(String(data.relatedType));
    if (collection && data.relatedType !== "task") {
      const ref = db.doc(
        `companies/${companyId}/${collection}/${data.relatedId}`,
      );
      refs.set(ref.path, ref);
    }
  }
  const parents = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  const unique = [...refs.values()];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = await db.getAll(...unique.slice(i, i + 100));
    batch.forEach((doc) => parents.set(doc.ref.path, doc));
  }
  const records = visible
    .filter((doc) => {
      const data = doc.data(),
        collection = relatedCollection(String(data.relatedType));
      const parent = parents.get(
        `companies/${companyId}/${collection}/${data.relatedId}`,
      );
      const section = (
        {
          opportunity: "opportunities",
          lead: "leads",
          contact: "contacts",
          organization: "contacts",
        } as Record<string, CrmSection>
      )[data.relatedType];
      return (
        parent?.exists &&
        section &&
        crmAllowed(access, section, "view", parent.data())
      );
    })
    .map((doc) => ({
      ...plainDoc(doc),
      canEdit: crmAllowed(access, "activities", "edit", doc.data()),
    }));
  return {
    records,
    userId: access.user.uid,
    canCreate: crmAllowed(access, "activities", "create"),
  };
}
