import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { currentUser, memberships } from "@/lib/session";
import { getAdmin } from "@/lib/firebase-admin";
import { companySchema } from "@/lib/validation";
import { MODULES } from "@/lib/types";
import { createDefaultCrmStages } from "@/lib/crm-defaults";

export async function GET() {
  const user = await currentUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const list = await memberships(user.uid);
  return NextResponse.json({
    companies: list.map((membership) => ({
      id: membership.companyId,
      name: membership.companyName,
      role: membership.role,
    })),
  });
}
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  try {
    const input = companySchema.parse(await req.json());
    const allowed = new Set(MODULES.map((m) => m.key));
    if (input.modules.some((m) => !allowed.has(m as never)))
      return NextResponse.json({ error: "Unknown module" }, { status: 400 });
    const { db } = getAdmin();
    const companyRef = db.collection("companies").doc();
    const memberRef = companyRef.collection("members").doc(user.uid);
    const mirrorRef = db.doc(
      `users/${user.uid}/companyMemberships/${companyRef.id}`,
    );
    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      tx.create(companyRef, {
        name: input.name,
        businessCategory: input.businessCategory,
        description: input.description,
        country: input.country,
        city: input.city,
        currency: input.currency,
        timezone: input.timezone,
        enabledModules: input.modules,
        ownerId: user.uid,
        status: "active",
        onboardingCompleted: true,
        createdAt: now,
        updatedAt: now,
      });
      const membership = {
        companyId: companyRef.id,
        companyName: input.name,
        role: "owner",
        employmentType: "owner",
        status: "active",
        enabledModules: input.modules,
        permissions: {
          "company.manage": "all",
          "members.manage": "all",
          "permissions.manage": "all",
        },
        createdAt: now,
      };
      tx.create(memberRef, {
        ...membership,
        userId: user.uid,
        email: user.email ?? null,
        displayName: user.name ?? null,
      });
      tx.create(mirrorRef, membership);
      for (const name of input.departments) {
        const ref = companyRef.collection("departments").doc();
        tx.create(ref, {
          name,
          memberIds: [],
          createdAt: now,
          createdBy: user.uid,
        });
      }
      for (const invite of input.invitations) {
        const ref = companyRef.collection("invitations").doc();
        tx.create(ref, {
          ...invite,
          email: invite.email.toLowerCase(),
          status: "pending",
          role: "employee",
          createdAt: now,
          createdBy: user.uid,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        });
      }
      if (input.modules.includes("crm"))
        createDefaultCrmStages(db, companyRef.id, user.uid, tx);
    });
    return NextResponse.json({ companyId: companyRef.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create company" },
      { status: 400 },
    );
  }
}
