import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzePattern, compareExplanations, ZERO_CHECK_SD_DEG, type AnalysisOptions, type AnalysisResult } from './analysis.ts';
import { sampleCase, specimenFor } from './cases.ts';
import { acquisitionFor, measure, prepareMount, type MountRecord, type ProgramId } from './measure.ts';
import { createRun } from './records.ts';

import { catalogPhase } from './phases.ts';
import { accumulateLines, braggScale, calculateLines } from './pattern.ts';
import { LAB_OPTICS } from './profile.ts';

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

test('lines that sit under another phase are counted as shared, not as seen or absent', () => {
  const alone = analyzePattern(clean, { candidates: ['catio3'] });
  const host = alone.phases.find((phase) => phase.id === 'catio3');
  assert.ok(host && host.detected.length > 0);
  // With nothing else in the fit, every line of the host is its own.
  assert.equal(host.shared, 0);
  // CaZrO₃ is the same perovskite with a larger cell: the scan puts its lines under the host's rather than beside them.
  const withPerovskite = analyzePattern(clean, { candidates: ['catio3', 'cazro3'] });
  const zirconate = withPerovskite.phases.find((phase) => phase.id === 'cazro3');
  assert.ok(zirconate);
  assert.notEqual(zirconate.status, 'required');
  assert.ok(zirconate.shared > 0, `shared ${zirconate.shared}`);
  // Shared lines are not evidence either way, so they are absent from both counts.
  assert.equal(zirconate.detected.length, 0);
  assert.equal(zirconate.missing.length, 0);
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

test('refining the zero does not end worse than holding it at the instrument value', () => {
  // Scans where the joint zero–displacement search dropped Ca₄Ti₃O₁₀ and ended ~700 deviance above the fit with the
  // true zero held: run 0 before the staged retry, run 3 with it. A gap under the Δχ² ≈ 10 evidence threshold settles nothing.
  const mount: MountRecord = { index: 1, aliquot: 1, method: 'front', grind: 'hand', spike: 'none', spikeFraction: 0, spin: false, preparedBy: 'queue' };
  const prepared = prepareMount(specimenFor(sampleCase('S-130')), 'S-130', mount);
  const candidates = ['baddeleyite', 'ca4ti3o10', 'catio3'];
  for (const runIndex of [0, 3]) {
    const measurement = measure(prepared, acquisitionFor('standard'), { zeroShiftDeg: -0.023 }, runIndex);
    const observation = { grid: measurement.grid, counts: measurement.counts };
    const refined = analyzePattern(observation, { candidates });
    const held = analyzePattern(observation, { candidates, zeroDeg: -0.023 });
    assert.ok(refined.deviance <= held.deviance + 10, `run ${runIndex}: refined ${refined.deviance} held ${held.deviance}`);
    for (const phase of refined.phases) assert.ok(phase.scale > 0, `run ${runIndex}: ${phase.id}`);
  }
});

test('a checked zero widens the lattice uncertainty by as much as the refitted cell follows the zero', () => {
  const standard = scan('S-101', 'standard');
  const zeroDeg = INSTRUMENT.zeroShiftDeg;
  const host = (options: Omit<AnalysisOptions, 'candidates'>) => analyzePattern(standard, { candidates: ['catio3'], ...options }).phases[0];
  const checked = host({ zeroDeg });
  const exact = host({ zeroDeg, zeroSigmaDeg: 0 });
  // Refits with the zero moved by ±5 check SDs give how far the cell estimate follows the zero.
  const delta = 5 * ZERO_CHECK_SD_DEG;
  const slope = (host({ zeroDeg: zeroDeg + delta }).latticeScale - host({ zeroDeg: zeroDeg - delta }).latticeScale) / (2 * delta);
  const added = Math.sqrt(Math.max(0, checked.latticeSigma ** 2 - exact.latticeSigma ** 2));
  const expected = Math.abs(slope) * ZERO_CHECK_SD_DEG;
  assert.ok(Math.abs(added / expected - 1) < 0.1, `added ${added} expected ${expected}`);
});

test('ordinary phase evidence pays for its scale, cell, size and strain', () => {
  const grid = { startDeg: 10, stepDeg: 0.02, count: 3501 };
  const state = { latticeScale: 1, crystalliteNm: 300, microstrain: 0.0003 };
  const column = (id: string) => {
    const reference = catalogPhase(id).reference;
    const values = new Float64Array(grid.count);
    accumulateLines(values, grid,
      calculateLines(reference, state, LAB_OPTICS, { startDeg: 10, endDeg: 80 }),
      braggScale(reference), 0, LAB_OPTICS);
    return values;
  };
  const host = column('catio3');
  const rutile = column('rutile');
  const counts = host.map((value, i) => 30 + 10000 * (value + 0.017 * rutile[i]));
  const fit = analyzePattern({ grid, counts }, { candidates: ['catio3', 'rutile'], zeroDeg: 0, zeroSigmaDeg: 0 });
  assert.equal(fit.parameterCount, 16); // 7 background + 2 × 4 phase + displacement.
  const minor = fit.phases.find((phase) => phase.id === 'rutile');
  assert.ok(minor && minor.detected.length > 0);
  assert.equal(minor.status, 'not-required');
  assert.ok(minor.deltaBic > 0 && minor.deltaBic < 10);
});
