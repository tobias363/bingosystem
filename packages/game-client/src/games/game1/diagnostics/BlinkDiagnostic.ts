/**
 * Dev-only diagnostic for hunting residual "blinking" in the Game 1
 * overlay DOM. Groups MutationObserver callbacks per rAF and logs which
 * sub-tree + what kind (childList / text / attribute) changed.
 *
 * Historisk: brukt til å finne kilder til DOM-re-render i CenterTopPanel +
 * TicketGridHtml før memo-fiksene. Beholdes som opt-in-verktøy for
 * fremtidige blink-jakter i stedet for å legge tilbake når det trengs.
 *
 * Aktivert kun når URL-en har `?diag=blink`-query-param — ingen prod-cost.
 */

export function shouldInstallBlinkDiagnostic(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("diag") === "blink";
  } catch {
    return false;
  }
}

/**
 * Observer DOM-mutasjoner i `overlayRoot` og logg en gruppert oversikt
 * per animasjonsramme. Returnerer en cleanup-funksjon som stopper
 * observeren.
 */
export function installBlinkDiagnostic(overlayRoot: HTMLElement): () => void {
  const bucket: Record<string, number> = {};
  let rafScheduled = false;

  const flush = (): void => {
    rafScheduled = false;
    const entries = Object.entries(bucket).filter(([, n]) => n > 0);
    if (entries.length > 0) {
      console.log(
        "[DIAG blink]",
        entries.map(([k, n]) => `${k}=${n}`).join(", "),
      );
    }
    for (const key of Object.keys(bucket)) bucket[key] = 0;
  };

  const labelFor = (node: Node): string => {
    let el: HTMLElement | null =
      node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    // Walk up until we find a class/id we recognise (g1-*, ticket-*, etc.).
    while (el) {
      if (el.classList && el.classList.length > 0) {
        const c = Array.from(el.classList).find(
          (x) => x.startsWith("g1-") || x.startsWith("ticket-"),
        );
        if (c) return c;
      }
      if (el.id) return `#${el.id}`;
      el = el.parentElement;
    }
    return "(unknown)";
  };

  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const label = labelFor(m.target);
      const kind =
        m.type === "childList"
          ? "childList"
          : m.type === "characterData"
            ? "text"
            : `attr:${m.attributeName}`;
      const key = `${label}[${kind}]`;
      bucket[key] = (bucket[key] ?? 0) + 1;
    }
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(flush);
    }
  });

  obs.observe(overlayRoot, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["style", "class", "disabled", "hidden"],
  });

  return () => obs.disconnect();
}
