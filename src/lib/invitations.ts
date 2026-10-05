import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdmin } from "./firebase-admin";

async function pendingInvitationsForEmail(
  db: FirebaseFirestore.Firestore,
  normalizedEmail: string,
) {
  try {
    return (
      await db
        .collectionGroup("invitations")
        .where("email", "==", normalizedEmail)
        .where("status", "==", "pending")
        .get()
    ).docs;
  } catch {
    // A newly configured Firebase project may not have deployed the optional
    // collection-group composite index yet. Fall back to ordinary collection
    // queries so account activation is never dependent on that deployment.
    const companies = await db.collection("companies").select().get();
    const matches = await Promise.all(
      companies.docs.map((company) =>
        company.ref
          .collection("invitations")
          .where("email", "==", normalizedEmail)
          .limit(20)
          .get(),
      ),
    );
    return matches.flatMap((snapshot) =>
      snapshot.docs.filter((invite) => invite.data().status === "pending"),
    );
  }
}

export async function activatePendingInvitations(
  uid: string,
  email: string | undefined,
  emailVerified: boolean,
) {
  if (!email || !emailVerified) return 0;
  const { db } = getAdmin();
  const normalized = email.trim().toLowerCase();
  const invitations = await pendingInvitationsForEmail(db, normalized);
  let activated = 0;
  for (const inviteSnap of invitations) {
    const companyRef = inviteSnap.ref.parent.parent;
    if (!companyRef) continue;
    const companyId = companyRef.id;
    const didActivate = await db.runTransaction(async (tx) => {
      const [invite, company, member] = await Promise.all([
        tx.get(inviteSnap.ref),
        tx.get(companyRef),
        tx.get(companyRef.collection("members").doc(uid)),
      ]);
      if (
        !invite.exists ||
        invite.data()?.status !== "pending" ||
        !company.exists
      )
        return false;
      const data = invite.data()!;
      const expires = data.expiresAt as Timestamp | Date | undefined;
      const expiry = expires instanceof Timestamp ? expires.toDate() : expires;
      if (expiry && expiry.getTime() < Date.now()) {
        tx.update(inviteSnap.ref, {
          status: "expired",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return false;
      }
      if (member.exists) {
        tx.update(inviteSnap.ref, {
          status: "accepted",
          acceptedBy: uid,
          acceptedAt: FieldValue.serverTimestamp(),
        });
        return false;
      }
      const c = company.data()!;
      const membership = {
        companyId,
        companyName: c.name,
        role: data.role || "employee",
        userType: data.userType || "internal",
        roleIds: data.roleIds || [],
        permissionVersion: data.permissionVersion || 1,
        status: "active",
        departmentIds: data.departmentIds || [],
        permissions: data.permissions || {},
        crmPermissions: data.crmPermissions || {},
        enabledModules: c.enabledModules || [],
        createdAt: FieldValue.serverTimestamp(),
      };
      tx.create(companyRef.collection("members").doc(uid), {
        ...membership,
        userId: uid,
        email: normalized,
        displayName: data.displayName || data.name || normalized,
        employmentType: data.role || "employee",
      });
      tx.set(
        db.doc(`users/${uid}/companyMemberships/${companyId}`),
        membership,
      );
      tx.update(inviteSnap.ref, {
        status: "accepted",
        acceptedBy: uid,
        acceptedAt: FieldValue.serverTimestamp(),
      });
      const note = companyRef.collection("notifications").doc();
      tx.create(note, {
        companyId,
        recipientId: uid,
        eventType: "company.invitation_accepted",
        title: `Welcome to ${c.name}`,
        message: `Your ${membership.role} membership is now active.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (didActivate) activated++;
  }
  return activated;
}
