import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebase-admin";
import { requireMembership } from "@/lib/session";

const updateSchema = z.object({ notificationId: z.string().min(1) });

export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const ctx = await requireMembership(companyId);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const snap = await getAdmin()
    .db.collection(`companies/${companyId}/notifications`)
    .where("recipientId", "==", ctx.user.uid)
    .limit(60)
    .get();
  const notifications = snap.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? null,
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return NextResponse.json({ notifications });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const ctx = await requireMembership(companyId);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid notification" },
      { status: 400 },
    );
  const admin = getAdmin();
  const ref = admin.db.doc(
    `companies/${companyId}/notifications/${parsed.data.notificationId}`,
  );
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.recipientId !== ctx.user.uid)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ref.update({ read: true, readAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}
