import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  authorizeCompany,
  authorizationStatus,
  hasPermission,
} from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";
import {
  contactInput,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
} from "@/lib/contact-model";
import { getAdmin } from "@/lib/firebase-admin";
import { z } from "zod";
import { can } from "@/lib/can";
const serialize = (d: FirebaseFirestore.QueryDocumentSnapshot) => ({
  id: d.id,
  ...d.data(),
  createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
});
export async function GET(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    auth = await authorizeCompany(companyId, { module: "contacts" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  const url = new URL(req.url),
    archived = url.searchParams.get("archived") === "true",
    snap = await getAdmin()
      .db.collection(`companies/${companyId}/contacts`)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();
  return NextResponse.json({
    records: snap.docs
      .filter((d) => Boolean(d.data().archived) === archived)
      .map(serialize),
    canCreate:
      can(auth.access, "contacts.create", "contacts") ||
      hasPermission(auth.access.membership, "contacts.manage"),
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    auth = await authorizeCompany(companyId, { module: "contacts" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  if (
    !can(auth.access, "contacts.create", "contacts") &&
    !hasPermission(auth.access.membership, "contacts.manage")
  )
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    const raw = (await req.json()) as Record<string, unknown>,
      allowDuplicate = raw.allowDuplicate === true;
    delete raw.allowDuplicate;
    if (typeof raw.website === "string")
      raw.website = normalizeWebsite(raw.website);
    const input = contactInput.parse(raw),
      db = getAdmin().db,
      collection = db.collection(`companies/${companyId}/contacts`),
      normalizedEmail = normalizeEmail(input.email),
      normalizedPhone = normalizePhone(input.phone || input.mobile),
      websiteDomain = normalizeDomain(input.website),
      normalizedName = input.displayName.trim().toLowerCase();
    const candidates = await Promise.all([
      normalizedEmail
        ? collection
            .where("normalizedEmail", "==", normalizedEmail)
            .limit(5)
            .get()
        : null,
      normalizedPhone
        ? collection
            .where("normalizedPhone", "==", normalizedPhone)
            .limit(5)
            .get()
        : null,
      input.gstin || input.taxId
        ? collection
            .where(
              "normalizedTaxId",
              "==",
              (input.gstin || input.taxId).toUpperCase(),
            )
            .limit(5)
            .get()
        : null,
      websiteDomain
        ? collection.where("websiteDomain", "==", websiteDomain).limit(5).get()
        : null,
      collection.where("normalizedName", "==", normalizedName).limit(5).get(),
    ]);
    const duplicates = new Map<
      string,
      FirebaseFirestore.QueryDocumentSnapshot
    >();
    candidates.forEach((s) => s?.docs.forEach((d) => duplicates.set(d.id, d)));
    if (duplicates.size && !allowDuplicate)
      return NextResponse.json(
        {
          error: "Possible duplicate detected.",
          duplicates: [...duplicates.values()].map(serialize),
        },
        { status: 409 },
      );
    if (input.parentContactId) {
      const parent = await db
        .doc(`companies/${companyId}/contacts/${input.parentContactId}`)
        .get();
      if (
        !parent.exists ||
        parent.data()?.contactType !== "company" ||
        parent.data()?.archived === true
      )
        return NextResponse.json(
          { error: "Parent company not found" },
          { status: 400 },
        );
    }
    const ref = collection.doc(),
      batch = db.batch(),
      address = input.address,
      record = {
        ...input,
        title: input.displayName,
        subtitle: input.email || input.phone,
        status:
          input.isVendor && input.isCustomer
            ? "customer-vendor"
            : input.isVendor
              ? "vendor"
              : "customer",
        normalizedEmail,
        normalizedName,
        normalizedPhone,
        websiteDomain,
        normalizedTaxId: (input.gstin || input.taxId).toUpperCase(),
        companyId,
        archived: false,
        ownerId: input.ownerId || auth.access.user.uid,
        createdBy: auth.access.user.uid,
        updatedBy: auth.access.user.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
    delete (record as { address?: unknown }).address;
    batch.create(ref, record);
    if (
      address &&
      Object.entries(address).some(
        ([key, value]) => key !== "type" && Boolean(value),
      )
    )
      batch.create(ref.collection("addresses").doc(), {
        ...address,
        companyId,
        contactId: ref.id,
        createdBy: auth.access.user.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    appendAudit(
      db,
      companyId,
      {
        actorId: auth.access.user.uid,
        action: "contact.created",
        entityType: "contact",
        entityId: ref.id,
      },
      batch,
    );
    batch.create(db.collection(`companies/${companyId}/crmTimeline`).doc(), {
      companyId,
      entityType: "contact",
      entityId: ref.id,
      eventType: "contact_created",
      actorId: auth.access.user.uid,
      actorName: auth.access.user.name ?? auth.access.user.email ?? "User",
      internal: true,
      timestamp: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid contact information"
            : "Could not create contact",
      },
      { status: 400 },
    );
  }
}
