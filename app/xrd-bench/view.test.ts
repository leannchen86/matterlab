import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PhaseFit, PhaseStatus } from '../xrd/analysis.ts';
import { CASE_CODES, sampleCase, specimenFor } from '../xrd/cases.ts';
import { apply, createLab, libraryFor, replay, sampleState, tgaStatus, type Action, type LabState, type TruthPhase } from '../xrd/lab.ts';
import { acquisitionFor, expectedCounts, prepareMount, type Acquisition, type MountRecord } from '../xrd/measure.ts';
import { CATALOG_IDS } from '../xrd/phases.ts';
import { PHASE_NAME, SAMPLE_STATUS } from './copy.ts';
import { GLOSS, GOAL_LINE, INTRO_LINES, LEGEND } from './gloss.ts';
import { debriefSummary, detectionReach, goalStep, lineCounts, overlayScale, probeZ, resultReady, runCovers, runTag, sampleStatus, spacingReading } from './view.ts';

function act(state: LabState, ...actions: Action[]): LabState {
  let current = state;
  for (const action of actions) {
    const outcome = apply(current, action);
    if (!outcome.ok) assert.fail(`${action.type} failed: ${outcome.error}`);
    current = outcome.state;
  }
  return current;
}

const CODE = 'S-101';
const survey: Action = { type: 'scan', code: CODE, program: 'survey' };
const remount = (aliquot: 'same' | 'new'): Action => ({ type: 'mount', code: CODE, choice: { aliquot, method: 'front', grind: 'hand', spike: 'none', spin: false } });

function tags(state: LabState, code = CODE) {
  const sample = sampleState(state, code);
  assert.ok(sample);
  return sample.runs.map((run) => runTag(sample, run));
}

test('run tags name what each run repeats or changes, from the recorded mounts', () => {
  const actions: Action[] = [
    survey,
    { type: 'scan', code: CODE, program: 'standard' },
    remount('same'),
    survey,
    remount('new'),
    survey,
    { type: 'scan', code: CODE, program: 'targeted', centreDeg: 27.5 },
  ];
  const state = act(createLab('view-tags', CASE_CODES), ...actions);
  assert.deepEqual(tags(state), ['R1 SURVEY', 'R2 STANDARD · RESCAN', 'R3 SURVEY · NEW MOUNT', 'R4 SURVEY · NEW ALIQUOT', 'R5 TARGET 27.5°']);
  assert.deepEqual(tags(replay('view-tags', CASE_CODES, actions)), tags(state));
});

test('a mount made before any scan still tags its first run as a new mount or aliquot', () => {
  const same = act(createLab('view-first', CASE_CODES), remount('same'), survey);
  assert.deepEqual(tags(same), ['R1 SURVEY · NEW MOUNT']);
  const fresh = act(createLab('view-first', CASE_CODES), remount('new'), survey, survey);
  assert.deepEqual(tags(fresh), ['R1 SURVEY · NEW ALIQUOT', 'R2 SURVEY · RESCAN']);
});

test('the probe reads a significance only at angles the displayed run measured', () => {
  const state = act(createLab('view-probe', CASE_CODES), survey, { type: 'scan', code: CODE, program: 'targeted', centreDeg: 27.5 });
  const [wide, target] = sampleState(state, CODE)?.runs ?? [];
  assert.ok(wide && target);
  // A fit that matches the targeted run exactly: zero residual wherever the run measured.
  const matched = { calculated: Float64Array.from(target.counts), pointsPerFwhm: 4 };
  const lastDeg = target.grid.startDeg + (target.grid.count - 1) * target.grid.stepDeg;
  assert.equal(probeZ(target, matched, 27.5), 0);
  assert.equal(probeZ(target, matched, target.grid.startDeg), 0);
  assert.equal(probeZ(target, matched, lastDeg), 0);
  // 47.6° was probed on the survey, never measured by the 26-29° targeted run.
  assert.equal(runCovers(wide, 47.6), true);
  assert.equal(runCovers(target, 47.6), false);
  assert.equal(probeZ(target, matched, 47.6), undefined);
  assert.equal(probeZ(target, matched, target.grid.startDeg - 0.5), undefined);
  assert.equal(probeZ(target, matched, lastDeg + 0.5), undefined);
});

test('a targeted run on the queue mount counts as an earlier run on that mount', () => {
  const state = act(createLab('view-target', CASE_CODES), { type: 'scan', code: CODE, program: 'targeted', centreDeg: 33 }, survey);
  assert.deepEqual(tags(state), ['R1 TARGET 33.0°', 'R2 SURVEY · RESCAN']);
});

function statusWord(state: LabState, code = CODE) {
  const sample = sampleState(state, code);
  assert.ok(sample);
  return SAMPLE_STATUS[sampleStatus(state, sample)];
}

test('the sample menu status says what was spent, when a test is back, and when the call is in, never a grade', () => {
  const fresh = createLab('view-status', CASE_CODES);
  assert.equal(statusWord(fresh), 'NEW');
  const read = act(fresh, { type: 'inspect', code: CODE, cue: sampleCase(CODE).cues[0].id });
  assert.equal(statusWord(read), 'STARTED');
  const scanned = act(createLab('view-status', CASE_CODES), survey);
  assert.equal(statusWord(scanned), 'STARTED');
  const sent = act(fresh, { type: 'tga', code: CODE });
  assert.equal(statusWord(sent), 'STARTED');
  const request = sampleState(sent, CODE)?.tga;
  assert.ok(request);
  const almost = act(sent, { type: 'wait', minutes: request.readyMinute - sent.minute - 1 });
  assert.equal(statusWord(almost), 'STARTED');
  assert.equal(tgaStatus(almost, CODE).status, 'running');
  const back = act(almost, { type: 'wait', minutes: 1 });
  assert.equal(statusWord(back), 'RESULT READY');
  assert.equal(tgaStatus(back, CODE).status, 'ready');
  const other = sampleState(back, CASE_CODES.find((code) => code !== CODE) ?? CODE);
  assert.ok(other && other.code !== CODE);
  assert.equal(resultReady(back, other), false);
  assert.equal(statusWord(back, other.code), 'NEW');

  const run = act(back, survey);
  const runId = sampleState(run, CODE)?.runs[0]?.id;
  assert.ok(runId);
  const fitted = apply(run, { type: 'interpret', code: CODE, runId, candidates: [libraryFor(run, CODE)[0]] });
  if (!fitted.ok || !fitted.id) return assert.fail('interpret failed');
  const phase = libraryFor(run, CODE)[0];
  const called = act(fitted.state, { type: 'call', code: CODE, phases: [phase], unexplained: 'none', decision: 'release', basis: fitted.id });
  assert.equal(statusWord(called), 'COMMITTED');
});

const MOUNT: MountRecord = { index: 1, aliquot: 1, method: 'front', grind: 'hand', spike: 'none', spikeFraction: 0, spin: false, preparedBy: 'queue' };
const INSTRUMENT = { zeroShiftDeg: 0 };

function strongest(acquisition: Acquisition, prepared: ReturnType<typeof prepareMount>) {
  const { grid, mean } = expectedCounts(prepared, acquisition, INSTRUMENT);
  let best = 0;
  for (let index = 1; index < mean.length; index += 1) if (mean[index] > mean[best]) best = index;
  return { deg: grid.startDeg + best * grid.stepDeg, counts: mean[best] };
}

test('overlay scale lines up the strongest peak of the same mount across programs', () => {
  const prepared = prepareMount(specimenFor(sampleCase(CODE)), `test/${CODE}`, MOUNT, 0);
  const standard = strongest(acquisitionFor('standard'), prepared);
  const checks: Acquisition[] = [acquisitionFor('survey'), acquisitionFor('slow'), acquisitionFor('wide'), acquisitionFor('targeted', standard.deg)];
  for (const overlay of checks) {
    const peak = strongest(overlay, prepared);
    assert.ok(Math.abs(peak.deg - standard.deg) < 0.05, `${overlay.program} peak at ${peak.deg}`);
    const scaled = peak.counts * overlayScale(acquisitionFor('standard'), overlay);
    assert.ok(Math.abs(scaled / standard.counts - 1) < 0.1, `${overlay.program}: ${scaled.toFixed(0)} vs ${standard.counts.toFixed(0)}`);
  }
  assert.equal(overlayScale(acquisitionFor('survey'), acquisitionFor('survey')), 1);
});

type ReachPhase = Pick<PhaseFit, 'id' | 'scale' | 'status' | 'detectionScale'>;
const reachPhase = (id: string, scale: number, status: PhaseStatus, detectionScale: number): ReachPhase => ({ id, scale, status, detectionScale });

test('detection reach says what this scan could have shown, over the fitted phases and without the spike', () => {
  // A host at scale 100 and a spike at 900: a candidate reaching detection at 0.4 is under a two-hundredth of the host alone.
  const phases = [reachPhase('catio3', 100, 'required', 0.02), reachPhase('silicon', 900, 'required', 0.02), reachPhase('rutile', 0, 'not-detected', 0.4)];
  assert.equal(detectionReach(phases, 'rutile', 'silicon'), 'small');
  // Counting the spike in the total would wrongly make the same candidate look reportable, so the spike has to be excluded.
  assert.equal(detectionReach(phases, 'rutile'), 'small');
  assert.equal(detectionReach([reachPhase('catio3', 100, 'required', 0.02), reachPhase('rutile', 0, 'not-detected', 3)], 'rutile'), 'large');
  // Every line of its own sits under another phase, so the scan cannot say what amount would have shown.
  assert.equal(detectionReach([reachPhase('catio3', 100, 'required', 0.02), reachPhase('rutile', 0, 'not-required', Infinity)], 'rutile'), 'none');
  // A phase the fit needs has no reach to report, and neither has one that was never a candidate.
  assert.equal(detectionReach(phases, 'catio3'), undefined);
  assert.equal(detectionReach(phases, 'lime'), undefined);
});

test('the spacing reading asks for a zero check before reading Zr off the host cell', () => {
  const objective = { targets: ['catio3'], zrMolPercent: 8 };
  const phases = [{ id: 'catio3', scale: 100, latticeScale: 1.004 }, { id: 'rutile', scale: 0, latticeScale: 1 }];
  // A refined zero trades against the cell, so the reading waits for a checked zero or a spike.
  assert.deepEqual(spacingReading({ zeroRefined: true, phases }, 'catio3', objective), { kind: 'check-zero' });
  assert.deepEqual(spacingReading({ zeroRefined: true, phases }, 'catio3', objective, 'silicon'), { kind: 'zr', value: 8 });
  assert.deepEqual(spacingReading({ zeroRefined: false, phases }, 'catio3', objective), { kind: 'zr', value: 8 });
  // A cell at or below the reference reads as none, never as a negative amount.
  assert.deepEqual(spacingReading({ zeroRefined: false, phases: [{ id: 'catio3', scale: 100, latticeScale: 0.999 }] }, 'catio3', objective), { kind: 'zr', value: 0 });
  // Only the host of a sample aiming at a solid solution has a reading, and only once it is fitted.
  assert.equal(spacingReading({ zeroRefined: false, phases }, 'rutile', objective), undefined);
  assert.equal(spacingReading({ zeroRefined: false, phases }, 'catio3', { targets: ['catio3'] }), undefined);
});

test('line counts separate the lines that sit under another phase from those seen and absent', () => {
  const check = { twoTheta: 33, predicted: 0, net: 0, decision: 0, detection: 0 };
  assert.deepEqual(lineCounts({ detected: [check, check], shared: 3, missing: [check] }).map((item) => `${item.count} ${item.kind}`), ['2 seen', '3 shared', '1 absent']);
});

test('every catalogued phase has a common name', () => {
  for (const id of CATALOG_IDS) assert.equal(typeof PHASE_NAME[id], 'string', `no name for ${id}`);
});

const truth = (id: string, band: TruthPhase['band'], claimed: boolean, inLibrary = true): TruthPhase => ({ id, band, claimed, inLibrary });
const summary = (truthPhases: readonly TruthPhase[], objectiveMet: boolean, fixes: Parameters<typeof debriefSummary>[0]['fixes'], decision: Parameters<typeof debriefSummary>[1]) =>
  debriefSummary({ truth: truthPhases, objectiveMet, fixes }, decision);

test('the debrief summary says what the powder was and whether the call met the aim, without a number', () => {
  const missedSecondPhase = summary([truth('catio3', 'major', true), truth('rutile', 'minor', false)], false, ['recalcine'], 'release');
  assert.equal(missedSecondPhase, 'The powder was mostly CaTiO₃ with a small amount of TiO₂ R that you did not claim. Release missed the aim; Recalcine meets it.');
  assert.equal(summary([truth('catio3', 'major', true)], true, ['release'], 'release'), 'The powder was mostly CaTiO₃. Release met the aim.');
  // A phase with no reference cannot be claimed, so the summary says so rather than blaming the player.
  assert.match(summary([truth('catio3', 'major', true), truth('ca4ti3o10', 'minor', false, false)], false, ['recalcine'], 'hold-reference'), /with no reference in the library\. Once identified, Recalcine meets the aim\./);
  assert.equal(summary([truth('catio3', 'major', true)], true, ['release'], 'hold-reference'), 'The powder was mostly CaTiO₃. Nothing needed a new reference; the batch already met the aim.');
  // Two phases in one band with the same standing are named together, and a trace is never a percentage.
  assert.match(summary([truth('catio3', 'major', true), truth('lime', 'trace', false), truth('calcite', 'trace', false)], false, [], 'release'), /a trace of CaO and CaCO₃ that you did not claim\./);
  for (const text of [missedSecondPhase, summary([truth('catio3', 'major', true), truth('lime', 'trace', false)], false, ['recalcine', 'change-media'], 'change-media')]) {
    assert.doesNotMatch(text, /\d/, text);
    assert.doesNotMatch(text, /%/, text);
  }
});

test('the goal line follows only what the bench shows', () => {
  const misfit = { features: [{ kind: 'unexplained' as const, startDeg: 30, endDeg: 30.2, centreDeg: 30.1, z: 6, contributors: [] }] };
  assert.equal(goalStep({ run: false, probing: false, chips: 0 }), 'scan');
  assert.equal(goalStep({ run: true, probing: false, chips: 0 }), 'probe');
  assert.equal(goalStep({ run: true, probing: true, chips: 0 }), 'add');
  // Chips without a finished fit ask for FIT, whether or not an angle is probed.
  assert.equal(goalStep({ run: true, probing: true, chips: 2 }), 'fit');
  assert.equal(goalStep({ run: true, probing: false, chips: 1, fit: misfit }), 'misfit');
  assert.equal(goalStep({ run: true, probing: false, chips: 1, fit: { features: [] } }), 'decide');
});

test('newcomer copy stays one short plain line with no numbers or verdicts', () => {
  const lines: string[] = [...INTRO_LINES, ...Object.values(GOAL_LINE), ...Object.values(LEGEND)];
  for (const group of Object.values(GLOSS)) lines.push(...Object.values(group));
  for (const line of lines) {
    assert.ok(line.length <= 72, `too long: ${line}`);
    assert.doesNotMatch(line, /\d|%/, `number in: ${line}`);
    assert.doesNotMatch(line, /rules? out|confirm|certain|definitely|guarantee/i, `overclaim in: ${line}`);
    // Proof only ever appears denied.
    for (const match of line.matchAll(/\b(proof|proves?)\b/gi)) assert.match(line.slice(0, match.index), /(not|never) $/i, `claims proof: ${line}`);
  }
});
