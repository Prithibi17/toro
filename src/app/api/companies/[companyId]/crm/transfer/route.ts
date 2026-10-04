import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { z } from "zod";
import { crmAccess, crmError, CrmError, privileged } from "@/lib/crm-server";
import { crmList } from "@/lib/crm-list";
import { parseCrmQuery, sortCrmRecords } from "@/lib/crm-query";
import { opportunityInput } from "@/lib/crm-model";
import { createOpportunity, updateOpportunity } from "@/lib/crm-opportunities";
import { getAdmin } from "@/lib/firebase-admin";
import { appendAudit } from "@/lib/audit";
export const maxDuration = 60;
const input = z.object({
  action: z.enum(["preview", "import", "export"]),
  filename: z.string().max(200).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).max(1000).optional(),
  jobId: z
    .string()
    .regex(/^[^/]+$/)
    .optional(),
  duplicatePolicy: z.enum(["skip", "update"]).default("skip"),
  query: z.record(z.string(), z.string()).optional(),
  ids: z.array(z.string()).max(1000).optional(),
  fields: z.array(z.string()).max(50).optional(),
});
const fields = [
  "id",
  "name",
  "customerName",
  "customerId",
  "email",
  "phone",
  "value",
  "currency",
  "probability",
  "priority",
  "stageId",
  "ownerName",
  "ownerId",
  "salesTeamId",
  "tags",
  "nextActivityTitle",
  "createdAt",
  "expectedCloseDate",
  "closedAt",
  "lostReasonId",
  "city",
  "country",
  "source",
  "medium",
  "campaign",
  "description",
];
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params,
      access = await crmAccess(companyId),
      data = input.parse(await req.json()),
      db = getAdmin().db;
    if (
      !privileged(
        access,
        data.action === "export" ? "crm.export" : "crm.import",
      )
    )
      throw new CrmError("Import/export permission required", 403);
    if (data.action === "export") {
      const query = parseCrmQuery(data.query ?? {});
      let list = await crmList(companyId, query),
        scannedPages = 1;
      const records = [...list.records];
      while (list.nextCursor && scannedPages < 10) {
        list = await crmList(companyId, query, list.nextCursor);
        records.push(...list.records);
        scannedPages++;
      }
      if (list.nextCursor)
        throw new CrmError(
          "This export exceeds the 10,000-record scan limit. Narrow it by salesperson; no partial export was produced.",
        );
      const chosen = data.fields?.length ? data.fields : fields;
      if (chosen.some((f) => !fields.includes(f)))
        throw new CrmError("Invalid export fields");
      const selected = data.ids?.length
        ? records.filter((r) => data.ids!.includes(r.id))
        : records;
      await appendAudit(db, companyId, {
        actorId: access.user.uid,
        action: "crm.export",
        entityType: "opportunity",
        entityId: "filtered",
        metadata: { count: selected.length },
      });
      return NextResponse.json({
        rows: sortCrmRecords(selected, query).map((row) =>
          Object.fromEntries(chosen.map((f) => [f, row[f] ?? ""])),
        ),
      });
    }
    if (data.action === "preview") {
      const list = await crmList(companyId);
      const rows = data.rows ?? [];
      if (!rows.length) throw new CrmError("No rows to import");
      const seen = new Set<string>();
      const results = rows.map((raw, index) => {
        const mapped = { ...raw };
        for (const key of ["priority", "probability", "value"])
          if (mapped[key] !== undefined) mapped[key] = Number(mapped[key]);
        if (typeof mapped.tags === "string")
          mapped.tags = mapped.tags
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
        for (const [key, items] of [
          ["stageId", list.stages],
          ["ownerId", list.members],
          ["salesTeamId", list.teams],
          ["customerId", list.contacts],
        ] as const) {
          if (!mapped[key]) {
            if (key !== "stageId")
              mapped[key] = key === "ownerId" ? access.user.uid : null;
            continue;
          }
          const match = items.find(
            (item) =>
              item.id === mapped[key] ||
              String(
                (item as Record<string, unknown>).name ??
                  (item as Record<string, unknown>).displayName,
              ).toLowerCase() === String(mapped[key]).toLowerCase(),
          );
          if (match) mapped[key] = match.id;
        }
        const parsed = opportunityInput.safeParse({
          ...mapped,
          currency: list.currency,
        });
        const errors = parsed.success
          ? []
          : parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message);
        if (!list.stages.some((s) => s.id === mapped.stageId))
          errors.push("stageId: unknown stage");
        if (
          mapped.ownerId &&
          !list.members.some((m) => m.id === mapped.ownerId)
        )
          errors.push("ownerId: unknown salesperson");
        if (
          mapped.salesTeamId &&
          !list.teams.some(
            (team) => team.id === mapped.salesTeamId && team.active !== false,
          )
        )
          errors.push("salesTeamId: unknown or inactive team");
        if (
          mapped.customerId &&
          !list.contacts.some((contact) => contact.id === mapped.customerId)
        )
          errors.push("customerId: unknown or inaccessible customer");
        if (
          list.stages.find((stage) => stage.id === mapped.stageId)
            ?.stageType === "LOST" &&
          !list.lostReasons.some((reason) => reason.id === mapped.lostReasonId)
        )
          errors.push(
            "lostReasonId: select a valid reason for a lost opportunity",
          );
        const fingerprint = createHash("sha256")
          .update(
            [
              String(mapped.name).trim().toLowerCase(),
              String(mapped.email ?? "").toLowerCase(),
              String(mapped.customerId ?? ""),
            ].join("|"),
          )
          .digest("hex");
        if (seen.has(fingerprint)) errors.push("Duplicate row in this file");
        seen.add(fingerprint);
        return {
          row: index + 2,
          data: parsed.success ? parsed.data : mapped,
          errors,
          warnings: [] as string[],
          fingerprint,
        };
      });
      const job = db.collection(`companies/${companyId}/crmImportJobs`).doc();
      const batch = db.batch();
      batch.create(job, {
        companyId,
        userId: access.user.uid,
        filename: data.filename ?? "Import",
        status: "preparing",
        total: rows.length,
        createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      for (let i = 0; i < results.length; i += 200) {
        const b = db.batch();
        results
          .slice(i, i + 200)
          .forEach((r) =>
            b.create(job.collection("rows").doc(String(r.row)), r),
          );
        await b.commit();
      }
      await job.update({ status: "preview" });
      return NextResponse.json({
        jobId: job.id,
        rows: results,
        totals: {
          valid: results.filter((r) => !r.errors.length).length,
          invalid: results.filter((r) => r.errors.length).length,
          warnings: 0,
        },
      });
    }
    if (!data.jobId) throw new CrmError("Preview the import first");
    const job = db.doc(`companies/${companyId}/crmImportJobs/${data.jobId}`),
      jobDoc = await job.get();
    if (!jobDoc.exists || jobDoc.data()?.userId !== access.user.uid)
      throw new CrmError("Import job not found", 404);
    await db.runTransaction(async (tx) => {
      const current = await tx.get(job),
        state = current.data()!;
      if (state.status === "preparing")
        throw new CrmError("Preview is still preparing", 409);
      if (Number(state.leaseUntil ?? 0) > Date.now())
        throw new CrmError(
          "This import is already running. Retry shortly.",
          409,
        );
      if (
        state.duplicatePolicy &&
        state.duplicatePolicy !== data.duplicatePolicy
      )
        throw new CrmError(
          "Keep the original duplicate policy when resuming an import",
          409,
        );
      tx.update(job, {
        leaseUntil: Date.now() + 120000,
        duplicatePolicy: data.duplicatePolicy,
      });
    });
    try {
      const rows = await job.collection("rows").get();
      let created = 0,
        updated = 0,
        skipped = 0,
        failed = 0;
      // Process a bounded slice per request. Repeating the same job resumes safely.
      const pending = rows.docs.filter((d) => !d.data().result).slice(0, 20);
      for (const rowDoc of pending) {
        const row = rowDoc.data();
        if (row.errors.length) {
          await rowDoc.ref.update({ result: "invalid" });
          continue;
        }
        try {
          const id = "import_" + row.fingerprint;
          const existing = await db
            .doc(`companies/${companyId}/crmOpportunities/${id}`)
            .get();
          const sameName = await db
            .collection(`companies/${companyId}/crmOpportunities`)
            .where("name", "==", row.data.name)
            .limit(10)
            .get();
          const duplicate = existing.exists
            ? existing
            : sameName.docs.find(
                (d) =>
                  (d.data().email ?? "") === (row.data.email ?? "") &&
                  (d.data().customerId ?? null) ===
                    (row.data.customerId ?? null),
              );
          if (duplicate && data.duplicatePolicy === "skip") {
            skipped++;
            await rowDoc.ref.update({ result: "skipped" });
          } else if (duplicate) {
            await updateOpportunity(companyId, duplicate.id, access, {
              ...row.data,
              expectedVersion: Number(duplicate.data()?.version ?? 0),
            });
            updated++;
            await rowDoc.ref.update({ result: "updated" });
          } else {
            await createOpportunity(companyId, access, row.data, id);
            created++;
            await rowDoc.ref.update({ result: "created" });
          }
        } catch (e) {
          failed++;
          await rowDoc.ref.update({
            result: "failed",
            error: e instanceof Error ? e.message : "Import failed",
          });
        }
      }
      const all = await job.collection("rows").get();
      const counts = {
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        invalid: 0,
      };
      for (const r of all.docs) {
        const status = r.data().result as keyof typeof counts;
        if (status in counts) counts[status]++;
      }
      const done = all.docs.every((r) => r.data().result);
      await job.update({
        status: done ? "completed" : "running",
        ...counts,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (done)
        await appendAudit(db, companyId, {
          actorId: access.user.uid,
          action: "crm.import",
          entityType: "import",
          entityId: job.id,
          metadata: counts,
        });
      return NextResponse.json({
        ...counts,
        done,
        remaining: all.docs.filter((r) => !r.data().result).length,
        jobId: job.id,
        processed: created + updated + skipped + failed,
      });
    } finally {
      await job.update({ leaseUntil: 0 });
    }
  } catch (e) {
    return crmError(e);
  }
}
