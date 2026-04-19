// PR-A6 (BIN-674) — CMS dispatcher.
//
// Routes:
//   /cms                          → CmsListPage (6-rad statisk oversikt)
//   /faq                          → FaqListPage (DataTable placeholder)
//   /addFAQ                       → FaqFormPage (create)
//   /faqEdit/:id                  → FaqFormPage (edit — hash-regex)
//   /TermsofService               → CmsTextEditPage("terms_of_service")
//   /Support                      → CmsTextEditPage("support")
//   /Aboutus                      → CmsTextEditPage("about_us")
//   /ResponsibleGameing           → CmsTextEditPage("responsible_gaming", regulatorisk-låst)
//   /LinksofOtherAgencies         → CmsTextEditPage("links_of_other_agencies")
//
// Backend-gap: BIN-A6-CMS (alle sider localStorage-fallback).
// Regulatorisk-gap: BIN-A6-SPILLVETT-AUDIT (§11 pengespillforskriften).

import { renderCmsListPage } from "./CmsListPage.js";
import { renderFaqListPage } from "./FaqListPage.js";
import { renderFaqFormPage } from "./FaqFormPage.js";
import { renderCmsTextEditPage } from "./CmsTextEditPage.js";
import type { CmsTextKey } from "../../api/admin-cms.js";

const FAQ_EDIT_RE = /^\/faqEdit\/[^/]+$/;

const TEXT_ROUTE_MAP: Record<string, CmsTextKey> = {
  "/TermsofService": "terms_of_service",
  "/Support": "support",
  "/Aboutus": "about_us",
  "/ResponsibleGameing": "responsible_gaming",
  "/LinksofOtherAgencies": "links_of_other_agencies",
};

export function isCmsRoute(path: string): boolean {
  if (path === "/cms" || path === "/faq" || path === "/addFAQ") return true;
  if (FAQ_EDIT_RE.test(path)) return true;
  if (path in TEXT_ROUTE_MAP) return true;
  return false;
}

export function mountCmsRoute(container: HTMLElement, path: string): void {
  container.innerHTML = "";
  if (path === "/cms") return renderCmsListPage(container);
  if (path === "/faq") return renderFaqListPage(container);
  if (path === "/addFAQ") return renderFaqFormPage(container, null);
  if (FAQ_EDIT_RE.test(path)) {
    const id = decodeURIComponent(path.slice("/faqEdit/".length));
    return renderFaqFormPage(container, id);
  }
  const textKey = TEXT_ROUTE_MAP[path];
  if (textKey) return renderCmsTextEditPage(container, textKey);
  container.innerHTML = `<div class="box box-danger"><div class="box-body">Unknown CMS route: ${path}</div></div>`;
}
