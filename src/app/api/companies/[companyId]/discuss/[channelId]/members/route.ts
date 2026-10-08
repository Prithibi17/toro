import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { appendAudit } from "@/lib/audit";
import {
  canAccessConversation,
  canManageConversationMembers,
} from "@/lib/discuss-access";

const input = z.object({
  action: z.enum(["add", "remove"]),
  userId: z.string().min(1).max(128),
});

export async function PATCH(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ companyId: string; channelId: string }>;
  },
) {
  const { companyId, channelId } = await params;
  const auth = await authorizeCompany(companyId, { module: "discuss" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  if (!["owner", "admin"].includes(auth.access.membership.role))
    return NextResponse.json(
      { error: "Only the workspace owner or an admin can manage members" },
      { status: 403 },
    );
  try {
    const data = input.parse(await req.json());
    const db = getAdmin().db;
    const channelRef = db.doc(`companies/${companyId}/channels/${channelId}`);
    const memberIds = await db.runTransaction(async (transaction) => {
      const channel = await transaction.get(channelRef);
      if (!channel.exists) throw new Error("Conversation not found");
      const channelData = channel.data()!;
      if (
        !canAccessConversation(
          auth.access.user.uid,
          auth.access.membership,
          channelData,
        )
      )
        throw new Error("Access denied");
      if (
        !canManageConversationMembers(
          auth.access.membership.role,
          String(channelData.type ?? "public"),
        )
      )
        throw new Error(
          channelData.type === "dm"
            ? "One-to-one direct-message members cannot be changed"
            : "Members cannot be managed for this conversation type",
        );
      const ids = new Set<string>(
        Array.isArray(channelData.memberIds) ? channelData.memberIds : [],
      );
      if (data.action === "add") {
        if (ids.has(data.userId)) throw new Error("This person is already a member");
        const memberRef = db.doc(
          `companies/${companyId}/members/${data.userId}`,
        );
        const member = await transaction.get(memberRef);
        if (
          !member.exists ||
          member.data()?.status !== "active" ||
          member.data()?.userType === "portal"
        )
          throw new Error("Member is not available");
        ids.add(data.userId);
      } else {
        if (!ids.has(data.userId)) throw new Error("This person is not a member");
        ids.delete(data.userId);
        if (ids.size < 2)
          throw new Error("A group conversation must keep at least two members");
      }
      const nextIds = [...ids];
      const channelUpdate: Record<string, unknown> = {
        memberIds: nextIds,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.access.user.uid,
      };
      if (data.action === "remove")
        channelUpdate.unreadBy = FieldValue.arrayRemove(data.userId);
      transaction.update(channelRef, channelUpdate);
      if (data.action === "remove")
        transaction.delete(channelRef.collection("readStates").doc(data.userId));
      else if (data.userId !== auth.access.user.uid)
        transaction.create(
          db.collection(`companies/${companyId}/notifications`).doc(),
          {
            companyId,
            recipientId: data.userId,
            title: "You were added to a conversation",
            message: String(channelData.name ?? "Group conversation"),
            read: false,
            eventType: "discuss.member_added",
            relatedRecord: { type: "channel", id: channelId },
            href: `/workspace/${companyId}/discuss?channel=${channelId}`,
            createdAt: FieldValue.serverTimestamp(),
          },
        );
      appendAudit(
        db,
        companyId,
        {
          actorId: auth.access.user.uid,
          action: `discuss.member_${data.action === "add" ? "added" : "removed"}`,
          entityType: "channel",
          entityId: channelId,
          metadata: { memberId: data.userId },
        },
        transaction,
      );
      return nextIds;
    });
    return NextResponse.json({ memberIds });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid member change"
            : error instanceof Error
              ? error.message
              : "Could not update conversation members",
      },
      { status: 400 },
    );
  }
}
