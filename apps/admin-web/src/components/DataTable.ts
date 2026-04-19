// DataTable — bs3/AdminLTE-compatible table component.
//
// PR-A1/PR-A3: minimal stub (columns + rows + onRowClick + empty-state).
// PR-A4a: additive extension — dateRange filter, cursor paging, CSV export,
//         freeform toolbar, and imperative handle (refresh/setRows/destroy).
//
// Design principle: ALL new options are optional. Existing 18 call sites
// (PR-A1..A3) continue to work unchanged — they ignore the returned handle
// and never supply the new config fields. See tests/DataTable.test.ts for
// back-compat verification.
//
// The old `mount()` signature returned `void`. We widen the return type to
// `DataTableHandle<T>`. This is safe because TypeScript allows callers that
// discard the return value — and runtime-wise the handle is just an object.

import { t } from "../i18n/I18n.js";

// -------------------------------- Types ------------------------------------

export interface Column<T> {
  key: keyof T & string;
  title: string;
  render?: (row: T) => string | Node;
  width?: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
}

export interface DataTableOptions<T> {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;

  // --- PR-A4a additions (all optional, backward compatible) ---

  /** Renders date-range pickers above the table. */
  dateRange?: DateRangeConfig;

  /** Enables async cursor-based paging with "Load more"/"Prev/Next". */
  cursorPaging?: CursorPagingConfig<T>;

  /** Renders "Export CSV" button in toolbar; client-side, UTF-8 BOM. */
  csvExport?: CsvExportConfig<T>;

  /** Freeform toolbar extension (filter fields beyond dateRange). */
  toolbar?: {
    extra?: (host: HTMLElement) => void;
  };

  /** Stable DOM id for tests (optional). */
  id?: string;

  // --- Forward-compat placeholders for BIN-652 (xlsx + PDF export) ---
  // Setting these currently has no effect; follow-up PR will implement.
  xlsxExport?: never;
  pdfExport?: never;
}

export interface DateRangeConfig {
  initialFrom?: Date | null;
  initialTo?: Date | null;
  onChange: (from: Date | null, to: Date | null) => void;
  labels?: { from?: string; to?: string };
}

export interface CursorPagingConfig<T> {
  /** Fetches one page. `cursor=null` means "first page". */
  load: (opts: { cursor: string | null; limit: number }) => Promise<{
    rows: T[];
    nextCursor: string | null;
  }>;
  /** Default 50. */
  pageSize?: number;
  /** Default "load-more". "prev-next" is reserved for future use. */
  mode?: "load-more" | "prev-next";
}

export interface CsvExportConfig<T> {
  /** Filename without extension. `.csv` is appended. */
  filename: string;
  /**
   * If set, CSV uses this full dataset (typically drives cursorPaging.load
   * until exhausted). Otherwise CSV uses currently rendered rows.
   */
  fetchAll?: () => Promise<T[]>;
  /** Override row→flat-object mapping. Default: all columns via Column.render/key. */
  transform?: (row: T) => Record<string, string | number | null>;
  /** Abort + warn above this many rows. Default 10 000. */
  maxRows?: number;
}

/** Imperative API returned by mount. Existing callers may ignore. */
export interface DataTableHandle<T> {
  /** Re-runs cursorPaging.load from cursor=null (or re-renders in-memory rows). */
  refresh: () => Promise<void>;
  /** Replaces in-memory rows and re-renders body. Bypasses cursorPaging. */
  setRows: (rows: T[]) => void;
  /** Removes event listeners + DOM children. */
  destroy: () => void;
}

// ----------------------------- Implementation ------------------------------

export function mount<T>(container: HTMLElement, opts: DataTableOptions<T>): DataTableHandle<T> {
  container.innerHTML = "";
  if (opts.id) container.id = opts.id;

  // Live state (mutated by dateRange.onChange / refresh / setRows / load-more)
  let currentRows: T[] = [...opts.rows];
  let nextCursor: string | null = null;
  const pageSize = opts.cursorPaging?.pageSize ?? 50;
  const cleanupFns: Array<() => void> = [];

  // ------------------------------ Toolbar ---------------------------------
  // Rendered only if dateRange, csvExport, or toolbar.extra is configured.
  const hasToolbar = Boolean(opts.dateRange || opts.csvExport || opts.toolbar?.extra);
  let toolbarEl: HTMLDivElement | null = null;
  if (hasToolbar) {
    toolbarEl = document.createElement("div");
    toolbarEl.className = "datatable-toolbar";
    toolbarEl.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;";
    container.append(toolbarEl);
  }

  if (opts.dateRange && toolbarEl) {
    const dr = opts.dateRange;
    const fromLabel = dr.labels?.from ?? t("from_date");
    const toLabel = dr.labels?.to ?? t("to_date");

    const fromInput = mkDateInput(fromLabel, dr.initialFrom ?? null);
    const toInput = mkDateInput(toLabel, dr.initialTo ?? null);

    const fire = (): void => {
      const f = parseDate(fromInput.value);
      const t2 = parseDate(toInput.value);
      dr.onChange(f, t2);
    };
    const onFrom = (): void => fire();
    const onTo = (): void => fire();
    fromInput.addEventListener("change", onFrom);
    toInput.addEventListener("change", onTo);
    cleanupFns.push(() => fromInput.removeEventListener("change", onFrom));
    cleanupFns.push(() => toInput.removeEventListener("change", onTo));

    toolbarEl.append(wrapLabel(fromLabel, fromInput));
    toolbarEl.append(wrapLabel(toLabel, toInput));
  }

  if (opts.toolbar?.extra && toolbarEl) {
    const slot = document.createElement("div");
    slot.className = "datatable-toolbar-extra";
    slot.style.cssText = "display:flex;gap:8px;align-items:center;";
    toolbarEl.append(slot);
    opts.toolbar.extra(slot);
  }

  if (opts.csvExport && toolbarEl) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-default btn-sm datatable-csv-btn";
    btn.textContent = t("export_csv");
    btn.style.marginLeft = "auto";
    const onClick = (): void => {
      void exportCsv(opts.csvExport!, currentRows, opts.columns, opts.cursorPaging);
    };
    btn.addEventListener("click", onClick);
    cleanupFns.push(() => btn.removeEventListener("click", onClick));
    toolbarEl.append(btn);
  }

  // ------------------------------ Table -----------------------------------
  const table = document.createElement("table");
  table.className = `table table-bordered table-hover ${opts.className ?? ""}`.trim();

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const col of opts.columns) {
    const th = document.createElement("th");
    th.textContent = col.title;
    if (col.width) th.style.width = col.width;
    if (col.align) th.style.textAlign = col.align;
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  table.append(tbody);
  container.append(table);

  // ------------------------------ Footer ----------------------------------
  let footerEl: HTMLDivElement | null = null;
  let loadMoreBtn: HTMLButtonElement | null = null;
  if (opts.cursorPaging) {
    footerEl = document.createElement("div");
    footerEl.className = "datatable-footer";
    footerEl.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-top:8px;";

    const countEl = document.createElement("span");
    countEl.className = "datatable-count";
    footerEl.append(countEl);

    loadMoreBtn = document.createElement("button");
    loadMoreBtn.type = "button";
    loadMoreBtn.className = "btn btn-default btn-sm datatable-load-more";
    loadMoreBtn.textContent = t("load_more");
    const onLoadMore = (): void => {
      void loadNextPage();
    };
    loadMoreBtn.addEventListener("click", onLoadMore);
    cleanupFns.push(() => loadMoreBtn?.removeEventListener("click", onLoadMore));
    footerEl.append(loadMoreBtn);

    container.append(footerEl);
  }

  // ------------------------------ Render ----------------------------------
  function renderBody(): void {
    tbody.innerHTML = "";
    if (currentRows.length === 0) {
      const empty = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = opts.columns.length;
      td.style.textAlign = "center";
      td.textContent = opts.emptyMessage ?? t("no_data_available_in_table");
      empty.append(td);
      tbody.append(empty);
    } else {
      for (const row of currentRows) {
        const rowEl = document.createElement("tr");
        if (opts.onRowClick) {
          rowEl.style.cursor = "pointer";
          const handler = (): void => opts.onRowClick!(row);
          rowEl.addEventListener("click", handler);
          cleanupFns.push(() => rowEl.removeEventListener("click", handler));
        }
        for (const col of opts.columns) {
          const td = document.createElement("td");
          if (col.align) td.style.textAlign = col.align;
          if (col.render) {
            const out = col.render(row);
            if (typeof out === "string") td.innerHTML = out;
            else td.append(out);
          } else {
            const v = row[col.key];
            td.textContent = v == null ? "" : String(v);
          }
          rowEl.append(td);
        }
        tbody.append(rowEl);
      }
    }
    updateFooter();
  }

  function updateFooter(): void {
    if (!footerEl) return;
    const countEl = footerEl.querySelector<HTMLElement>(".datatable-count");
    if (countEl) {
      countEl.textContent = `${t("showing")} ${currentRows.length}`;
    }
    if (loadMoreBtn) {
      loadMoreBtn.disabled = nextCursor === null;
      loadMoreBtn.style.display = nextCursor === null ? "none" : "";
    }
  }

  async function loadFirstPage(): Promise<void> {
    if (!opts.cursorPaging) return;
    const page = await opts.cursorPaging.load({ cursor: null, limit: pageSize });
    currentRows = page.rows;
    nextCursor = page.nextCursor;
    renderBody();
  }

  async function loadNextPage(): Promise<void> {
    if (!opts.cursorPaging || nextCursor === null) return;
    const page = await opts.cursorPaging.load({ cursor: nextCursor, limit: pageSize });
    currentRows = [...currentRows, ...page.rows];
    nextCursor = page.nextCursor;
    renderBody();
  }

  // Initial render: if cursorPaging configured, fire first load; else use opts.rows.
  if (opts.cursorPaging) {
    void loadFirstPage();
  } else {
    renderBody();
  }

  // ------------------------------ Handle ----------------------------------
  const handle: DataTableHandle<T> = {
    async refresh() {
      if (opts.cursorPaging) {
        nextCursor = null;
        await loadFirstPage();
      } else {
        renderBody();
      }
    },
    setRows(rows) {
      currentRows = [...rows];
      nextCursor = null;
      renderBody();
    },
    destroy() {
      for (const fn of cleanupFns) fn();
      cleanupFns.length = 0;
      container.innerHTML = "";
    },
  };

  return handle;
}

// --------------------------- Helpers (private) -----------------------------

function mkDateInput(label: string, initial: Date | null): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "date";
  el.className = "form-control input-sm datatable-date";
  el.setAttribute("aria-label", label);
  if (initial) el.value = toIsoDate(initial);
  return el;
}

function wrapLabel(label: string, input: HTMLInputElement): HTMLLabelElement {
  const w = document.createElement("label");
  w.style.cssText = "display:flex;flex-direction:column;font-size:12px;";
  w.textContent = label;
  w.append(input);
  return w;
}

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ----------------------------- CSV Export ----------------------------------

async function exportCsv<T>(
  cfg: CsvExportConfig<T>,
  visibleRows: T[],
  columns: Column<T>[],
  paging: CursorPagingConfig<T> | undefined,
): Promise<void> {
  const maxRows = cfg.maxRows ?? 10000;
  let rows: T[] = visibleRows;

  if (cfg.fetchAll) {
    rows = await cfg.fetchAll();
  } else if (paging) {
    // If cursor paging is configured but fetchAll isn't: page through until exhausted
    // or until maxRows is reached. Gives users a reasonable "export full dataset"
    // without each page needing to re-implement pagination.
    const accumulated: T[] = [];
    let cursor: string | null = null;
    const limit = paging.pageSize ?? 50;
    // First page
    do {
      const page = await paging.load({ cursor, limit });
      accumulated.push(...page.rows);
      cursor = page.nextCursor;
      if (accumulated.length > maxRows) break;
    } while (cursor !== null);
    rows = accumulated;
  }

  if (rows.length > maxRows) {
    // eslint-disable-next-line no-alert
    alert(`${t("csv_export_too_many")}: ${rows.length} > ${maxRows}`);
    return;
  }

  const header = columns.map((c) => quote(c.title));
  const body = rows.map((row) => {
    if (cfg.transform) {
      const flat = cfg.transform(row);
      return columns.map((col) => quote(String(flat[col.key] ?? ""))).join(",");
    }
    return columns
      .map((col) => {
        if (col.render) return quote(nodeToText(col.render(row)));
        const v = row[col.key];
        return quote(v == null ? "" : String(v));
      })
      .join(",");
  });

  // UTF-8 BOM for Excel compatibility (without BOM, Excel mis-detects encoding).
  const csv = "\ufeff" + [header.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cfg.filename}.csv`;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function quote(s: string): string {
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function nodeToText(input: string | Node): string {
  if (typeof input === "string") {
    // Strip HTML tags — render() often returns escaped HTML strings.
    const tmp = document.createElement("div");
    tmp.innerHTML = input;
    return tmp.textContent ?? "";
  }
  return input.textContent ?? "";
}

export const DataTable = { mount };
