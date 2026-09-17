import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureAnalysis } from '../xrd/analysis-client.ts';
import { apply, createLab, debrief, type Action, type LabState } from '../xrd/lab.ts';
import { callResult, completeLatestCall, latestPresentation } from './presentation.ts';

function act(state: LabState, action: Action) {
  const result = apply(state, action);
  assert.ok(result.ok, action.type);
  return result.state;
}

test('restoration follows the most recent instrument operation across samples, not an earlier saved call', () => {
  let state = createLab('test', ['S-101', 'S-117']);
  assert.equal(latestPresentation(state), undefined);
  state = act(state, { type: 'scan', code: 'S-101', program: 'survey' });
  assert.equal(latestPresentation(state)?.stage, 'review');
  assert.equal(latestPresentation(state)?.context.runNumber, 1);
  state = act(state, { type: 'mount', code: 'S-117', choice: { aliquot: 'same', method: 'back', grind: 'hand', spike: 'none', spin: true } });
  assert.equal(latestPresentation(state)?.stage, 'closed');
  assert.equal(latestPresentation(state)?.context.sampleId, 'S-117');
  assert.equal(latestPresentation(state)?.context.runNumber, 0);
  state = act(state, { type: 'wait', minutes: 1 });
  assert.equal(latestPresentation(state)?.context.sampleId, 'S-117');
  state = act(state, { type: 'standard' });
  assert.equal(latestPresentation(state), undefined);
});

test('a restored call keeps its older basis run and its support/hold result', () => {
  let state = createLab('test', ['S-101', 'S-117']);
  state = act(state, { type: 'scan', code: 'S-101', program: 'survey' });
  const runId = state.samples[0].runs[0].id;
  state = act(state, { type: 'interpret', code: 'S-101', runId, candidates: ['catio3'] });
  const basis = state.samples[0].interpretations[0].id;
  state = act(state, { type: 'scan', code: 'S-101', program: 'slow' });
  state = act(state, { type: 'call', code: 'S-101', basis, phases: ['catio3'], unexplained: 'reference', decision: 'hold-reference' });
  const target = latestPresentation(state);
  assert.equal(target?.stage, 'complete');
  assert.equal(target?.context.runNumber, 1);
  const report = debrief(state, 'S-101');
  assert.ok(report);
  const result = callResult(state.samples[0], report);
  assert.equal(result?.runNumber, 1);
  assert.equal(result?.supported, true);
  assert.equal(result?.uncertain, true);
  assert.equal(result?.held, true);
  assert.equal(result?.decision, 'Hold for reference');
  state = act(state, { type: 'scan', code: 'S-117', program: 'survey' });
  assert.equal(latestPresentation(state)?.stage, 'review');
  assert.equal(latestPresentation(state)?.context.sampleId, 'S-117');
});

function calledState(seed = 'test') {
  let state = createLab(seed, ['S-101', 'S-117']);
  state = act(state, { type: 'scan', code: 'S-101', program: 'survey' });
  state = act(state, { type: 'interpret', code: 'S-101', runId: state.samples[0].runs[0].id, candidates: ['catio3'] });
  return act(state, { type: 'call', code: 'S-101', basis: state.samples[0].interpretations[0].id, phases: ['catio3'], unexplained: 'none', decision: 'release' });
}

test('saved-call completion needs no mounted workbench or transient unreported flag', async () => {
  const saved = calledState();
  const completed = await completeLatestCall(saved, () => saved, ensureAnalysis);
  assert.equal(completed?.key, latestPresentation(saved)?.key);
  assert.equal(completed?.result.sampleId, 'S-101');
  assert.equal(completed?.result.supported, true);
  assert.equal(completed?.result.decision, 'Release');
  assert.equal(completed?.result.held, false);
});

test('a delayed saved call cannot replace a later scan or a new shift, even when run IDs repeat', async () => {
  for (const supersede of [
    (state: LabState) => act(state, { type: 'scan', code: 'S-117', program: 'survey' }),
    () => calledState('another-seed'),
  ]) {
    const saved = calledState();
    let current = saved;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const completed = completeLatestCall(saved, () => current, async (run, options) => {
      await barrier;
      return ensureAnalysis(run, options);
    });
    current = supersede(saved);
    release();
    assert.equal(await completed, undefined);
  }
});
