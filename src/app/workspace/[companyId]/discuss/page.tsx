import { notFound } from "next/navigation";
import { authorizeCompany } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { canAccessConversation } from "@/lib/discuss-access";
import { DiscussWorkspace } from "@/components/discuss-workspace";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ channel?: string; message?: string }>;
}) {
  const { companyId } = await params;
  const requested = await searchParams;
  const authz = await authorizeCompany(companyId, { module: "discuss" });
  if (!authz.ok) notFound();
  const ctx = authz.access;
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
  const initialConversationId = conversations.some(
    (conversation) => conversation.id === requested.channel,
  )
    ? requested.channel
    : undefined;
  return (
    <DiscussWorkspace
      companyId={companyId}
      userId={ctx.user.uid}
      isAdmin={
        ctx.membership.role === "owner" ||
        ctx.membership.actionPermissions?.["discuss.channel.manage"] === true
      }
      initialConversations={conversations}
      members={members.docs.map((d) => ({
        id: d.id,
        displayName: String(d.data().displayName || d.data().email || "Member"),
        email: String(d.data().email || ""),
        role: String(d.data().role || "employee"),
      }))}
      departments={departments.docs.map((d) => ({
        id: d.id,
        name: String(d.data().name || "Department"),
      }))}
      initialConversationId={initialConversationId}
      initialMessageId={initialConversationId ? requested.message : undefined}
    />
  );
}
