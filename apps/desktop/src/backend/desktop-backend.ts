import type { ProjectIR } from "@cevra/project-ir";

export type DesktopCapability = "media.import" | "director.execute" | "changes.apply" | "project.export";

export interface DesktopCapabilityState {
  readonly available: boolean;
  readonly reason: "desktop-runtime-deferred";
}

export interface DesktopBackend {
  readonly adapterName: string;
  readonly presentationOnly: boolean;
  loadProjectProjection(): Promise<Readonly<ProjectIR>>;
  capability(capability: DesktopCapability): DesktopCapabilityState;
}
