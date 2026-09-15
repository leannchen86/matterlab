import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzePattern, compareExplanations, type AnalysisResult } from './analysis.ts';
import { sampleCase, specimenFor } from './cases.ts';
import { acquisitionFor, measure, prepareMount, type MountRecord, type ProgramId } from './measure.ts';
import { createRun } from './records.ts';

const INSTRUMENT = { zeroShiftDeg: 0.01 };

function scan(code: string, program: ProgramId) {
  const source = sampleCase(code);
  const mount: MountRecord = { index: 1, aliquot: 1, ...source.queueMount, preparedBy: 'queue' };
  const acquisition = acquisitionFor(program);
  const measurement = measure(prepareMount(specimenFor(source), `test/${code}`, mount), acquisition, INSTRUMENT, 1);
  return createRun(code, 1, mount, acquisition, 0, measurement.grid, measurement.counts);
}

const summary = (result: AnalysisResult) => ({
  deviance: result.deviance,
  features: result.features,
  phases: result.phases.map((phase) => [phase.id, phase.status, phase.deltaBic]),
});

const clean = scan('S-101', 'survey');

test('equivalent observations give the same analysis whatever the labels or pick order', () => {
  const reference = analyzePattern(clean, { candidates: ['catio3', 'rutile'] });
  const plain = analyzePattern({ grid: { ...clean.grid }, counts: Array.from(clean.counts) }, { candidates: ['rutile', 'catio3'] });
  const relabelled = createRun('S-999', 7, { ...clean.mount, index: 4, aliquot: 3 }, clean.acquisition, 300, clean.grid, clean.counts);
  assert.deepEqual(summary(plain), summary(reference));
  assert.deepEqual(summary(analyzePattern(relabelled, { candidates: ['catio3', 'rutile'] })), summary(reference));
});

test('analysis never alters the counts it reads', () => {
  const before = Uint32Array.from(clean.counts);
  analyzePattern(clean, { candidates: ['catio3', 'calcite'] });
  assert.deepEqual(clean.counts, before);
});

test('with no candidates the analysis says so instead of inventing a fit', () => {
  const result = analyzePattern(clean, { candidates: [] });
  assert.ok(result.warnings.includes('no-candidates'));
  assert.equal(result.phases.length, 0);
});

test('extra candidates are not rewarded', () => {
  const single = analyzePattern(clean, { candidates: ['catio3'] });
  const padded = analyzePattern(clean, { candidates: ['calcite', 'catio3', 'rutile'] });
  for (const phase of padded.phases) if (phase.id !== 'catio3') assert.notEqual(phase.status, 'required');
  assert.ok(['similar', 'worse', 'much-worse'].includes(compareExplanations(single, padded)));
});

test('more counts strengthen the evidence for a weak minor phase', () => {
  const survey = analyzePattern(scan('S-117', 'survey'), { candidates: ['catio3', 'rutile'] });
  const standard = analyzePattern(scan('S-117', 'standard'), { candidates: ['catio3', 'rutile'] });
  const rutile = (result: AnalysisResult) => result.phases.find((phase) => phase.id === 'rutile');
  assert.ok((rutile(standard)?.deltaBic ?? 0) > 2 * (rutile(survey)?.deltaBic ?? 0));
  assert.equal(rutile(standard)?.status, 'required');
  const hostOnly = analyzePattern(scan('S-117', 'standard'), { candidates: ['catio3'] });
  assert.equal(compareExplanations(hostOnly, standard), 'much-better');
  assert.equal(compareExplanations(standard, hostOnly), 'much-worse');
});
