export const PROJECT_PACKAGE_FORMAT = "cevra-project" as const;
export const PROJECT_PACKAGE_VERSION = 1 as const;

export interface ProjectPackageManifestV1 {
  format: typeof PROJECT_PACKAGE_FORMAT;
  formatVersion: typeof PROJECT_PACKAGE_VERSION;
  projectId: string;
  projectSchemaVersion: number;
  activeSnapshotId: string;
  createdAt: string;
  savedAt: string;
  defaultLocale: "pt-BR" | "en-US";
}

export interface SerializedProjectPackage {
  files: Record<string, string>;
}
