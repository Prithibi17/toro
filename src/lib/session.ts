import { cookies } from "next/headers";
import { cache } from "react";
import { getAdmin } from "./firebase-admin";
import type { Membership, SessionUser } from "./types";
import { accessExpired } from "./permission-engine";
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const token = (await cookies()).get("toro_session")?.value;
    if (!token) return null;
    // Session cookies are signed and still fully verified locally. Avoiding the
    // remote revocation lookup on every route makes workspace navigation fast;
    // explicit logout continues to remove the cookie immediately.
    const decoded = await getAdmin().auth.verifySessionCookie(token, false);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
    };
  } catch {
    return null;
  }
});
export async function memberships(uid: string): Promise<Membership[]> {
  const { db } = getAdmin();
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("companyMemberships")
    .where("status", "==", "active")
    .get();
  return snap.docs.map((d) => ({ companyId: d.id, ...d.data() }) as Membership);
}
export async function requireMembership(companyId: string) {
  const user = await currentUser();
  if (!user) return null;
  const { db } = getAdmin();
  const doc = await db.doc(`companies/${companyId}/members/${user.uid}`).get();
  if (!doc.exists || doc.data()?.status !== "active") return null;
  const membership = doc.data() as Membership;
  if (accessExpired(membership)) return null;
  return { user, membership };
}
