import { EditorialDraftService, type CreateEditorialDraftRequest, type EditorialDraftState, type ReviseEditorialDraftRequest } from "@cevra/application/editorial-draft";
import { ProjectHistory, type HistoryArchive } from "@cevra/project-ir";
import fixture from "../fixtures/editorial-review.json";
import { DemoDesktopBackend } from "./demo-desktop-backend";

/** Explicit development/test fixture, not a saved-result import or production admission. */
export class EditorialFixtureBackend extends DemoDesktopBackend {
  // The legacy JSON is admitted/migrated by the archive codec, not a live IR cast.
  readonly history = ProjectHistory.fromArchive(structuredClone(fixture.history) as unknown as HistoryArchive);
  private readonly service = new EditorialDraftService(this.history);
  private draft = this.service.create(structuredClone(fixture.request) as CreateEditorialDraftRequest);

  override async loadState() {
    return { ...await super.loadState(), project: structuredClone(this.history.current), sourceNumbering: this.history.sourceNumbering, canUndo: this.history.canUndo, canRedo: this.history.canRedo };
  }
  override async loadEditorialDraft(): Promise<EditorialDraftState> {
    try { this.service.assertCurrent(this.draft); }
    catch { return { status: "stale" }; }
    return { status: "current", draft: structuredClone(this.draft) };
  }
  override async reviseEditorialDraft(request: ReviseEditorialDraftRequest): Promise<EditorialDraftState> {
    this.draft = this.service.revise(this.draft, request);
    return this.loadEditorialDraft();
  }
  override async undo() { this.history.undo(); return this.loadState(); }
  override async redo() { this.history.redo(); return this.loadState(); }
}
