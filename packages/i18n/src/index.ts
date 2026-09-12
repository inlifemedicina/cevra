import enUS from "../en-US.json" with { type: "json" };
import ptBR from "../pt-BR.json" with { type: "json" };
import type { CevraLocale } from "@cevra/project-ir";

export type { CevraLocale } from "@cevra/project-ir";
export type TranslationKey = keyof typeof enUS;
export type TranslationParameters = Readonly<Record<string, string | number>>;

const parityCheckEn: Record<keyof typeof ptBR, string> = enUS;
const parityCheckPt: Record<keyof typeof enUS, string> = ptBR;
void parityCheckEn;
void parityCheckPt;

const catalogs = {
  "en-US": enUS,
  "pt-BR": ptBR
} as const;

export function translate(locale: CevraLocale, key: TranslationKey, parameters: TranslationParameters = {}): string {
  const template = catalogs[locale][key];
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, name: string) => {
    const value = parameters[name];
    return value === undefined ? token : String(value);
  });
}

export function translationKeys(locale: CevraLocale): string[] {
  return Object.keys(catalogs[locale]).sort();
}
