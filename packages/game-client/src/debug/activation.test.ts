import { describe, it, expect } from "vitest";
import { isDebugEnabled } from "./activation.js";

function makeWin(query: string, storage: Storage | undefined, cookie: string) {
  return {
    location: { search: query },
    localStorage: storage,
    document: { cookie } as Document,
  } as Pick<Window, "location"> & { localStorage?: Storage; document?: Document };
}

function makeStorage(map: Record<string, string>): Storage {
  return {
    length: Object.keys(map).length,
    clear: () => {
      for (const k of Object.keys(map)) delete map[k];
    },
    getItem: (k: string) => map[k] ?? null,
    key: (i: number) => Object.keys(map)[i] ?? null,
    removeItem: (k: string) => {
      delete map[k];
    },
    setItem: (k: string, v: string) => {
      map[k] = v;
    },
  } as Storage;
}

describe("isDebugEnabled", () => {
  it("returns false when no source has the flag", () => {
    expect(isDebugEnabled(makeWin("", makeStorage({}), ""))).toBe(false);
  });

  it("activates via ?debug=1", () => {
    expect(isDebugEnabled(makeWin("?debug=1", makeStorage({}), ""))).toBe(true);
  });

  it("activates via localStorage flag", () => {
    expect(
      isDebugEnabled(makeWin("", makeStorage({ "spillorama.debug": "1" }), "")),
    ).toBe(true);
  });

  it("activates via cookie", () => {
    expect(
      isDebugEnabled(makeWin("", makeStorage({}), "spillorama.debug=1")),
    ).toBe(true);
  });

  it("accepts true/yes/on as enabled values", () => {
    for (const v of ["true", "yes", "on", "1", "TRUE"]) {
      expect(
        isDebugEnabled(makeWin("", makeStorage({ "spillorama.debug": v }), "")),
      ).toBe(true);
    }
  });

  it("ignores unknown values", () => {
    expect(
      isDebugEnabled(makeWin("", makeStorage({ "spillorama.debug": "maybe" }), "")),
    ).toBe(false);
  });

  it("handles missing storage and missing document gracefully", () => {
    expect(isDebugEnabled(makeWin("", undefined, ""))).toBe(false);
  });

  it("ignores throwing storage backends", () => {
    const broken: Storage = {
      length: 0,
      clear: () => undefined,
      getItem: () => {
        throw new Error("boom");
      },
      key: () => null,
      removeItem: () => undefined,
      setItem: () => undefined,
    };
    expect(isDebugEnabled(makeWin("", broken, ""))).toBe(false);
  });
});
