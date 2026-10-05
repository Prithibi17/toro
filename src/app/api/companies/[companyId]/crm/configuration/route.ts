import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import {
  crmAccess,
  crmError,
  demand,
  plainDoc,
  CrmError,
} from "@/lib/crm-server";
import { getAdmin } from "@/lib/firebase-admin";
import { appendAudit } from "@/lib/audit";
import { parseCrmQuery } from "@/lib/crm-query";
const collections = {
  stages: "crmPipelineStages",
  teams: "crmSalesTeams",
  tags: "crmTags",
  lostReasons: "crmLostReasons",
  favorites: "crmSavedSearches",
} as const;
const input = z
  .object({
    kind: z.enum(["stages", "teams", "tags", "lostReasons", "favorites"]),
    id: z
      .string()
      .regex(/^[^/]+$/)
      .optional(),
    name: z.string().trim().min(1).max(120),
    stageType: z.enum(["OPEN", "WON", "LOST"]).optional(),
    probability: z.coerce.number().min(0).max(100).optional(),
    sequence: z.coerce.number().int().min(0).max(1000).optional(),
    folded: z.boolean().optional(),
    active: z.boolean().optional(),
    memberIds: z
      .array(z.string().regex(/^[^/]+$/))
      .max(100)
      .optional(),
    query: z.record(z.string(), z.string()).optional(),
  })
  .strict();
type Context = { params: Promise<{ companyId: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    const { companyId } = await params,
      access = await crmAccess(companyId),
      db = getAdmin().db;
    demand(access, "pipelines", "manage");
    const result: Record<string, unknown> = {};
    await Promise.all(
      Object.entries(collections)
        .filter(([k]) => k !== "favorites")
        .map(async ([key, col]) => {
          result[key] = (
            await db.collection(`companies/${companyId}/${col}`).get()
          ).docs.map(plainDoc);
        }),
    );
    return NextResponse.json(result);
  } catch (e) {
    return crmError(e);
  }
}
async function save(req: Request, context: Context, update: boolean) {
  try {
    const { companyId } = await context.params,
      access = await crmAccess(companyId),
      db = getAdmin().db;
    const { kind, id, ...data } = input.parse(await req.json());
    const normalizedName =
      kind === "tags" ? data.name.toLocaleLowerCase() : undefined;
    if (kind !== "favorites") demand(access, "pipelines", "manage");
    if (data.query) data.query = parseCrmQuery(data.query);
    if (update && !id) throw new CrmError("ID required");
    const collection = db.collection(
      `companies/${companyId}/${collections[kind]}`,
    );
    if (kind === "tags" && !update) {
      const existingTags = await collection.limit(500).get(),
        duplicate = existingTags.docs.some(
          (doc) =>
            String(
              doc.data().normalizedName ?? doc.data().name ?? "",
            ).toLocaleLowerCase() === normalizedName,
        );
      if (duplicate)
        throw new CrmError("A tag with this name already exists", 409);
    }
    const ref = update ? collection.doc(id!) : collection.doc();
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (update && !existing.exists)
        throw new CrmError("Record not found", 404);
      if (
        kind === "favorites" &&
        update &&
        existing.data()?.userId !== access.user.uid
      )
        throw new CrmError("Access denied", 403);
      if (data.memberIds) {
        const members = await Promise.all(
          data.memberIds.map((uid) =>
            tx.get(db.doc(`companies/${companyId}/members/${uid}`)),
          ),
        );
        if (members.some((m) => !m.exists || m.data()?.status !== "active"))
          throw new CrmError("Team members must be active");
      }
      if (
        kind === "stages" &&
        update &&
        (data.active === false ||
          (data.stageType && data.stageType !== existing.data()?.stageType))
      ) {
        const linked = await tx.get(
          db
            .collection(`companies/${companyId}/crmOpportunities`)
            .where("stageId", "==", id)
            .limit(1),
        );
        if (!linked.empty)
          throw new CrmError(
            "Move existing opportunities before retiring a stage or changing its outcome",
          );
      }
      const payload = {
        ...data,
        ...(normalizedName ? { normalizedName } : {}),
        companyId,
        ...(!update
          ? {
              active: true,
              createdAt: FieldValue.serverTimestamp(),
              createdBy: access.user.uid,
            }
          : {}),
        ...(kind === "favorites" ? { userId: access.user.uid } : {}),
        ...(kind === "stages"
          ? {
              stageType: data.stageType ?? existing.data()?.stageType ?? "OPEN",
              sequence: data.sequence ?? existing.data()?.sequence ?? 0,
            }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(ref, payload, { merge: true });
      appendAudit(
        db,
        companyId,
        {
          actorId: access.user.uid,
          action: `crm.${kind}_configured`,
          entityType: kind,
          entityId: ref.id,
        },
        tx,
      );
    });
    return NextResponse.json({ record: plainDoc(await ref.get()), id: ref.id });
  } catch (e) {
    return crmError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  return save(req, ctx, false);
}
export async function PATCH(req: Request, ctx: Context) {
  return save(req, ctx, true);
}
