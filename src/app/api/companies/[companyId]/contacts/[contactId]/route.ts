import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  authorizeCompany,
  authorizationStatus,
  hasPermission,
} from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";
import {
  contactUpdateInput,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
} from "@/lib/contact-model";
import { getAdmin } from "@/lib/firebase-admin";
import { z } from "zod";
import { can } from "@/lib/can";
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string; contactId: string }> },
) {
  const { companyId, contactId } = await params,
    auth = await authorizeCompany(companyId, { module: "contacts" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  if (
    !can(auth.access, "contacts.edit", "contacts") &&
    !hasPermission(auth.access.membership, "contacts.manage")
  )
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    const raw = (await req.json()) as Record<string, unknown>;
    if (typeof raw.website === "string")
      raw.website = normalizeWebsite(raw.website);
    const input = contactUpdateInput.parse(raw),
      db = getAdmin().db,
      ref = db.doc(`companies/${companyId}/contacts/${contactId}`),
      doc = await ref.get();
    if (!doc.exists)
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    const update: Record<string, unknown> = {
      ...input,
      updatedBy: auth.access.user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (input.displayName) {
      update.title = input.displayName;
      update.normalizedName = input.displayName.trim().toLowerCase();
    }
    if (input.email !== undefined)
      update.normalizedEmail = normalizeEmail(input.email);
    if (input.phone !== undefined || input.mobile !== undefined)
      update.normalizedPhone = normalizePhone(
        input.phone ?? input.mobile ?? "",
      );
    if (input.website !== undefined) {
      update.websiteDomain = normalizeDomain(input.website);
      update.website = input.website;
    }
    if (input.gstin !== undefined || input.taxId !== undefined)
      update.normalizedTaxId = (input.gstin ?? input.taxId ?? "").toUpperCase();
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
    delete update.address;
    const batch = db.batch();
    batch.update(ref, update);
    if (input.address) {
      const existingAddress = await ref
        .collection("addresses")
        .where("type", "==", input.address.type)
        .limit(1)
        .get();
      const addressRef =
        existingAddress.docs[0]?.ref ?? ref.collection("addresses").doc();
      batch.set(
        addressRef,
        {
          ...input.address,
          companyId,
          contactId,
          updatedBy: auth.access.user.uid,
          updatedAt: FieldValue.serverTimestamp(),
          ...(!existingAddress.docs[0]
            ? {
                createdBy: auth.access.user.uid,
                createdAt: FieldValue.serverTimestamp(),
              }
            : {}),
        },
        { merge: true },
      );
    }
    appendAudit(
      db,
      companyId,
      {
        actorId: auth.access.user.uid,
        action:
          input.archived === true
            ? "contact.archived"
            : input.archived === false
              ? "contact.restored"
              : "contact.updated",
        entityType: "contact",
        entityId: contactId,
      },
      batch,
    );
    batch.create(db.collection(`companies/${companyId}/crmTimeline`).doc(), {
      companyId,
      entityType: "contact",
      entityId: contactId,
      eventType: "contact_updated",
      actorId: auth.access.user.uid,
      actorName: auth.access.user.name ?? auth.access.user.email ?? "User",
      changes: Object.fromEntries(
        Object.keys(input)
          .filter((key) => key !== "address")
          .map((key) => [
            key,
            {
              from: doc.data()?.[key] ?? null,
              to: (input as Record<string, unknown>)[key] ?? null,
            },
          ]),
      ),
      internal: true,
      timestamp: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return NextResponse.json({ id: contactId });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid contact update"
            : "Could not update contact",
      },
      { status: 400 },
    );
  }
}
