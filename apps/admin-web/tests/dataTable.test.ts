// DataTable tests — PR-A4a additive extension.
//
// Coverage:
//  - Backward-compat: mount with only `{columns, rows}` renders same DOM as PR-A3
//    stub (no toolbar, no footer).
//  - dateRange: renders two date inputs with labels; onChange fires with Date|null.
//  - csvExport: toolbar button renders; click triggers Blob download via anchor.
//  - cursorPaging: initial load called with cursor=null; "Load more" button
//    fetches next page and appends rows; hides when nextCursor=null.
//  - toolbar.extra: receives a host element and can mount arbitrary content.
//  - Handle API: refresh() re-runs load; setRows() replaces rows; destroy() clears DOM.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DataTable, mount } from "../src/components/DataTable.js";
import type { Column, CursorPagingConfig } from "../src/components/DataTable.js";
import { initI18n } from "../src/i18n/I18n.js";

type Row = { id: string; name: string; amount: number };

const cols: Column<Row>[] = [
  { key: "id", title: "ID" },
  { key: "name", title: "Name" },
  { key: "amount", title: "Amount", align: "right", render: (r) => `${r.amount} kr` },
];

function mkContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.append(div);
  return div;
}

// jsdom doesn't implement Blob.text(), but it does provide FileReader.
// Read as text (utf-8). Note FileReader strips the BOM on utf-8 decode.
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob, "utf-8");
  });
}

// For verifying the BOM is actually in the bytes (FileReader strips it).
function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("DataTable (PR-A4a extended)", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("backward compatibility", () => {
    it("mount with only columns+rows renders table without toolbar/footer", () => {
      const c = mkContainer();
      const rows: Row[] = [
        { id: "1", name: "Alice", amount: 100 },
        { id: "2", name: "Bob", amount: 50 },
      ];
      DataTable.mount(c, { columns: cols, rows });

      expect(c.querySelector("table")).toBeTruthy();
      expect(c.querySelectorAll("thead th").length).toBe(3);
      expect(c.querySelectorAll("tbody tr").length).toBe(2);
      expect(c.querySelector(".datatable-toolbar")).toBeNull();
      expect(c.querySelector(".datatable-footer")).toBeNull();
    });

    it("renders emptyMessage when rows=[]", () => {
      const c = mkContainer();
      DataTable.mount(c, { columns: cols, rows: [], emptyMessage: "Ingen data" });
      expect(c.querySelector("tbody td")?.textContent).toBe("Ingen data");
    });

    it("onRowClick fires when row clicked", () => {
      const c = mkContainer();
      const clicked: Row[] = [];
      DataTable.mount(c, {
        columns: cols,
        rows: [{ id: "1", name: "A", amount: 10 }],
        onRowClick: (r) => clicked.push(r),
      });
      const tr = c.querySelector<HTMLTableRowElement>("tbody tr");
      tr?.click();
      expect(clicked).toHaveLength(1);
      expect(clicked[0]!.id).toBe("1");
    });

    it("returns a handle (existing call sites may discard return value)", () => {
      const c = mkContainer();
      const handle = DataTable.mount(c, { columns: cols, rows: [] });
      expect(typeof handle.refresh).toBe("function");
      expect(typeof handle.setRows).toBe("function");
      expect(typeof handle.destroy).toBe("function");
    });
  });

  describe("dateRange", () => {
    it("renders two date inputs with labels", () => {
      const c = mkContainer();
      DataTable.mount<Row>(c, {
        columns: cols,
        rows: [],
        dateRange: {
          onChange: () => {},
          labels: { from: "Fra", to: "Til" },
        },
      });
      const inputs = c.querySelectorAll<HTMLInputElement>(".datatable-date");
      expect(inputs).toHaveLength(2);
      expect(inputs[0]!.type).toBe("date");
      expect(inputs[0]!.getAttribute("aria-label")).toBe("Fra");
      expect(inputs[1]!.getAttribute("aria-label")).toBe("Til");
    });

    it("fires onChange(from, to) when inputs change", () => {
      const c = mkContainer();
      const calls: Array<[Date | null, Date | null]> = [];
      DataTable.mount<Row>(c, {
        columns: cols,
        rows: [],
        dateRange: { onChange: (f, t) => calls.push([f, t]) },
      });
      const inputs = c.querySelectorAll<HTMLInputElement>(".datatable-date");
      inputs[0]!.value = "2026-01-01";
      inputs[0]!.dispatchEvent(new Event("change"));
      expect(calls).toHaveLength(1);
      expect(calls[0]![0]?.toISOString().startsWith("2026-01-01")).toBe(true);
      expect(calls[0]![1]).toBeNull();

      inputs[1]!.value = "2026-01-31";
      inputs[1]!.dispatchEvent(new Event("change"));
      expect(calls).toHaveLength(2);
      expect(calls[1]![1]?.toISOString().startsWith("2026-01-31")).toBe(true);
    });

    it("pre-fills with initialFrom/initialTo", () => {
      const c = mkContainer();
      DataTable.mount<Row>(c, {
        columns: cols,
        rows: [],
        dateRange: {
          initialFrom: new Date(2026, 0, 1),
          initialTo: new Date(2026, 0, 31),
          onChange: () => {},
        },
      });
      const inputs = c.querySelectorAll<HTMLInputElement>(".datatable-date");
      expect(inputs[0]!.value).toBe("2026-01-01");
      expect(inputs[1]!.value).toBe("2026-01-31");
    });
  });

  describe("csvExport", () => {
    it("renders Export CSV button in toolbar", () => {
      const c = mkContainer();
      DataTable.mount<Row>(c, {
        columns: cols,
        rows: [],
        csvExport: { filename: "test" },
      });
      const btn = c.querySelector<HTMLButtonElement>(".datatable-csv-btn");
      expect(btn).toBeTruthy();
      // Default i18n lang is "no"
      expect(btn?.textContent).toBe("Eksporter CSV");
    });

    it("click triggers Blob download with UTF-8 BOM + CSV rows", async () => {
      const c = mkContainer();
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      let capturedBlob: Blob | null = null;
      URL.createObjectURL = ((blob: Blob) => {
        capturedBlob = blob;
        return "blob:mock-url";
      }) as typeof URL.createObjectURL;
      URL.revokeObjectURL = vi.fn();

      // Stub anchor click so we don't actually trigger a download dialog.
      const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};

      try {
        DataTable.mount<Row>(c, {
          columns: cols,
          rows: [
            { id: "1", name: "Alice", amount: 100 },
            { id: "2", name: 'Bob,"with,commas"', amount: 50 },
          ],
          csvExport: { filename: "report" },
        });
        const btn = c.querySelector<HTMLButtonElement>(".datatable-csv-btn");
        btn?.click();
        await new Promise((r) => setTimeout(r, 10));

        expect(capturedBlob).toBeTruthy();
        expect(capturedBlob!.type).toContain("text/csv");
        // UTF-8 BOM check via raw bytes (EF BB BF)
        const bytes = await readBlobBytes(capturedBlob!);
        expect(bytes[0]).toBe(0xef);
        expect(bytes[1]).toBe(0xbb);
        expect(bytes[2]).toBe(0xbf);
        const text = await readBlob(capturedBlob!);
        // Header row
        expect(text).toContain("ID,Name,Amount");
        // Value with commas + quotes is escaped
        expect(text).toContain('"Bob,""with,commas"""');
        // render() result surfaces in CSV via nodeToText
        expect(text).toContain("100 kr");
      } finally {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
        HTMLAnchorElement.prototype.click = origClick;
      }
    });

    it("uses transform when provided", async () => {
      const c = mkContainer();
      let capturedBlob: Blob | null = null;
      URL.createObjectURL = ((blob: Blob) => {
        capturedBlob = blob;
        return "blob:mock";
      }) as typeof URL.createObjectURL;
      URL.revokeObjectURL = vi.fn();
      const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};

      try {
        DataTable.mount<Row>(c, {
          columns: cols,
          rows: [{ id: "1", name: "Alice", amount: 100 }],
          csvExport: {
            filename: "r",
            transform: (r) => ({ id: `P-${r.id}`, name: r.name.toUpperCase(), amount: r.amount }),
          },
        });
        c.querySelector<HTMLButtonElement>(".datatable-csv-btn")?.click();
        await new Promise((r) => setTimeout(r, 10));
        const text = await readBlob(capturedBlob!);
        expect(text).toContain("P-1");
        expect(text).toContain("ALICE");
      } finally {
        HTMLAnchorElement.prototype.click = origClick;
      }
    });
  });

  describe("cursorPaging", () => {
    it("loads first page on mount and renders rows", async () => {
      const c = mkContainer();
      const paging: CursorPagingConfig<Row> = {
        load: async ({ cursor }) => {
          if (cursor === null) {
            return {
              rows: [{ id: "1", name: "A", amount: 10 }],
              nextCursor: "c1",
            };
          }
          return { rows: [], nextCursor: null };
        },
      };
      DataTable.mount<Row>(c, { columns: cols, rows: [], cursorPaging: paging });
      await new Promise((r) => setTimeout(r, 20));
      expect(c.querySelectorAll("tbody tr").length).toBe(1);
      expect(c.querySelector(".datatable-footer")).toBeTruthy();
    });

    it("Load more button appends next page and hides when nextCursor=null", async () => {
      const c = mkContainer();
      let call = 0;
      const paging: CursorPagingConfig<Row> = {
        load: async () => {
          call++;
          if (call === 1) return { rows: [{ id: "1", name: "A", amount: 1 }], nextCursor: "c1" };
          if (call === 2) return { rows: [{ id: "2", name: "B", amount: 2 }], nextCursor: null };
          return { rows: [], nextCursor: null };
        },
      };
      DataTable.mount<Row>(c, { columns: cols, rows: [], cursorPaging: paging });
      await new Promise((r) => setTimeout(r, 20));
      const btn = c.querySelector<HTMLButtonElement>(".datatable-load-more");
      expect(btn).toBeTruthy();
      expect(btn!.disabled).toBe(false);

      btn!.click();
      await new Promise((r) => setTimeout(r, 20));
      expect(c.querySelectorAll("tbody tr").length).toBe(2);
      expect(btn!.disabled).toBe(true);
      expect(btn!.style.display).toBe("none");
    });
  });

  describe("toolbar.extra", () => {
    it("is invoked with a host element", () => {
      const c = mkContainer();
      let invoked = false;
      DataTable.mount<Row>(c, {
        columns: cols,
        rows: [],
        toolbar: {
          extra: (host) => {
            invoked = true;
            expect(host).toBeInstanceOf(HTMLElement);
            host.innerHTML = '<span class="custom-filter">X</span>';
          },
        },
      });
      expect(invoked).toBe(true);
      expect(c.querySelector(".custom-filter")).toBeTruthy();
    });
  });

  describe("Handle API", () => {
    it("setRows replaces in-memory rows and re-renders", () => {
      const c = mkContainer();
      const handle = DataTable.mount<Row>(c, {
        columns: cols,
        rows: [{ id: "1", name: "A", amount: 1 }],
      });
      expect(c.querySelectorAll("tbody tr").length).toBe(1);
      handle.setRows([
        { id: "2", name: "B", amount: 2 },
        { id: "3", name: "C", amount: 3 },
      ]);
      expect(c.querySelectorAll("tbody tr").length).toBe(2);
    });

    it("refresh re-invokes cursorPaging.load with cursor=null", async () => {
      const c = mkContainer();
      const calls: Array<string | null> = [];
      const paging: CursorPagingConfig<Row> = {
        load: async ({ cursor }) => {
          calls.push(cursor);
          return { rows: [], nextCursor: null };
        },
      };
      const handle = DataTable.mount<Row>(c, { columns: cols, rows: [], cursorPaging: paging });
      await new Promise((r) => setTimeout(r, 20));
      expect(calls).toEqual([null]);
      await handle.refresh();
      expect(calls).toEqual([null, null]);
    });

    it("destroy clears DOM", () => {
      const c = mkContainer();
      const handle = DataTable.mount<Row>(c, { columns: cols, rows: [{ id: "1", name: "A", amount: 1 }] });
      expect(c.querySelector("table")).toBeTruthy();
      handle.destroy();
      expect(c.querySelector("table")).toBeNull();
      expect(c.children.length).toBe(0);
    });
  });

  describe("named export", () => {
    it("exposes `mount` as both named and via DataTable namespace", () => {
      const c1 = mkContainer();
      const c2 = mkContainer();
      DataTable.mount(c1, { columns: cols, rows: [] });
      mount(c2, { columns: cols, rows: [] });
      expect(c1.querySelector("table")).toBeTruthy();
      expect(c2.querySelector("table")).toBeTruthy();
    });
  });
});
