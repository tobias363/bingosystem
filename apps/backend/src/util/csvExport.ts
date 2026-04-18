/**
 * BIN-588: CSV export helpers.
 *
 * Used for transaction-export to accounting and player-data dumps.
 * RFC 4180-compliant dialect with a configurable separator (commas for
 * international, semicolons for the Norwegian regnskap system which
 * expects semicolons by default because Excel-NO parses those).
 *
 * Zero deps — legacy used `papaparse` for parsing only. Export is
 * straightforward enough to write inline and avoids shipping papaparse
 * just to format rows.
 */

export type CsvValue = string | number | boolean | Date | null | undefined;

export interface CsvColumn<T> {
  /** Header text written to row 1. */
  header: string;
  /** Extract a value from a row object. Must return a scalar. */
  accessor: (row: T) => CsvValue;
}

export interface CsvExportOptions {
  /** Field separator. Default "," — set ";" for Excel-NO / regnskap. */
  separator?: "," | ";" | "\t";
  /** Newline sequence. Default "\r\n" per RFC 4180. */
  newline?: "\r\n" | "\n";
  /** Prepend a UTF-8 BOM so Excel opens Norwegian characters correctly. */
  bom?: boolean;
  /** Quote character. Default '"'. */
  quote?: '"' | "'";
}

const DEFAULT_OPTIONS: Required<CsvExportOptions> = {
  separator: ",",
  newline: "\r\n",
  bom: false,
  quote: '"',
};

function formatValue(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value);
}

function needsQuoting(text: string, separator: string, quote: string): boolean {
  if (text.includes(separator)) return true;
  if (text.includes(quote)) return true;
  if (text.includes("\n") || text.includes("\r")) return true;
  // Excel interprets a leading =, +, -, @ as formulas. Quoting alone
  // isn't enough there — see escapeCell — but at minimum we must quote.
  return false;
}

/**
 * Prefix formula-triggering leading characters with a single quote so
 * Excel treats the cell as text. Guards against CSV-injection, which
 * has been the source of several public security bugs in legacy
 * accounting exports.
 */
function escapeFormula(text: string): string {
  if (text.length === 0) return text;
  const first = text.charAt(0);
  if (first === "=" || first === "+" || first === "-" || first === "@") {
    return `'${text}`;
  }
  return text;
}

function escapeCell(raw: CsvValue, opts: Required<CsvExportOptions>): string {
  // Only apply formula-injection escaping to string inputs. Numbers,
  // Dates, and booleans can't be interpreted as user-controlled
  // formulas, and a leading '-' on a negative number must not gain a
  // spurious apostrophe prefix.
  const formatted = formatValue(raw);
  const text = typeof raw === "string" ? escapeFormula(formatted) : formatted;
  if (!needsQuoting(text, opts.separator, opts.quote)) return text;
  const escaped = text.split(opts.quote).join(opts.quote + opts.quote);
  return `${opts.quote}${escaped}${opts.quote}`;
}

/**
 * Format an array of row objects into a CSV string.
 */
export function exportCsv<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  options?: CsvExportOptions,
): string {
  const opts: Required<CsvExportOptions> = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];
  lines.push(columns.map((col) => escapeCell(col.header, opts)).join(opts.separator));
  for (const row of rows) {
    lines.push(
      columns.map((col) => escapeCell(col.accessor(row), opts)).join(opts.separator),
    );
  }
  const body = lines.join(opts.newline) + opts.newline;
  return opts.bom ? `\uFEFF${body}` : body;
}

/**
 * Convenience wrapper for the accounting export:
 *   - semicolon separator (Excel-NO default)
 *   - UTF-8 BOM (so æ/ø/å render correctly when opened in Excel)
 *   - Windows line endings
 */
export function exportCsvForExcelNo<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
): string {
  return exportCsv(rows, columns, {
    separator: ";",
    newline: "\r\n",
    bom: true,
  });
}
