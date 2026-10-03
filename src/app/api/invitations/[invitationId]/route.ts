import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { currentUser } from "@/lib/session";
import { getAdmin } from "@/lib/firebase-admin";

/**
 * PATCH /api/invitations/[invitationId]
 * Body: { action: "accept" | "decline", companyId: string }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invitationId } = await params;
  const { action, companyId } = await req.json();

  if (!["accept", "decline"].includes(action) || !companyId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { db } = getAdmin();
  const inviteRef = db.doc(
    `companies/${companyId}/invitations/${invitationId}`,
  );
  const companyRef = db.doc(`companies/${companyId}`);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [invite, company, member] = await Promise.all([
        tx.get(inviteRef),
        tx.get(companyRef),
        tx.get(companyRef.collection("members").doc(user.uid)),
      ]);

      if (!invite.exists) return { error: "Invitation not found", status: 404 };
      if (!company.exists) return { error: "Company not found", status: 404 };

      const data = invite.data()!;

      // Verify this invitation belongs to the current user's email
      const normalized = user.email?.trim().toLowerCase() ?? "";
      if (data.email !== normalized) {
        return {
          error: "This invitation is not for your account",
          status: 403,
        };
      }
      if (data.status !== "pending") {
        return { error: `Invitation already ${data.status}`, status: 409 };
      }

      // Check expiry
      const expires = data.expiresAt as Timestamp | undefined;
      if (expires && expires.toDate().getTime() < Date.now()) {
        tx.update(inviteRef, {
          status: "expired",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { error: "Invitation has expired", status: 410 };
      }

      if (action === "decline") {
        tx.update(inviteRef, {
          status: "declined",
          declinedBy: user.uid,
          declinedAt: FieldValue.serverTimestamp(),
        });
        return { ok: true, action: "declined" };
      }

      // Accept
      if (member.exists && member.data()?.status === "active") {
        tx.update(inviteRef, {
          status: "accepted",
          acceptedBy: user.uid,
          acceptedAt: FieldValue.serverTimestamp(),
        });
        return { ok: true, action: "already_member" };
      }

      const c = company.data()!;
      const membership = {
        companyId,
        companyName: c.name,
        role: data.role ?? "employee",
        status: "active",
        departmentIds: data.departmentIds ?? [],
        permissions: data.permissions ?? {},
        crmPermissions: data.crmPermissions ?? {},
        enabledModules: c.enabledModules ?? [],
        userId: user.uid,
        email: normalized,
        displayName: user.name ?? normalized,
        employmentType: data.role ?? "employee",
        createdAt: FieldValue.serverTimestamp(),
      };

      tx.create(companyRef.collection("members").doc(user.uid), membership);
      tx.set(db.doc(`users/${user.uid}/companyMemberships/${companyId}`), {
        companyId,
        companyName: c.name,
        role: membership.role,
        status: "active",
        departmentIds: membership.departmentIds,
        permissions: membership.permissions,
        crmPermissions: membership.crmPermissions,
        enabledModules: membership.enabledModules,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(inviteRef, {
        status: "accepted",
        acceptedBy: user.uid,
        acceptedAt: FieldValue.serverTimestamp(),
      });

      // Welcome notification
      const noteRef = companyRef.collection("notifications").doc();
      tx.create(noteRef, {
        companyId,
        recipientId: user.uid,
        eventType: "company.invitation_accepted",
        title: `Welcome to ${c.name}`,
        message: `Your ${membership.role} membership is now active.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      return { ok: true, action: "accepted" };
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
