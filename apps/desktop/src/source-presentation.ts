import type { SourceAsset, SourceNumberingV1 } from "@cevra/project-ir";
import type { TranslationKey } from "@cevra/i18n";
import type { Translate } from "./ui-model";

export interface SourcePresentation {
  label: string;
  fileName: string;
  kind: SourceAsset["kind"];
}

const labelKeys: Record<SourceAsset["kind"], TranslationKey> = {
  video: "sourcePresentation.video",
  audio: "sourcePresentation.audio",
  image: "sourcePresentation.image"
};

/** All surfaces display host-owned source identities; no UI allocation or filtering counter. */
export function presentSources(sources: readonly SourceAsset[], numbering: SourceNumberingV1, t: Translate): ReadonlyMap<string, SourcePresentation> {
  const identities = new Map(numbering.sources.map(identity => [identity.sourceId, identity]));
  return new Map(sources.map(source => {
    const identity = identities.get(source.id);
    if (!identity) throw new Error("Source presentation identity is unavailable.");
    return [source.id, { label: t(labelKeys[source.kind], { number: identity.number }), fileName: source.displayName, kind: source.kind }];
  }));
}
