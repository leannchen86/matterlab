import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CASE_CODES, sampleCase, specimenFor } from '../xrd/cases.ts';
import { apply, createLab, libraryFor, replay, sampleState, tgaStatus, type Action, type LabState } from '../xrd/lab.ts';
import { acquisitionFor, expectedCounts, prepareMount, type Acquisition, type MountRecord } from '../xrd/measure.ts';
import { SAMPLE_STATUS } from './copy.ts';
import { overlayScale, probeZ, resultReady, runCovers, runTag, sampleStatus } from './view.ts';

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
