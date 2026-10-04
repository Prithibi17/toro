import { describe, expect, it } from "vitest";
import { csvCell, parseCsv } from "./crm-spreadsheet";
describe("CRM spreadsheet boundaries", () => {
  it("parses BOM, escaped quotes, commas and multiline cells", () => {
    expect(
      parseCsv(
        '\uFEFFname,description\r\n"Alpha, Inc","Line 1\nSay ""hello"""',
      ),
    ).toEqual([{ name: "Alpha, Inc", description: 'Line 1\nSay "hello"' }]);
  });
  it("rejects ambiguous or truncated CSV input", () => {
    expect(() => parseCsv("name,name\na,b")).toThrow("unique");
    expect(() => parseCsv('name\n"unfinished')).toThrow("Unclosed");
  });
  it("neutralizes spreadsheet formulas on export", () => {
    for (const value of ["=1+1", "+cmd", "-1+2", "@sum(A1)", "\tformula"])
      expect(csvCell(value)).toBe("\"'" + value + '"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});
