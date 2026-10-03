import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { ensureTodoStages } from "@/lib/todo-stages";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    a = await authorizeCompany(companyId, { module: "todo" });
  if (!a.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(a.reason) },
    );
  const db = getAdmin().db;
  await ensureTodoStages(db, companyId, a.access.user.uid);
  const s = await db
    .collection(`companies/${companyId}/todoStages`)
    .where("userId", "==", a.access.user.uid)
    .get();
  return NextResponse.json({
    stages: s.docs
      .map(
        (d) => ({ id: d.id, ...d.data() }) as { id: string; sequence?: number },
      )
      .sort((x, y) => Number(x.sequence) - Number(y.sequence)),
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    a = await authorizeCompany(companyId, { module: "todo" });
  if (!a.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(a.reason) },
    );
  try {
    const input = z
        .object({ name: z.string().trim().min(1).max(80) })
        .parse(await req.json()),
      db = getAdmin().db,
      s = await db
        .collection(`companies/${companyId}/todoStages`)
        .where("userId", "==", a.access.user.uid)
        .get(),
      ref = db.collection(`companies/${companyId}/todoStages`).doc();
    await ref.create({
      ...input,
      companyId,
      userId: a.access.user.uid,
      sequence: s.size,
      isDone: false,
      isFolded: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json(
      {
        stage: {
          id: ref.id,
          ...input,
          sequence: s.size,
          isDone: false,
          isFolded: false,
        },
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }
}
