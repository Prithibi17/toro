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
} from "@/lib/contact-model";
import { getAdmin } from "@/lib/firebase-admin";
import { z } from "zod";
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
  if (!hasPermission(auth.access.membership, "contacts.manage"))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    const input = contactUpdateInput.parse(await req.json()),
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
    if (input.displayName) update.title = input.displayName;
    if (input.email !== undefined)
      update.normalizedEmail = normalizeEmail(input.email);
    if (input.phone !== undefined || input.mobile !== undefined)
      update.normalizedPhone = normalizePhone(
        input.phone ?? input.mobile ?? "",
      );
    if (input.website !== undefined)
      update.websiteDomain = normalizeDomain(input.website);
    delete update.address;
    const batch = db.batch();
    batch.update(ref, update);
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
    await batch.commit();
    return NextResponse.json({ ok: true });
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
