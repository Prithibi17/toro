import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import {
  canAccessConversation,
  canonicalDirectMessageId,
  isExactDirectMessage,
} from "@/lib/discuss-access";
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
  z.object({
    kind: z.literal("group"),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(300).default(""),
    memberIds: z.array(z.string().min(1)).min(2).max(30),
  }),
]);
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await authorizeCompany(companyId, { module: "discuss" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
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
  const accessibleChannels = channels.docs.filter((d) =>
    canAccessConversation(ctx.user.uid, ctx.membership, d.data()),
  );
  const readStates = accessibleChannels.length
    ? await db.getAll(
        ...accessibleChannels.map((channel) =>
          channel.ref.collection("readStates").doc(ctx.user.uid),
        ),
      )
    : [];
  const unreadByChannel = new Map(
    readStates.map((document) => [
      document.ref.parent.parent?.id,
      Number(document.data()?.unreadCount || 0),
    ]),
  );
  const conversations = accessibleChannels.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      name: String(x.name || x.title || "Untitled channel"),
      description: String(x.description || x.subtitle || ""),
      type: String(x.type || "public"),
      memberIds: Array.isArray(x.memberIds) ? x.memberIds : [],
      lastMessage: String(x.lastMessage || ""),
      unreadBy: Array.isArray(x.unreadBy) ? x.unreadBy : [],
      unreadCount: unreadByChannel.get(d.id) || 0,
    };
  });
  return NextResponse.json({
    conversations,
    members: members.docs
      .filter((d) => d.data().userType !== "portal")
      .map((d) => ({
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
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
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
      if (
        !target.exists ||
        target.data()?.status !== "active" ||
        target.data()?.userType === "portal"
      )
        return NextResponse.json(
          { error: "Member not found" },
          { status: 404 },
        );
      const ids = [ctx.user.uid, data.targetUserId].sort();
      const id = canonicalDirectMessageId(ctx.user.uid, data.targetUserId);
      const ref = db.doc(`companies/${companyId}/channels/${id}`);
      const existing = await ref.get();
      if (!existing.exists)
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
      else if (!isExactDirectMessage(existing.data()!, ids))
        return NextResponse.json(
          { error: "This direct-message record is invalid and must be repaired" },
          { status: 409 },
        );
      return NextResponse.json({
        conversation: {
          id,
          name: "Direct message",
          type: "dm",
          memberIds: ids,
        },
      });
    }
    if (data.kind === "group") {
      const memberIds = Array.from(new Set([ctx.user.uid, ...data.memberIds]));
      const memberDocuments = await Promise.all(
        memberIds.map((id) =>
          db.doc(`companies/${companyId}/members/${id}`).get(),
        ),
      );
      if (
        memberDocuments.some(
          (member) =>
            !member.exists ||
            member.data()?.status !== "active" ||
            member.data()?.userType === "portal",
        )
      )
        return NextResponse.json(
          { error: "One or more members are unavailable" },
          { status: 400 },
        );
      const ref = db.collection(`companies/${companyId}/channels`).doc();
      await ref.create({
        name: data.name,
        description: data.description,
        type: "group",
        memberIds,
        createdBy: ctx.user.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastMessage: "",
        unreadBy: [],
      });
      return NextResponse.json(
        { conversation: { id: ref.id, ...data, type: "group", memberIds } },
        { status: 201 },
      );
    }
    if (
      ctx.membership.role !== "owner" &&
      ctx.membership.actionPermissions?.["discuss.channel.manage"] !== true
    )
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
