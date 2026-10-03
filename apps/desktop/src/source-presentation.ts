import type { SourceAsset } from "@cevra/project-ir";
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

/** Window-lifetime presentation registry, shared by all project surfaces.
 * Retired IDs remain reserved through filtering, removal and undo/redo.
 * This is not a durable project identifier: reopening needs an approved archive contract.
 */
export class SourcePresentationRegistry {
  private readonly projects = new Map<string, {
    numbers: Record<SourceAsset["kind"], number>;
    sources: Map<string, { kind: SourceAsset["kind"]; number: number }>;
  }>();

  present(projectId: string, sources: readonly SourceAsset[], t: Translate): ReadonlyMap<string, SourcePresentation> {
    let registry = this.projects.get(projectId);
    if (!registry) {
      registry = { numbers: { video: 0, audio: 0, image: 0 }, sources: new Map() };
      this.projects.set(projectId, registry);
    }
    return new Map(sources.map(source => {
      let identity = registry.sources.get(source.id);
      if (!identity || identity.kind !== source.kind) {
        identity = { kind: source.kind, number: ++registry.numbers[source.kind] };
        registry.sources.set(source.id, identity);
      }
      return [source.id, {
        label: t(labelKeys[source.kind], { number: identity.number }),
        fileName: source.displayName,
        kind: source.kind
      }];
    }));
  }
}
