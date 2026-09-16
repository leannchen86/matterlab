import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleCase } from './cases.ts';
import {
  afterDecision,
  apply,
  compareInterpretations,
  createLab,
  debrief,
  interpretationResult,
  libraryFor,
  limitations,
  meetsObjective,
  powderLeftG,
  replay,
  sampleState,
  tgaStatus,
  type Action,
  type Debrief,
  type Decision,
  type LabState,
} from './lab.ts';
import { synthesize } from './synthesis.ts';

type Step = { readonly state: LabState; readonly id: string };

function act(state: LabState, ...actions: Action[]): Step {
  let current = state;
  let id = '';
  for (const action of actions) {
    const outcome = apply(current, action);
    if (!outcome.ok) assert.fail(`${action.type} failed: ${outcome.error}`);
    current = outcome.state;
    id = outcome.id ?? id;
  }
  return { state: current, id };
}

const scan = (code: string, program: 'survey' | 'standard' | 'slow' = 'survey'): Action => ({ type: 'scan', code, program });
const interpret = (code: string, runId: string, candidates: string[]): Action => ({ type: 'interpret', code, runId, candidates });
const call = (code: string, basis: string, phases: string[], decision: Decision, unexplained: 'none' | 'reference' | 'measurement' = 'none'): Action => ({ type: 'call', code, basis, phases, decision, unexplained });
const row = (report: Debrief | undefined, id: string) => report?.rows.find((item) => item.id === id);

function settle(code: string, program: 'survey' | 'standard', candidates: string[], seed = 'test') {
  const scanned = act(createLab(seed, [code]), scan(code, program));
  return act(scanned.state, interpret(code, scanned.id, candidates));
}

test('a clean sample is called quickly, and holding or scanning longer earns nothing', () => {
  const settled = settle('S-101', 'survey', ['catio3']);
  const released = act(settled.state, call('S-101', settled.id, ['catio3'], 'release')).state;
  const report = debrief(released, 'S-101');
  assert.deepEqual(report?.rows.map((item) => item.grade), ['good', 'good', 'good', 'good']);
  assert.equal(report?.minutes, 8);

  const held = act(settled.state, call('S-101', settled.id, ['catio3'], 'hold-reference', 'reference')).state;
  assert.equal(row(debrief(held, 'S-101'), 'decision')?.grade, 'mixed');

  const longer = act(settled.state, scan('S-101', 'slow'));
  const slow = act(longer.state, interpret('S-101', longer.id, ['catio3']));
  const late = debrief(act(slow.state, call('S-101', slow.id, ['catio3'], 'release')).state, 'S-101');
  assert.ok(row(late, 'measurement')?.notes.includes('R1 already settled it; later scans only used up the shift'));
});

test('requesting every follow-up is not rewarded when they add nothing', () => {
  const settled = settle('S-101', 'survey', ['catio3']);
  const requested = act(settled.state, { type: 'tga', code: 'S-101' }, { type: 'sem', code: 'S-101' }, { type: 'wait', minutes: 95 });
  const report = debrief(act(requested.state, call('S-101', settled.id, ['catio3'], 'release')).state, 'S-101');
  assert.ok(row(report, 'measurement')?.notes.includes('TGA and SEM/EDS added nothing new'));
});

test('references change the interpretation, never the run', () => {
  const scanned = act(createLab('test', ['S-130']), scan('S-130'));
  const runs = sampleState(scanned.state, 'S-130')?.runs;
  const host = act(scanned.state, interpret('S-130', scanned.id, ['catio3']));
  const mixture = act(host.state, interpret('S-130', scanned.id, ['catio3', 'baddeleyite']));
  const again = act(mixture.state, interpret('S-130', scanned.id, ['baddeleyite', 'catio3']));
  assert.equal(again.id, mixture.id);
  assert.equal(sampleState(again.state, 'S-130')?.interpretations.length, 2);
  assert.deepEqual(sampleState(again.state, 'S-130')?.runs, runs);
  assert.equal(compareInterpretations(again.state, 'S-130', host.id, mixture.id), 'much-better');
  const flagged = (id: string, deg: number) => interpretationResult(again.state, 'S-130', id)?.features.some((feature) => Math.abs(feature.centreDeg - deg) < 0.3);
  assert.ok(flagged(host.id, 28.2) && flagged(host.id, 31.5));
  assert.ok(!flagged(mixture.id, 28.2) && !flagged(mixture.id, 31.5));
});

test('a good fit can rest on chemistry nobody recorded', () => {
  const code = 'S-163';
  const scanned = act(createLab('test', [code]), scan(code));
  assert.ok(!libraryFor(scanned.state, code).includes('baddeleyite'));
  const refused = apply(scanned.state, interpret(code, scanned.id, ['baddeleyite', 'catio3']));
  assert.deepEqual(refused, { ok: false, error: 'not-in-library' });

  const broadened = act(scanned.state, { type: 'broaden', code, on: true }, interpret(code, scanned.id, ['baddeleyite', 'catio3']));
  const guess = debrief(act(broadened.state, call(code, broadened.id, ['baddeleyite', 'catio3'], 'change-media')).state, code);
  assert.equal(row(guess, 'support')?.grade, 'poor');
  assert.ok(row(guess, 'support')?.notes.some((note) => note.startsWith('Nothing on record for')));

  const cue = sampleCase(code).cues.find((item) => item.elements?.includes('Zr'));
  assert.ok(cue);
  const noted = act(scanned.state, { type: 'inspect', code, cue: cue.id }, interpret(code, scanned.id, ['baddeleyite', 'catio3']));
  const supported = debrief(act(noted.state, call(code, noted.id, ['baddeleyite', 'catio3'], 'change-media')).state, code);
  assert.ok(!row(supported, 'support')?.notes.some((note) => note.startsWith('Nothing on record for')));
  assert.equal(interpretationResult(noted.state, code, noted.id)?.deviance, interpretationResult(broadened.state, code, broadened.id)?.deviance);
});

test('a phase with no reference justifies holding, and claiming completeness does not', () => {
  const settled = settle('S-156', 'standard', ['catio3']);
  const held = debrief(act(settled.state, call('S-156', settled.id, ['catio3'], 'hold-reference', 'reference')).state, 'S-156');
  assert.equal(row(held, 'decision')?.grade, 'good');
  assert.ok(row(held, 'identity')?.notes.some((note) => note.endsWith('flagging it was right')));
  const released = debrief(act(settled.state, call('S-156', settled.id, ['catio3'], 'release')).state, 'S-156');
  assert.equal(row(released, 'decision')?.grade, 'poor');
  assert.equal(row(released, 'support')?.grade, 'poor');
});

test('leftover zirconia calls for a recalcine, with the unnamed calcium-rich phase flagged', () => {
  const code = 'S-130';
  const settled = settle(code, 'standard', ['baddeleyite', 'catio3']);
  const report = debrief(act(settled.state, call(code, settled.id, ['baddeleyite', 'catio3'], 'recalcine', 'reference')).state, code);
  assert.equal(report?.fixes[0], 'recalcine');
  assert.equal(row(report, 'decision')?.grade, 'good');
  assert.equal(row(report, 'identity')?.grade, 'good');
});

test('coarse grains need a new mount, not more counts', () => {
  const code = 'S-123';
  const first = act(createLab('test', [code]), scan(code, 'standard'));
  const asReceived = act(first.state, interpret(code, first.id, ['catio3']));
  assert.ok(limitations(interpretationResult(asReceived.state, code, asReceived.id)!).includes('grains'));

  const longer = act(asReceived.state, scan(code, 'slow'));
  const slow = act(longer.state, interpret(code, longer.id, ['catio3']));
  assert.ok(limitations(interpretationResult(slow.state, code, slow.id)!).includes('grains'));

  const remounted = act(slow.state, { type: 'mount', code, choice: { aliquot: 'same', method: 'front', grind: 'hand', spike: 'none', spin: true } }, scan(code, 'standard'));
  const ground = act(remounted.state, interpret(code, remounted.id, ['catio3']));
  assert.ok(!limitations(interpretationResult(ground.state, code, ground.id)!).includes('grains'));
  const runs = sampleState(ground.state, code)?.runs ?? [];
  assert.deepEqual(runs.map((item) => [item.mount.grind, item.mount.spin, item.acquisition.program]), [
    ['as-received', false, 'standard'],
    ['as-received', false, 'slow'],
    ['hand', true, 'standard'],
  ]);
  assert.equal(apply(ground.state, { type: 'mount', code, choice: { aliquot: 'same', method: 'front', grind: 'as-received', spike: 'none', spin: false } }).ok, false);
});

test('a spiked mount offers its standard without broadening the search', () => {
  const code = 'S-101';
  const lab = createLab('test', [code]);
  assert.ok(!libraryFor(lab, code).includes('silicon'));
  const spiked = act(lab, { type: 'mount', code, choice: { aliquot: 'new', method: 'front', grind: 'hand', spike: 'silicon', spin: true } }, scan(code));
  assert.ok(libraryFor(spiked.state, code).includes('silicon'));
  const fitted = act(spiked.state, { type: 'interpret', code, runId: spiked.id, candidates: ['catio3', 'silicon'], standard: true });
  assert.equal(sampleState(fitted.state, code)?.interpretations[0].internalStandard, 'silicon');
  assert.deepEqual(apply(fitted.state, call(code, fitted.id, ['catio3', 'silicon'], 'release')), { ok: false, error: 'not-in-basis' });
});

test('a shift replays exactly from its seed and actions', () => {
  const actions: Action[] = [scan('S-123'), { type: 'mount', code: 'S-123', choice: { aliquot: 'new', method: 'front', grind: 'hand', spike: 'silicon', spin: true } }, scan('S-123')];
  const played = actions.reduce((state, action) => act(state, action).state, createLab('replay', ['S-123']));
  assert.deepEqual(replay('replay', ['S-123'], actions), played);
  assert.notDeepEqual(replay('other', ['S-123'], actions).samples[0].runs[0].counts, played.samples[0].runs[0].counts);
});

test('follow-ups cost time, powder and shared instrument slots', () => {
  const lab = createLab('test', ['S-101', 'S-117', 'S-142']);
  const one = act(lab, { type: 'tga', code: 'S-101' });
  assert.equal(one.state.minute, 5);
  assert.equal(tgaStatus(one.state, 'S-101').status, 'running');
  assert.ok(Math.abs(powderLeftG(lab, 'S-101') - powderLeftG(one.state, 'S-101') - 0.02) < 1e-9);
  assert.deepEqual(apply(one.state, { type: 'tga', code: 'S-101' }), { ok: false, error: 'already-requested' });
  const two = act(one.state, { type: 'tga', code: 'S-117' });
  assert.deepEqual(apply(two.state, { type: 'tga', code: 'S-142' }), { ok: false, error: 'no-capacity' });
  assert.equal(tgaStatus(act(two.state, { type: 'wait', minutes: 90 }).state, 'S-101').status, 'ready');
  const late = act(lab, { type: 'wait', minutes: 470 });
  assert.equal(apply(late.state, scan('S-101', 'standard')).ok, false);
  assert.equal(apply(late.state, scan('S-101')).ok, true);
});

test('each batch has a cheapest fix that the forward model confirms', () => {
  const meets = (code: string, decision: Decision) => {
    const source = sampleCase(code);
    return meetsObjective(synthesize(afterDecision(source.history, decision)), source.record.objective);
  };
  for (const code of ['S-101', 'S-123']) assert.ok(meets(code, 'release'), code);
  const expected: ReadonlyArray<[string, Decision, Decision]> = [
    ['S-117', 'adjust-stoichiometry', 'recalcine'],
    ['S-130', 'recalcine', 'change-media'],
    ['S-142', 'recalcine', 'adjust-stoichiometry'],
    ['S-163', 'change-media', 'recalcine'],
  ];
  for (const [code, fix, wrong] of expected) {
    assert.ok(!meets(code, 'release'), `${code} release`);
    assert.ok(meets(code, fix), `${code} ${fix}`);
    assert.ok(!meets(code, wrong), `${code} ${wrong}`);
  }
  assert.ok(!meets('S-156', 'release'));
});
