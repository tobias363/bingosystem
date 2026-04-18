/**
 * BIN-588: CSV export + import round-trip tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  exportCsv,
  exportCsvForExcelNo,
  type CsvColumn,
} from "./csvExport.js";
import { parseCsv, parseCsvRaw } from "./csvImport.js";

interface Tx {
  id: string;
  account: string;
  amount: number;
  reason: string;
  createdAt: Date;
}

const TX_COLUMNS: CsvColumn<Tx>[] = [
  { header: "id", accessor: (r) => r.id },
  { header: "account", accessor: (r) => r.account },
  { header: "amount", accessor: (r) => r.amount },
  { header: "reason", accessor: (r) => r.reason },
  { header: "createdAt", accessor: (r) => r.createdAt },
];

// ── Export ─────────────────────────────────────────────────────────────────

test("BIN-588 exportCsv: writes header + rows with default comma separator", () => {
  const rows: Tx[] = [
    { id: "t1", account: "a1", amount: 100, reason: "DEPOSIT", createdAt: new Date("2026-04-18T10:00:00Z") },
    { id: "t2", account: "a2", amount: -50, reason: "WITHDRAW", createdAt: new Date("2026-04-18T11:00:00Z") },
  ];
  const csv = exportCsv(rows, TX_COLUMNS);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "id,account,amount,reason,createdAt");
  assert.equal(lines[1], "t1,a1,100,DEPOSIT,2026-04-18T10:00:00.000Z");
  assert.equal(lines[2], "t2,a2,-50,WITHDRAW,2026-04-18T11:00:00.000Z");
});

test("BIN-588 exportCsv: quotes fields containing separator / quote / newline", () => {
  const rows = [
    { msg: "hei, du" },
    { msg: `hun sa "hei"` },
    { msg: "line1\nline2" },
  ];
  const csv = exportCsv(rows, [{ header: "msg", accessor: (r) => r.msg }]);
  const lines = csv.split("\r\n");
  assert.equal(lines[1], `"hei, du"`);
  assert.equal(lines[2], `"hun sa ""hei"""`);
  // Line with newline spans two output lines — check by parsing it back.
  const roundtrip = parseCsvRaw(csv);
  assert.equal(roundtrip[3][0], "line1\nline2");
});

test("BIN-588 exportCsv: escapes formula-injection prefixes (=, +, -, @)", () => {
  const rows = [
    { v: "=SUM(A1:A10)" },
    { v: "+1234" },
    { v: "-55" },
    { v: "@cmd" },
    { v: "normal" },
  ];
  const csv = exportCsv(rows, [{ header: "v", accessor: (r) => r.v }]);
  const lines = csv.split("\r\n");
  assert.equal(lines[1], "'=SUM(A1:A10)");
  assert.equal(lines[2], "'+1234");
  // "-55" quoted because the leading apostrophe changes the cell text.
  // Actually the apostrophe doesn't introduce a separator/quote so it
  // shouldn't be quoted. Check the literal.
  assert.equal(lines[3], "'-55");
  assert.equal(lines[4], "'@cmd");
  assert.equal(lines[5], "normal");
});

test("BIN-588 exportCsvForExcelNo: semicolon separator + UTF-8 BOM", () => {
  const rows = [{ name: "Ærlig", amount: 1 }];
  const csv = exportCsvForExcelNo(rows, [
    { header: "name", accessor: (r) => r.name },
    { header: "amount", accessor: (r) => r.amount },
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff, "leading BOM");
  assert.match(csv, /name;amount/);
  assert.match(csv, /Ærlig;1/);
});

test("BIN-588 exportCsv: null/undefined render as empty cells", () => {
  const csv = exportCsv(
    [{ a: null, b: undefined, c: 0 }] as const,
    [
      { header: "a", accessor: (r) => r.a as null },
      { header: "b", accessor: (r) => r.b as undefined },
      { header: "c", accessor: (r) => r.c },
    ],
  );
  assert.match(csv, /a,b,c\r\n,,0\r\n/);
});

test("BIN-588 exportCsv: empty row list still writes the header", () => {
  const csv = exportCsv([], [{ header: "x", accessor: () => "" }]);
  assert.equal(csv, "x\r\n");
});

// ── Import ─────────────────────────────────────────────────────────────────

test("BIN-588 parseCsv: header mode + comma separator", () => {
  const { headers, rows, separator } = parseCsv("id,name\n1,Kari\n2,Ole\n");
  assert.deepEqual(headers, ["id", "name"]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { id: "1", name: "Kari" });
  assert.deepEqual(rows[1], { id: "2", name: "Ole" });
  assert.equal(separator, ",");
});

test("BIN-588 parseCsv: auto-detects semicolon separator", () => {
  const { rows, separator } = parseCsv("id;name\n1;Kari\n");
  assert.equal(separator, ";");
  assert.deepEqual(rows[0], { id: "1", name: "Kari" });
});

test("BIN-588 parseCsv: auto-detects tab separator", () => {
  const { rows, separator } = parseCsv("id\tname\n1\tKari\n");
  assert.equal(separator, "\t");
  assert.deepEqual(rows[0], { id: "1", name: "Kari" });
});

test("BIN-588 parseCsv: strips UTF-8 BOM", () => {
  const text = `\uFEFFid,name\n1,Kari\n`;
  const { headers, rows } = parseCsv(text);
  assert.deepEqual(headers, ["id", "name"]);
  assert.equal(rows[0].name, "Kari");
});

test("BIN-588 parseCsv: handles quoted fields with separator + newline + doubled quotes", () => {
  const text = `msg\n"hei, du"\n"hun sa ""hei"""\n"line1\nline2"\n`;
  const { rows } = parseCsv(text);
  assert.equal(rows[0].msg, "hei, du");
  assert.equal(rows[1].msg, `hun sa "hei"`);
  assert.equal(rows[2].msg, "line1\nline2");
});

test("BIN-588 parseCsv: optional trim removes surrounding whitespace", () => {
  const { rows } = parseCsv("a,b\n  1  ,  Kari  \n", { trim: true });
  assert.deepEqual(rows[0], { a: "1", b: "Kari" });
});

test("BIN-588 parseCsv: rows shorter than header get empty strings", () => {
  const { rows } = parseCsv("a,b,c\n1,2\n");
  assert.deepEqual(rows[0], { a: "1", b: "2", c: "" });
});

test("BIN-588 parseCsv: header=false synthesises col_N names", () => {
  const { headers, rows } = parseCsv("1,Kari\n2,Ole\n", { header: false });
  assert.deepEqual(headers, ["col_1", "col_2"]);
  assert.deepEqual(rows[0], { col_1: "1", col_2: "Kari" });
});

test("BIN-588 parseCsv: empty input returns empty result", () => {
  const { headers, rows } = parseCsv("");
  assert.deepEqual(headers, []);
  assert.deepEqual(rows, []);
});

test("BIN-588 parseCsv: throws on unterminated quote", () => {
  assert.throws(() => parseCsv(`a\n"unterminated`), /unterminated/);
});

test("BIN-588 parseCsvRaw: returns all rows as arrays (no header magic)", () => {
  const rows = parseCsvRaw("a,b\n1,2\n3,4\n");
  assert.deepEqual(rows, [["a", "b"], ["1", "2"], ["3", "4"]]);
});

// ── Round-trip ─────────────────────────────────────────────────────────────

test("BIN-588 round-trip: export then parse yields identical cell content", () => {
  const rows: Record<string, string>[] = [
    { id: "1", name: `Kari, "queen" of bingo`, note: "multi\nline" },
    { id: "2", name: "Ole", note: "" },
    { id: "3", name: "Ærlig", note: "æøå" },
  ];
  const cols: CsvColumn<Record<string, string>>[] = [
    { header: "id", accessor: (r) => r.id },
    { header: "name", accessor: (r) => r.name },
    { header: "note", accessor: (r) => r.note },
  ];
  const csv = exportCsv(rows, cols);
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed.headers, ["id", "name", "note"]);
  assert.equal(parsed.rows.length, 3);
  for (let i = 0; i < rows.length; i += 1) {
    assert.deepEqual(parsed.rows[i], rows[i]);
  }
});

test("BIN-588 round-trip (Excel-NO): semicolon + BOM survives parseCsv", () => {
  const rows = [{ name: "Ærlig", amount: "1,50" }];
  const csv = exportCsvForExcelNo(rows, [
    { header: "name", accessor: (r) => r.name },
    { header: "amount", accessor: (r) => r.amount },
  ]);
  const parsed = parseCsv(csv);
  assert.equal(parsed.separator, ";");
  assert.deepEqual(parsed.rows[0], { name: "Ærlig", amount: "1,50" });
});
