export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("Unclosed quote in CSV");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headers =
    rows.shift()?.map((h) => h.replace(/^\uFEFF/, "").trim()) ?? [];
  if (new Set(headers).size !== headers.length)
    throw new Error("Column headings must be unique");
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])),
  );
}
export async function readCrmFile(
  file: File,
): Promise<Record<string, unknown>[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Maximum file size is 5 MB");
  let rows: Record<string, unknown>[];
  if (file.name.toLowerCase().endsWith(".csv"))
    rows = parseCsv(await file.text());
  else if (file.name.toLowerCase().endsWith(".xlsx")) {
    const { Workbook } = await import("exceljs"),
      book = new Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    const sheet = book.worksheets[0];
    if (!sheet) return [];
    if (sheet.rowCount > 1001)
      throw new Error("Import up to 1,000 rows per job");
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, i) => {
      headers[i - 1] = cell.text.trim();
    });
    if (new Set(headers).size !== headers.length)
      throw new Error("Column headings must be unique");
    rows = [];
    sheet.eachRow((row, i) => {
      if (i === 1) return;
      const record: Record<string, unknown> = {};
      headers.forEach((h, index) => {
        const cell = row.getCell(index + 1);
        record[h] =
          cell.value instanceof Date
            ? cell.value.toISOString().slice(0, 10)
            : typeof cell.value === "number"
              ? cell.value
              : cell.text;
      });
      rows.push(record);
    });
  } else throw new Error("Choose a CSV or XLSX file");
  if (rows.length > 1000) throw new Error("Import up to 1,000 rows per job");
  return rows;
}
export function csvCell(value: unknown) {
  let text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function downloadCrmFile(
  rows: Record<string, unknown>[],
  format: "csv" | "xlsx",
  filename: string,
) {
  const headers = Object.keys(rows[0] ?? {});
  let blob: Blob;
  if (format === "csv")
    blob = new Blob(
      [
        "\uFEFF" +
          [
            headers.map(csvCell).join(","),
            ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(",")),
          ].join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
  else {
    const { Workbook } = await import("exceljs"),
      book = new Workbook(),
      sheet = book.addWorksheet("Opportunities");
    sheet.addRow(headers);
    rows.forEach((row) =>
      sheet.addRow(
        headers.map((h) => {
          const value = row[h];
          return typeof value === "number"
            ? value
            : Array.isArray(value)
              ? value.join(", ")
              : String(value ?? "");
        }),
      ),
    );
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((c) => {
      c.width = 24;
    });
    blob = new Blob([new Uint8Array(await book.xlsx.writeBuffer())], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/\.(csv|xlsx)$/i, "") + "." + format;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
