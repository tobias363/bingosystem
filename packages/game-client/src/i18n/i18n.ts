import i18next from "i18next";
import nb from "./locales/nb.json";
import en from "./locales/en.json";

export async function initI18n(lang = "nb"): Promise<typeof i18next> {
  await i18next.init({
    lng: lang,
    fallbackLng: "nb",
    resources: {
      nb: { translation: nb },
      en: { translation: en },
    },
    interpolation: { escapeValue: false },
  });
  return i18next;
}

export { i18next };
