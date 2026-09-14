import type { ProjectIR } from "@cevra/project-ir";
import { createDemoProject } from "../fixtures/demo-project";
import type { DesktopBackend, DesktopCapability, DesktopCapabilityState } from "./desktop-backend";

const unavailable: DesktopCapabilityState = Object.freeze({
  available: false,
  reason: "desktop-runtime-deferred"
});

/**
 * Development presentation adapter only. It does not persist, execute engines,
 * create journal entries, or claim desktop-host functionality.
 */
export class DemoDesktopBackend implements DesktopBackend {
  readonly adapterName = "DemoDesktopBackend";
  readonly presentationOnly = true;

  async loadProjectProjection(): Promise<Readonly<ProjectIR>> {
    return structuredClone(createDemoProject());
  }

  capability(_capability: DesktopCapability): DesktopCapabilityState {
    return unavailable;
  }
}
