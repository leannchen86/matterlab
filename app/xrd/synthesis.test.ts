import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CASES, sampleCase } from './cases.ts';
import { synthesize, ZR_LATTICE_PER_MOL_PERCENT, type SynthesisHistory } from './synthesis.ts';

// Formula masses use the simulation's existing chemical mass convention.
// This reconstructs element ratios from public outputs; it does not duplicate kinetic or phase-allocation logic.
const MASS = { CaCO3: 100.087, TiO2: 79.866, ZrO2: 123.218, CaO: 56.077, CaOH2: 74.093, CaTiO3: 135.943, Ca4Ti3O10: 463.903 };
const normalized = (moles: number[]) => moles.map((n) => n / moles.reduce((sum, value) => sum + value, 0));
function feedMetals(history: SynthesisHistory) {
  const grams = (material: string) => history.precursors.filter((p) => p.material === material).reduce((sum, p) => sum + p.massG, 0);
  return normalized([
    grams('CaCO3') * (1 - history.carbonateMoisture) / MASS.CaCO3,
    grams('TiO2') / MASS.TiO2,
    grams('ZrO2') / MASS.ZrO2 + (history.milling?.media === 'zirconia' ? history.milling.minutes * 3e-6 : 0),
  ]);
}
function productMetals(history: SynthesisHistory) {
  const result = [0, 0, 0];
  const phases = synthesize(history);
  assert.ok(Math.abs(phases.reduce((sum, p) => sum + p.weightFraction, 0) - 1) < 1e-12);
  for (const phase of phases) {
    const zr = phase.structureId === 'catio3' ? (phase.latticeScale - 1) / (100 * ZR_LATTICE_PER_MOL_PERCENT) : 0;
    assert.ok(zr >= -1e-12 && zr <= 1 + 1e-12, 'host occupancy must remain physical');
    const formula: Record<string, readonly [number, number, number, number]> = {
      catio3: [1, 1 - zr, zr, MASS.CaTiO3 + zr * (MASS.ZrO2 - MASS.TiO2)],
      ca4ti3o10: [4, 3, 0, MASS.Ca4Ti3O10],
      rutile: [0, 1, 0, MASS.TiO2], anatase: [0, 1, 0, MASS.TiO2],
      baddeleyite: [0, 0, 1, MASS.ZrO2], calcite: [1, 0, 0, MASS.CaCO3],
      lime: [1, 0, 0, MASS.CaO], portlandite: [1, 0, 0, MASS.CaOH2],
    };
    const [ca, ti, z, molarMass] = formula[phase.structureId];
    [ca, ti, z].forEach((count, i) => { result[i] += phase.weightFraction * count / molarMass; });
  }
  return normalized(result);
}
for (const source of CASES) {
  test(`${source.record.code} conserves Ca, Ti, Zr ratios through its returned phase weights and host occupancy`, () => {
    const want = feedMetals(source.history), got = productMetals(source.history);
    got.forEach((value, i) => assert.ok(Math.abs(value - want[i]) < 1e-10, `${['Ca', 'Ti', 'Zr'][i]}: ${value} versus ${want[i]}`));
  });
}
const base = sampleCase('S-130').history;
for (const [label, history] of [
  ['partial conversion', { ...base, calcination: { ...base.calcination, temperatureC: 700, hours: 0.1 } }],
  ['Ca-limited zirconia', { ...base, precursors: [{ material: 'CaCO3', massG: 8 }, ...base.precursors.filter((p) => p.material !== 'CaCO3')] }],
  ['Ti-limited RP phase', { ...base, precursors: [{ material: 'CaCO3', massG: .12 * MASS.CaCO3 }, { material: 'TiO2', massG: .025 * MASS.TiO2 }, { material: 'ZrO2', massG: .075 * MASS.ZrO2 }], calcination: { ...base.calcination, temperatureC: 1400, hours: 24 } }],
] as const) {
  test(`${label} conserves metal inventory`, () => {
    const want = feedMetals(history), got = productMetals(history);
    got.forEach((value, i) => assert.ok(Math.abs(value - want[i]) < 1e-10, `${label} ${['Ca', 'Ti', 'Zr'][i]}: ${value} versus ${want[i]}`));
  });
}

