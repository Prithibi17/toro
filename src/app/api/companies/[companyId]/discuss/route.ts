import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { canAccessConversation } from "@/lib/discuss-access";
const create = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("channel"),
    name: z.string().trim().min(2).max(80),
    description: z.string().max(300).default(""),
    type: z.enum(["public", "private", "department", "project"]),
    memberIds: z.array(z.string()).max(100).default([]),
    departmentId: z.string().default(""),
    projectId: z.string().default(""),
  }),
  z.object({ kind: z.literal("dm"), targetUserId: z.string().min(1) }),
]);
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await authorizeCompany(companyId, { module: "discuss" });
  if (!auth.ok) return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  const ctx = auth.access;
  const db = getAdmin().db;
  const [channels, members, departments] = await Promise.all([
    db.collection(`companies/${companyId}/channels`).get(),
    db
      .collection(`companies/${companyId}/members`)
      .where("status", "==", "active")
      .get(),
    db.collection(`companies/${companyId}/departments`).get(),
  ]);
  const conversations = channels.docs
    .filter((d) =>
      canAccessConversation(ctx.user.uid, ctx.membership, d.data()),
    )
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        name: String(x.name || x.title || "Untitled channel"),
        description: String(x.description || x.subtitle || ""),
        type: String(x.type || "public"),
        memberIds: Array.isArray(x.memberIds) ? x.memberIds : [],
        lastMessage: String(x.lastMessage || ""),
        unreadBy: Array.isArray(x.unreadBy) ? x.unreadBy : [],
      };
    });
  return NextResponse.json({
    conversations,
    members: members.docs.map((d) => ({
      id: d.id,
      displayName: String(d.data().displayName || d.data().email || "Member"),
      email: String(d.data().email || ""),
      role: String(d.data().role || "employee"),
    })),
    departments: departments.docs.map((d) => ({
      id: d.id,
      name: String(d.data().name || "Department"),
    })),
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await authorizeCompany(companyId, { module: "discuss" });
  if (!auth.ok) return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  const ctx = auth.access;
  try {
    const data = create.parse(await req.json());
    const db = getAdmin().db;
    if (data.kind === "dm") {
      if (data.targetUserId === ctx.user.uid)
        throw new Error("Choose another member");
      const target = await db
        .doc(`companies/${companyId}/members/${data.targetUserId}`)
        .get();
      if (!target.exists || target.data()?.status !== "active")
        return NextResponse.json(
          { error: "Member not found" },
          { status: 404 },
        );
      const ids = [ctx.user.uid, data.targetUserId].sort();
      const id = `dm_${ids.join("_")}`;
      const ref = db.doc(`companies/${companyId}/channels/${id}`);
      if (!(await ref.get()).exists)
        await ref.create({
          name: "Direct message",
          type: "dm",
          memberIds: ids,
          createdBy: ctx.user.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastMessage: "",
          unreadBy: [],
        });
      return NextResponse.json({
        conversation: {
          id,
          name: "Direct message",
          type: "dm",
          memberIds: ids,
        },
      });
    }
    if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin")
      return NextResponse.json(
        { error: "Only owners and admins can create channels" },
        { status: 403 },
      );
    const ref = db.collection(`companies/${companyId}/channels`).doc();
    const memberIds = Array.from(new Set([ctx.user.uid, ...data.memberIds]));
    await ref.create({
      ...data,
      memberIds,
      createdBy: ctx.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessage: "",
      unreadBy: [],
    });
    return NextResponse.json(
      { conversation: { id: ref.id, ...data, memberIds } },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Could not create conversation",
      },
      { status: 400 },
    );
  }
}
