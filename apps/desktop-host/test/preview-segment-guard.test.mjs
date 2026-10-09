import assert from 'node:assert/strict';
import test from 'node:test';
import { guardManualExportEngine } from '../dist/index.js';

test('admitted current manual preview first-frame extraction shares existing aggregate budgets', async () => {
  const scopes = [], calls = [];
  const engine = { identity() {}, healthcheck() {}, capabilities() {}, async execute(operation) {
    calls.push(operation); return { type: 'file', outputUri: operation.outputUri };
  } };
  const transport = { async withOwnedRenderBudget(options, action) { scopes.push(options); return { result: await action() }; } };
  const guarded = guardManualExportEngine(engine, transport);
  const preview = { type: 'render-manual-video-preview', ownedWorkspaceUri: '/owned/job', outputUri: '/owned/preview.mp4' };
  const frame = { type: 'extract-frame', inputUri: preview.outputUri, outputUri: '/owned/first.png', atMs: 0, maxDimension: 720 };
  await guarded.execute(preview, {}); await guarded.execute(frame, {});
  assert.equal(scopes.length, 2); assert.equal(scopes[0].ownedDirectory, '/owned/job'); assert.equal(scopes[1].ownedDirectory, '/owned');
  for (const scope of scopes) { assert.equal(scope.rendererRssLimitBytes, 512 * 1024 ** 2); assert.equal(scope.ownedFileLimitBytes, 2 * 1024 ** 3); }
  await guarded.execute(frame, {}); assert.equal(scopes.length, 2); // Consumed one-use admission.
  assert.equal(calls.length, 3);
});

test('foreign, changed, Original or final extraction cannot inherit preview cache retention', async () => {
  for (const variant of ['foreign-input', 'foreign-output', 'different-time', 'different-dimension', 'original', 'export']) {
    const scopes = [];
    const engine = { identity() {}, healthcheck() {}, capabilities() {}, async execute(operation) { return { type: 'file', outputUri: operation.outputUri }; } };
    const transport = { async withOwnedRenderBudget(options, action) { scopes.push(options); return { result: await action() }; } };
    const guarded = guardManualExportEngine(engine, transport);
    const preview = { type: 'render-manual-video-preview', ownedWorkspaceUri: '/owned/job', outputUri: '/owned/preview.mp4' };
    await guarded.execute(preview, {});
    let frame = { type: 'extract-frame', inputUri: preview.outputUri, outputUri: '/owned/frame.png', atMs: 0, maxDimension: 720 };
    if (variant === 'foreign-input') frame.inputUri = '/foreign/preview.mp4';
    if (variant === 'foreign-output') frame.outputUri = '/foreign/frame.png';
    if (variant === 'different-time') frame.atMs = 100;
    if (variant === 'different-dimension') frame.maxDimension = 160;
    if (variant === 'original') await guarded.execute({ type: 'trim', previewProfile: 'take-v1' }, {});
    if (variant === 'export') await guarded.execute({ type: 'render-manual-video-sequence', outputUri: '/owned/final.mp4', ownedWorkspaceUri: '/owned/final-job' }, {});
    await guarded.execute(frame, {});
    assert.equal(scopes.length, variant === 'export' ? 2 : 1, variant);
  }
});
