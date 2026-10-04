"use client";
import { useState } from "react";
import { Field, Modal, crmRequest } from "./crm-controls";
import { readCrmFile, downloadCrmFile } from "@/lib/crm-spreadsheet";
const fields = [
  "name",
  "customerId",
  "email",
  "phone",
  "value",
  "probability",
  "priority",
  "ownerId",
  "salesTeamId",
  "stageId",
  "tags",
  "city",
  "country",
  "source",
  "medium",
  "campaign",
  "expectedCloseDate",
  "description",
];
export function CrmTransfer({
  companyId,
  mode,
  query,
  selectedIds,
  close,
  done,
}: {
  companyId: string;
  mode: "import" | "export";
  query: Record<string, string>;
  selectedIds: string[];
  close: () => void;
  done: () => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [filename, setFilename] = useState(""),
    [preview, setPreview] = useState<{
      jobId: string;
      rows: { row: number; errors: string[]; warnings: string[] }[];
      totals: { valid: number; invalid: number };
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [summary, setSummary] = useState(""),
    [format, setFormat] = useState<"csv" | "xlsx">("xlsx"),
    [chosen, setChosen] = useState([
      "name",
      "value",
      "probability",
      "priority",
      "ownerName",
      "customerName",
    ]),
    [scope, setScope] = useState("filtered"),
    [policy, setPolicy] = useState("skip");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={
        mode === "import" ? "Import opportunities" : "Export opportunities"
      }
      close={close}
    >
      <div className="space-y-4">
        {mode === "import" ? (
          <>
            <p className="text-sm muted">
              CSV or XLSX, up to 1,000 rows and 5 MB. Select existing contacts,
              stages and salespeople by ID or exact name.
            </p>
            <input
              type="file"
              accept=".csv,.xlsx"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void run(async () => {
                    setRows(await readCrmFile(file));
                    setFilename(file.name);
                    setPreview(null);
                    setMapping({});
                  });
              }}
            />
            {rows.length > 0 && (
              <>
                <p>
                  {filename} · {rows.length} rows
                </p>
                <div className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
                  {Object.keys(rows[0]).map((column) => (
                    <Field key={column} label={column}>
                      <select
                        className="input"
                        value={
                          mapping[column] ??
                          (fields.includes(column) ? column : "")
                        }
                        onChange={(e) => {
                          setMapping((m) => ({
                            ...m,
                            [column]: e.target.value,
                          }));
                          setPreview(null);
                        }}
                      >
                        <option value="">Ignore column</option>
                        {fields.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </Field>
                  ))}
                </div>
                <div className="max-h-32 overflow-auto rounded border border-[var(--border)] p-2 text-xs">
                  <pre>{JSON.stringify(rows.slice(0, 3), null, 2)}</pre>
                </div>
                <button
                  disabled={busy}
                  className="btn btn-secondary"
                  onClick={() =>
                    void run(async () => {
                      const mapped = rows.map((row) =>
                        Object.fromEntries(
                          Object.entries(row).flatMap(([key, value]) => {
                            const field =
                              mapping[key] ?? (fields.includes(key) ? key : "");
                            return field ? [[field, value]] : [];
                          }),
                        ),
                      );
                      setPreview(
                        await crmRequest(
                          `/api/companies/${companyId}/crm/transfer`,
                          "POST",
                          { action: "preview", filename, rows: mapped },
                        ),
                      );
                    })
                  }
                >
                  Validate mapped rows
                </button>
              </>
            )}
            {preview && (
              <>
                <p>
                  {preview.totals.valid} valid · {preview.totals.invalid}{" "}
                  invalid
                </p>
                <div className="max-h-48 overflow-auto text-sm text-red-500">
                  {preview.rows
                    .filter((r) => r.errors.length)
                    .map((r) => (
                      <p key={r.row}>
                        Row {r.row}: {r.errors.join("; ")}
                      </p>
                    ))}
                </div>
                <Field label="Duplicate handling">
                  <select
                    className="input"
                    value={policy}
                    onChange={(e) => setPolicy(e.target.value)}
                  >
                    <option value="skip">Skip existing opportunities</option>
                    <option value="update">
                      Update existing opportunities
                    </option>
                  </select>
                </Field>
                <button
                  disabled={busy || !preview.totals.valid}
                  className="btn btn-primary"
                  onClick={() =>
                    void run(async () => {
                      let result;
                      do {
                        result = await crmRequest(
                          `/api/companies/${companyId}/crm/transfer`,
                          "POST",
                          {
                            action: "import",
                            jobId: preview.jobId,
                            duplicatePolicy: policy,
                          },
                        );
                        setSummary(
                          `Created ${result.created}, updated ${result.updated}, skipped ${result.skipped}, failed ${result.failed}, invalid ${result.invalid}. ${result.remaining} remaining.`,
                        );
                      } while (!result.done);
                      done();
                    })
                  }
                >
                  Import {preview.totals.valid} valid rows
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <Field label="Scope">
              <select
                className="input"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="filtered">
                  All filtered, authorized records
                </option>
                <option value="selected" disabled={!selectedIds.length}>
                  Selected records ({selectedIds.length})
                </option>
              </select>
            </Field>
            <Field label="Format">
              <select
                className="input"
                value={format}
                onChange={(e) => setFormat(e.target.value as typeof format)}
              >
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">CSV</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              {[
                ...fields,
                "ownerName",
                "customerName",
                "createdAt",
                "closedAt",
              ].map((f) => (
                <label key={f} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={chosen.includes(f)}
                    onChange={(e) =>
                      setChosen((c) =>
                        e.target.checked ? [...c, f] : c.filter((v) => v !== f),
                      )
                    }
                  />
                  {f}
                </label>
              ))}
            </div>
            <button
              disabled={busy || !chosen.length}
              className="btn btn-primary"
              onClick={() =>
                void run(async () => {
                  const result = await crmRequest(
                    `/api/companies/${companyId}/crm/transfer`,
                    "POST",
                    {
                      action: "export",
                      query,
                      fields: chosen,
                      ...(scope === "selected" ? { ids: selectedIds } : {}),
                    },
                  );
                  await downloadCrmFile(
                    result.rows,
                    format,
                    "Toro opportunities",
                  );
                  setSummary(`Exported ${result.rows.length} records.`);
                })
              }
            >
              Download export
            </button>
          </>
        )}
        {busy && <p role="status">Processing…</p>}
        {summary && <p role="status">{summary}</p>}
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
