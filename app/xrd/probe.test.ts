import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CASES, specimenFor } from './cases.ts';
import { ZERO_SHIFT_LIMIT_DEG } from './lab.ts';
import { STRUCTURE_IDS, phaseReference } from './library.ts';
import { DISPLACEMENT_SD_MM } from './measure.ts';
import { lineWindow, linesNear, referenceLines } from './probe.ts';
import { CU_KALPHA1, CU_KALPHA2, LAB_OPTICS, dFromTwoTheta, lorentzPolarization, positionShift, twoThetaFromD } from './profile.ts';

test('merged lines sit at the intensity-weighted angle of reflections within 0.02° of the first', () => {
  let merged = 0;
  for (const id of STRUCTURE_IDS) {
    const groups: { first: number; weighted: number; total: number; count: number }[] = [];
    for (const reflection of phaseReference(id).reflections) {
      const twoTheta = twoThetaFromD(reflection.d, CU_KALPHA1);
      if (twoTheta === undefined || twoTheta > 120) continue;
      const intensity = reflection.multiplicity * reflection.fSquared * lorentzPolarization(twoTheta);
      const group = groups.find((item) => Math.abs(item.first - twoTheta) < 0.02);
      if (group) Object.assign(group, { weighted: group.weighted + twoTheta * intensity, total: group.total + intensity, count: group.count + 1 });
      else groups.push({ first: twoTheta, weighted: twoTheta * intensity, total: intensity, count: 1 });
    }
    const lines = referenceLines(id);
    assert.equal(lines.length, groups.length, id);
    for (const group of groups.filter((item) => item.count > 1 && item.total > 0)) {
      merged += 1;
      assert.ok(lines.some((line) => Math.abs(line.twoTheta - group.weighted / group.total) < 1e-9), `${id} ${group.first}`);
    }
  }
  assert.ok(merged > 0);
});

test('the probe window covers the largest shift the model can give a line, and no more', () => {
  const displacementMm = Math.sqrt(-2 * Math.log(2 ** -32)) * Math.max(...Object.values(DISPLACEMENT_SD_MM));
  const scale = Math.max(...CASES.flatMap((sample) => specimenFor(sample).phases.filter((phase) => phase.structureId === 'catio3').map((phase) => phase.latticeScale)));
  const weight = LAB_OPTICS.spectrum.find((line) => line.label === 'Kα2')?.weight ?? 0;
  for (let twoTheta = 5; twoTheta <= 100; twoTheta += 5) {
    const { below, above } = lineWindow(twoTheta, 'catio3');
    const expanded = twoThetaFromD(dFromTwoTheta(twoTheta, CU_KALPHA1) * scale, CU_KALPHA1) ?? NaN;
    const lowest = expanded + positionShift(expanded, displacementMm, { ...LAB_OPTICS, zeroShiftDeg: -ZERO_SHIFT_LIMIT_DEG });
    const partner = twoThetaFromD(dFromTwoTheta(twoTheta, CU_KALPHA1), CU_KALPHA2) ?? NaN;
    const highest = twoTheta + positionShift(twoTheta, -displacementMm, { ...LAB_OPTICS, zeroShiftDeg: ZERO_SHIFT_LIMIT_DEG }) + ((partner - twoTheta) * weight) / (1 + weight);
    // Expansion is exact; the unresolved-doublet pull remains a first-order approximation.
    assert.ok(Math.abs(twoTheta - lowest - below) < 1e-10, `below ${twoTheta}`);
    assert.ok(Math.abs(highest - twoTheta - above) < 0.002, `above ${twoTheta}`);
    // No case expands rutile, and a resolved satellite peaks at its own angle, so both keep only displacement and zero.
    assert.equal(lineWindow(twoTheta, 'rutile').below, lineWindow(twoTheta, 'rutile', 'Kβ').above);
  }
  // Tighter than the old fixed 0.3° at low angle, and wide enough for the 0.33–0.44° offsets of a Zr-expanded host near 90°.
  assert.ok(lineWindow(20, 'catio3').below < 0.3 && lineWindow(20, 'catio3').above < 0.3);
  assert.ok(lineWindow(90, 'catio3').below > 0.44);
  assert.ok(lineWindow(90, 'rutile').below < 0.15);
});

test('a tap past a line on its Kα2 side still finds the phase, marked Kα2', () => {
  // CaTiO₃ 59.38°: its Kα1 window ends at 59.575°, and the partner maximum sits near 59.54°.
  const hit = linesNear(59.58, ['catio3']).find((item) => Math.abs(item.twoTheta - 59.542) < 0.01);
  assert.equal(hit?.emission, 'Kα2');
  for (const line of referenceLines('rutile').filter((item) => item.twoTheta > 50 && item.twoTheta < 72 && item.relative >= 0.03)) {
    const partner = twoThetaFromD(dFromTwoTheta(line.twoTheta, CU_KALPHA1), CU_KALPHA2) ?? NaN;
    const { below, above } = lineWindow(partner, 'rutile', 'Kα2');
    for (const tap of [partner - below, partner + above]) assert.ok(linesNear(tap, ['rutile']).length > 0, `${line.twoTheta.toFixed(3)} → ${tap.toFixed(3)}`);
  }
});
