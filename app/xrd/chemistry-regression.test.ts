import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CASES, sampleCase, specimenFor } from './cases.ts';
import { edsElements, runSemEds } from './followups.ts';
import { afterDecision } from './lab.ts';
import type { Specimen } from './measure.ts';
import type { PhaseAmount } from './synthesis.ts';
import { synthesize } from './synthesis.ts';

const phase = (structureId: string, weightFraction: number): PhaseAmount => ({ structureId, weightFraction, latticeScale: 1, crystalliteNm: 100, microstrain: 0, grainUm: 1 });
const mixture = (baFraction: number): Specimen => ({ phases: [phase('catio3', 1 - baFraction), phase('batio3', baFraction)], amorphousFraction: 0 });

test('an unresolved area overlap cannot establish trace Ba when no Ba-rich particle was sampled', () => {
  const result = runSemEds(mixture(0.02), 'ba-overlap');
  assert.ok(result.unresolved.some((item) => item.element === 'Ba'));
  assert.ok(result.spots.every((spot) => !spot.includes('Ba')));
  assert.ok(!result.area.some((signal) => signal.element === 'Ba'));
  assert.ok(!edsElements(result).includes('Ba'));
});

test('a Ba-rich particle can establish Ba even when the bulk area spectrum has overlap', () => {
  // Independent particle evidence must not be suppressed by a global bulk-composition mask.
  const result = Array.from({ length: 100 }, (_, index) => runSemEds(mixture(0.02), `ba-spot-${index}`)).find((item) => item.spots.some((spot) => spot.includes('Ba')));
  assert.ok(result, 'the fixed seed collection samples a BaTiO3 grain');
  assert.ok(edsElements(result).includes('Ba'));
  assert.ok(!result.unresolved.some((item) => item.element === 'Ba'));
});

test('Ba-rich and Ti-free specimens still give usable Ba evidence', () => {
  const baRich = runSemEds(mixture(0.2), 'ba-rich');
  assert.ok(baRich.area.some((signal) => signal.element === 'Ba'));
  assert.ok(edsElements(baRich).includes('Ba'));
  assert.deepEqual(baRich.unresolved, []);
  const tiFree = runSemEds({ phases: [phase('witherite', 1)], amorphousFraction: 0 }, 'ti-free');
  assert.ok(tiFree.area.some((signal) => signal.element === 'Ba'));
  assert.deepEqual(tiFree.unresolved, []);
});

test('all seven case follow-ups only support their real heavy elements', () => {
  for (const source of CASES) {
    const expected = source.record.code === 'S-130' || source.record.code === 'S-163' ? ['Ca', 'Ti', 'Zr'] : ['Ca', 'Ti'];
    for (let index = 0; index < 100; index += 1) {
      const result = runSemEds(specimenFor(source), `case-chemistry-${index}`);
      assert.deepEqual(edsElements(result), expected, source.record.code);
      assert.ok(result.unresolved.every((item) => !edsElements(result).includes(item.element)));
    }
  }
});

test('remaking with agate avoids adding milling Zr but retains intentional Zr precursors', () => {
  const contaminated = sampleCase('S-163');
  const remade = afterDecision(contaminated.history, 'change-media');
  assert.deepEqual(remade.precursors, contaminated.history.precursors);
  assert.equal(remade.milling?.media, 'agate');
  const clean = runSemEds({ phases: synthesize(remade), amorphousFraction: 0 }, 'remade');
  assert.ok(!edsElements(clean).includes('Zr'));
  const doped = sampleCase('S-130');
  const history = { ...doped.history, milling: { media: 'zirconia' as const, minutes: 720 } };
  const dopedRemade = afterDecision(history, 'change-media');
  assert.deepEqual(dopedRemade.precursors, history.precursors);
  assert.ok(edsElements(runSemEds({ phases: synthesize(dopedRemade), amorphousFraction: 0 }, 'doped-remade')).includes('Zr'));
});
