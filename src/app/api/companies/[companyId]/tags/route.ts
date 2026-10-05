import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import {
  authorizeCompany,
  authorizationStatus,
  hasPermission,
  isCompanyAdministrator,
} from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { serializeFirestore } from "@/lib/firestore-serialization";
const schema = z.object({ name: z.string().trim().min(1).max(120) });
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    auth = await authorizeCompany(companyId);
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  const snap = await getAdmin()
    .db.collection(`companies/${companyId}/crmTags`)
    .where("active", "==", true)
    .limit(200)
    .get();
  return NextResponse.json({
    tags: snap.docs
      .map((doc) => serializeFirestore({ id: doc.id, ...doc.data() }))
      .sort((a, b) =>
        String((a as Record<string, unknown>).name).localeCompare(
          String((b as Record<string, unknown>).name),
        ),
      ),
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    auth = await authorizeCompany(companyId);
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  if (
    !isCompanyAdministrator(auth.access.membership) &&
    !hasPermission(auth.access.membership, "crm.manage") &&
    !hasPermission(auth.access.membership, "contacts.manage")
  )
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    const { name } = schema.parse(await req.json()),
      normalizedName = name.toLocaleLowerCase();
    const db = getAdmin().db,
      collection = db.collection(`companies/${companyId}/crmTags`),
      existing = await collection.limit(500).get(),
      duplicate = existing.docs.find(
        (doc) =>
          String(
            doc.data().normalizedName ?? doc.data().name ?? "",
          ).toLocaleLowerCase() === normalizedName,
      );
    if (duplicate)
      return NextResponse.json({
        tag: serializeFirestore({ id: duplicate.id, ...duplicate.data() }),
      });
    const ref = collection.doc();
    await ref.create({
      companyId,
      name,
      normalizedName,
      active: true,
      createdBy: auth.access.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json(
      { tag: { id: ref.id, name, normalizedName, active: true } },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Enter a valid tag name"
            : "Could not create tag",
      },
      { status: 400 },
    );
  }
}
