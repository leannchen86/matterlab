import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleCase, specimenFor } from './cases.ts';
import { acquisitionFor, expectedCounts, exposure, grainStatisticsCv, measure, prepareMount, type Acquisition, type MountRecord, type PreparedMount, type Specimen } from './measure.ts';
import { LAB_OPTICS, positionShift } from './profile.ts';

const INSTRUMENT = { zeroShiftDeg: 0 };
const MOUNT: MountRecord = { index: 1, aliquot: 1, method: 'front', grind: 'hand', spike: 'none', spikeFraction: 0, spin: false, preparedBy: 'queue' };
const specimen = specimenFor(sampleCase('S-101'));
const flat = prepareMount(specimen, 'test/S-101', MOUNT, 0);

function program(minutes: number, stepDeg: number, startDeg = 10, endDeg = 80): Acquisition {
  return { program: 'standard', range: { startDeg, endDeg }, stepDeg, minutes };
}

function total(values: ArrayLike<number>, from = 0, to = values.length) {
  let sum = 0;
  for (let index = from; index < to; index += 1) sum += values[index];
  return sum;
}

test('counting time scales the expected pattern and changes nothing else', () => {
  const short = expectedCounts(flat, program(30, 0.01), INSTRUMENT).mean;
  const long = expectedCounts(flat, program(120, 0.01), INSTRUMENT).mean;
  let worst = 0;
  for (let index = 0; index < short.length; index += 1) worst = Math.max(worst, Math.abs(long[index] / short[index] - 4));
  assert.ok(worst < 1e-9);
});

test('counts per bin follow minutes × step, while the integrated pattern follows minutes', () => {
  const fine = expectedCounts(flat, program(30, 0.01), INSTRUMENT).mean;
  const coarse = expectedCounts(flat, program(30, 0.02), INSTRUMENT).mean;
  assert.ok(Math.abs(total(coarse) / total(fine) - 1) < 0.005);
  const perBin = (mean: Float64Array, step: number) => total(mean, Math.round(10 / step), Math.round(65 / step)) / Math.round(55 / step);
  assert.ok(Math.abs(perBin(coarse, 0.02) / perBin(fine, 0.01) - 2) < 0.02);
  assert.ok(Math.abs(exposure(acquisitionFor('slow')) / exposure(acquisitionFor('survey')) - 20) < 1e-9);
});

test('recorded counts scatter around the expected pattern with Poisson variance', () => {
  const acquisition = acquisitionFor('survey');
  const { mean } = expectedCounts(flat, acquisition, INSTRUMENT);
  const { counts } = measure(flat, acquisition, INSTRUMENT, 1);
  let chi = 0;
  for (let index = 0; index < mean.length; index += 1) chi += (counts[index] - mean[index]) ** 2 / Math.max(mean[index], 1);
  assert.ok(Math.abs(chi / mean.length - 1) < 0.1);
});

test('a rescan redraws counting noise, and only a remount redraws grain statistics', () => {
  const again = prepareMount(specimen, 'test/S-101', MOUNT, 0);
  assert.deepEqual(again.phases.map((phase) => phase.factors), flat.phases.map((phase) => phase.factors));
  const remount = prepareMount(specimen, 'test/S-101', { ...MOUNT, index: 2 }, 0);
  assert.notDeepEqual(remount.phases[0].factors, flat.phases[0].factors);
  const acquisition = acquisitionFor('survey');
  const first = measure(flat, acquisition, INSTRUMENT, 1);
  assert.deepEqual(measure(again, acquisition, INSTRUMENT, 1).counts, first.counts);
  assert.notDeepEqual(measure(flat, acquisition, INSTRUMENT, 2).counts, first.counts);
});

test('spinning and finer grains reduce grain-statistics scatter', () => {
  assert.ok(grainStatisticsCv(30, 8, 1, true) < grainStatisticsCv(30, 8, 1, false));
  assert.ok(grainStatisticsCv(10, 8, 1, false) < grainStatisticsCv(30, 8, 1, false));
});

test('grinding changes grain statistics, not crystallite size', () => {
  const coarse = prepareMount(specimen, 'test/S-101', { ...MOUNT, grind: 'as-received' }, 0);
  const host = (prepared: PreparedMount) => prepared.phases.find((phase) => phase.phase.id === 'catio3');
  assert.equal(host(coarse)?.state.crystalliteNm, host(flat)?.state.crystalliteNm);
  assert.ok((host(coarse)?.grainUm ?? 0) > (host(flat)?.grainUm ?? Infinity));
});

test('specimen displacement moves peaks by −2s·cosθ/R', () => {
  const acquisition = program(30, 0.002, 32.4, 33.9);
  const centroid = (prepared: PreparedMount) => {
    const { grid, mean } = expectedCounts(prepared, acquisition, INSTRUMENT);
    const floor = Math.min(...mean);
    let weight = 0;
    let moment = 0;
    mean.forEach((value, index) => {
      weight += value - floor;
      moment += (value - floor) * (grid.startDeg + index * grid.stepDeg);
    });
    return moment / weight;
  };
  const expected = positionShift(33.2, 0.2, LAB_OPTICS) - LAB_OPTICS.zeroShiftDeg;
  assert.ok(expected < -0.05);
  const moved = centroid(prepareMount(specimen, 'test/S-101', MOUNT, 0.2)) - centroid(flat);
  assert.ok(Math.abs(moved - expected) < 0.2 * Math.abs(expected));
});

test('the pattern is continuous as a minor phase vanishes', () => {
  const host = specimen.phases.find((phase) => phase.structureId === 'catio3');
  assert.ok(host);
  const pure: Specimen = { phases: [{ ...host, weightFraction: 1 }], amorphousFraction: specimen.amorphousFraction };
  const trace: Specimen = {
    phases: [{ ...host, weightFraction: 1 - 1e-7 }, { structureId: 'rutile', weightFraction: 1e-7, latticeScale: 1, crystalliteNm: 180, microstrain: 0.0002, grainUm: 1 }],
    amorphousFraction: specimen.amorphousFraction,
  };
  const survey = acquisitionFor('survey');
  const a = expectedCounts(prepareMount(pure, 'test/continuity', MOUNT, 0), survey, INSTRUMENT).mean;
  const b = expectedCounts(prepareMount(trace, 'test/continuity', MOUNT, 0), survey, INSTRUMENT).mean;
  let worst = 0;
  for (let index = 0; index < a.length; index += 1) worst = Math.max(worst, Math.abs(b[index] - a[index]) / a[index]);
  assert.ok(worst < 1e-4);
});
