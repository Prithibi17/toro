import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import {
  authorizeCompany,
  authorizationStatus,
  hasPermission,
} from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { serializeFirestore } from "@/lib/firestore-serialization";

type Context = { params: Promise<{ companyId: string; contactId: string }> };
async function context(params: Context["params"]) {
  const { companyId, contactId } = await params;
  const auth = await authorizeCompany(companyId, { module: "contacts" });
  if (!auth.ok)
    return {
      error: NextResponse.json(
        { error: "Access denied" },
        { status: authorizationStatus(auth.reason) },
      ),
    };
  const db = getAdmin().db,
    contact = await db
      .doc(`companies/${companyId}/contacts/${contactId}`)
      .get();
  if (!contact.exists)
    return {
      error: NextResponse.json({ error: "Contact not found" }, { status: 404 }),
    };
  return { companyId, contactId, auth: auth.access, db };
}
export async function GET(_: Request, { params }: Context) {
  const ctx = await context(params);
  if ("error" in ctx) return ctx.error;
  const snap = await ctx.db
    .collection(`companies/${ctx.companyId}/crmTimeline`)
    .where("entityId", "==", ctx.contactId)
    .limit(200)
    .get();
  return NextResponse.json({
    events: snap.docs
      .filter((doc) => doc.data().entityType === "contact")
      .map((doc) => serializeFirestore({ id: doc.id, ...doc.data() }))
      .sort((a, b) =>
        String((b as Record<string, unknown>).timestamp).localeCompare(
          String((a as Record<string, unknown>).timestamp),
        ),
      ),
  });
}
export async function POST(req: Request, { params }: Context) {
  const ctx = await context(params);
  if ("error" in ctx) return ctx.error;
  if (!hasPermission(ctx.auth.membership, "contacts.manage"))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    const data = z
      .object({ body: z.string().trim().min(1).max(10000) })
      .strict()
      .parse(await req.json());
    const ref = ctx.db
      .collection(`companies/${ctx.companyId}/crmTimeline`)
      .doc();
    await ref.create({
      companyId: ctx.companyId,
      entityType: "contact",
      entityId: ctx.contactId,
      eventType: "note",
      body: data.body,
      internal: true,
      actorId: ctx.auth.user.uid,
      actorName: ctx.auth.user.name ?? ctx.auth.user.email ?? "User",
      timestamp: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Write a note before saving"
            : "Could not save note",
      },
      { status: 400 },
    );
  }
}
