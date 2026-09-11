export type HistoryActor = 'user' | 'agent' | 'system';

export interface JournalEntry<TPayload = unknown> {
  id: string;
  projectId: string;
  parentSnapshotId: string | null;
  snapshotId: string;
  actor: HistoryActor;
  operation: string;
  payload: TPayload;
  createdAt: string;
}

export interface Snapshot<TProject = unknown> {
  id: string;
  projectId: string;
  schemaVersion: number;
  state: TProject;
  createdAt: string;
  checksum?: string;
}

export interface HistoryState {
  currentSnapshotId: string | null;
  undoStack: string[];
  redoStack: string[];
}
