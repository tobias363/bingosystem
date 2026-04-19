// PR-A6 (BIN-674) — systemInformation dispatcher.
//
// Route:
//   /system/systemInformation     → SystemInformationPage
//
// Design-avvik (§2.3): Summernote rich-text-editor erstattet med ren
// textarea + markdown-preview (vanilla DOM-only policy).

import { renderSystemInformationPage } from "./SystemInformationPage.js";

export function isSystemInformationRoute(path: string): boolean {
  return path === "/system/systemInformation";
}

export function mountSystemInformationRoute(container: HTMLElement, path: string): void {
  container.innerHTML = "";
  if (path === "/system/systemInformation") return renderSystemInformationPage(container);
  container.innerHTML = `<div class="box box-danger"><div class="box-body">Unknown system route: ${path}</div></div>`;
}
