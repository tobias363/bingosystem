/**
 * BIN-588: CSV import helper.
 *
 * Used primarily for the legacy-player migration: read a CSV exported
 * from the old admin panel and produce typed row objects that the
 * migration job can feed into PlatformService. Separator is
 * auto-detected (comma or semicolon) per line, since the Norwegian
 * regnskap system writes semicolons and international exports use
 * commas.
 *
 * Zero deps. The parser handles the RFC 4180 quirks we care about:
 *   - quoted fields may contain the separator and newlines
 *   - doubled quotes inside a quoted field decode to a single quote
 *   - BOM on first byte is stripped
 *   - trailing newline is optional
 *
 * Things we deliberately don't handle (and would error on):
 *   - mixed separators across the file (first header row wins)
 *   - quoted fields without a closing quote (throws)
 */

export interface CsvParseOptions {
  /** Force a separator. When omitted, auto-detect from the header row. */
  separator?: "," | ";" | "\t";
  /** Treat the first row as headers (default true). */
  header?: boolean;
  /** Quote character. Default '"'. */
  quote?: '"' | "'";
  /** Trim leading/trailing whitespace on each field. Default false. */
  trim?: boolean;
}

export interface CsvParseResult<T> {
  headers: string[];
  rows: T[];
  /** Separator actually used — useful for round-trip export. */
  separator: "," | ";" | "\t";
}

function detectSeparator(line: string): "," | ";" | "\t" {
  // Count occurrences outside of quoted regions. The detector is
  // generous: whichever separator appears most often wins. If the file
  // has a single column with no separator, commas are returned (any
  // answer works — there's nothing to split).
  const counts: Record<",", number> & Record<";", number> & Record<"\t", number> = {
    ",": 0,
    ";": 0,
    "\t": 0,
  };
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line.charAt(i);
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (c === "," || c === ";" || c === "\t") {
      counts[c] += 1;
    }
  }
  if (counts[";"] > counts[","] && counts[";"] > counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

function stripBom(text: string): string {
  if (text.length > 0 && text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

/**
 * Parse CSV text into a list of fields-per-row. Used by both
 * `parseCsv` and `parseCsvAsObjects`.
 */
function parseRows(text: string, separator: string, quote: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text.charAt(i);

    if (inQuotes) {
      if (c === quote) {
        if (i + 1 < n && text.charAt(i + 1) === quote) {
          field += quote;
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === quote) {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === separator) {
      current.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\r") {
      // Handle CRLF and bare CR.
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      i += 1;
      if (i < n && text.charAt(i) === "\n") i += 1;
      continue;
    }
    if (c === "\n") {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }

  if (inQuotes) {
    throw new Error("[BIN-588] CSV parse: unterminated quoted field");
  }

  // Flush the final cell/row if the file doesn't end with a newline.
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows;
}

/**
 * Parse CSV text into `{ headers, rows }`. Each row is a
 * `Record<header, string>`. Missing columns default to "".
 *
 * @throws if a quoted field is not terminated.
 */
export function parseCsv(text: string, options: CsvParseOptions = {}): CsvParseResult<Record<string, string>> {
  const cleaned = stripBom(text);
  if (cleaned.length === 0) {
    return { headers: [], rows: [], separator: options.separator ?? "," };
  }

  // Detect separator from the first non-empty line.
  const firstLineEnd = cleaned.search(/\r\n|\n|\r/);
  const firstLine = firstLineEnd === -1 ? cleaned : cleaned.slice(0, firstLineEnd);
  const separator = options.separator ?? detectSeparator(firstLine);
  const quote = options.quote ?? '"';
  const trim = options.trim ?? false;
  const useHeader = options.header ?? true;

  const rawRows = parseRows(cleaned, separator, quote);
  if (rawRows.length === 0) {
    return { headers: [], rows: [], separator };
  }

  const maybeTrim = (s: string): string => (trim ? s.trim() : s);

  if (!useHeader) {
    // No headers — synthesise col_N names so we can still return an
    // object. Callers wanting raw rows can parseCsvRaw directly.
    const maxCols = rawRows.reduce((max, r) => Math.max(max, r.length), 0);
    const headers = Array.from({ length: maxCols }, (_, i) => `col_${i + 1}`);
    const rows = rawRows.map((raw) => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < headers.length; i += 1) {
        obj[headers[i]] = maybeTrim(raw[i] ?? "");
      }
      return obj;
    });
    return { headers, rows, separator };
  }

  const headers = rawRows[0].map((h) => maybeTrim(h));
  const rows = rawRows.slice(1).map((raw) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      obj[headers[i]] = maybeTrim(raw[i] ?? "");
    }
    return obj;
  });
  return { headers, rows, separator };
}

/**
 * Lower-level parser for cases where header detection is undesirable
 * (e.g. transposed exports, known fixed schemas). Returns every row
 * as an array of strings.
 */
export function parseCsvRaw(text: string, options: CsvParseOptions = {}): string[][] {
  const cleaned = stripBom(text);
  if (cleaned.length === 0) return [];
  const firstLineEnd = cleaned.search(/\r\n|\n|\r/);
  const firstLine = firstLineEnd === -1 ? cleaned : cleaned.slice(0, firstLineEnd);
  const separator = options.separator ?? detectSeparator(firstLine);
  const quote = options.quote ?? '"';
  const rows = parseRows(cleaned, separator, quote);
  if (options.trim) {
    return rows.map((r) => r.map((c) => c.trim()));
  }
  return rows;
}
