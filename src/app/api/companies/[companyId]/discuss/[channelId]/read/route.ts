import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { canAccessConversation } from "@/lib/discuss-access";
import { getAdmin } from "@/lib/firebase-admin";

export async function PATCH(
  _: Request,
  { params }: { params: Promise<{ companyId: string; channelId: string }> },
) {
  const { companyId, channelId } = await params;
  const auth = await authorizeCompany(companyId, { module: "discuss" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  const { db } = getAdmin();
  const channelRef = db.doc(`companies/${companyId}/channels/${channelId}`);
  const channel = await channelRef.get();
  if (
    !channel.exists ||
    !canAccessConversation(
      auth.access.user.uid,
      auth.access.membership,
      channel.data()!,
    )
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const stateRef = channelRef
    .collection("readStates")
    .doc(auth.access.user.uid);
  const batch = db.batch();
  batch.set(
    stateRef,
    {
      userId: auth.access.user.uid,
      lastReadAt: FieldValue.serverTimestamp(),
      lastReadMessageId: channel.data()?.lastMessageId ?? null,
      unreadCount: 0,
    },
    { merge: true },
  );
  batch.update(channelRef, {
    unreadBy: FieldValue.arrayRemove(auth.access.user.uid),
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
