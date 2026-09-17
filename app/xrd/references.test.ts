import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vector3 } from './crystallography.ts';
import { accumulateLines, calculateLines, REFERENCE_STATE } from './pattern.ts';
import { STRUCTURE_IDS, phaseReference } from './library.ts';
import { CU_KALPHA1, LAB_OPTICS, lorentzPolarization, twoThetaFromD } from './profile.ts';
import { hashSeed } from './random.ts';
import { PHASE_DATA, REFERENCE_DATA_VERSION } from './references.generated.ts';

function strongestLines(id: string, count: number, limitDeg = 90) {
  const merged: { twoTheta: number; intensity: number }[] = [];
  for (const reflection of phaseReference(id).reflections) {
    const twoTheta = twoThetaFromD(reflection.d, CU_KALPHA1);
    if (twoTheta === undefined || twoTheta > limitDeg) continue;
    const intensity = reflection.multiplicity * reflection.fSquared * lorentzPolarization(twoTheta);
    const near = merged.find((line) => Math.abs(line.twoTheta - twoTheta) < 0.02);
    if (near) near.intensity += intensity;
    else merged.push({ twoTheta, intensity });
  }
  return merged.sort((left, right) => right.intensity - left.intensity).slice(0, count);
}

function hasLineNear(id: string, twoTheta: number, tolerance: number, minimumRelative: number) {
  const lines = strongestLines(id, 200, 120);
  const max = lines[0].intensity;
  return lines.some((line) => Math.abs(line.twoTheta - twoTheta) <= tolerance && line.intensity / max >= minimumRelative);
}

const odd = (value: number) => value % 2 !== 0;
const ABSENCE: Readonly<Record<string, (hkl: Vector3) => boolean>> = {
  catio3: ([h, k, l]) => (h === 0 && odd(k + l)) || (l === 0 && odd(h)) || (h === 0 && l === 0 && odd(k)),
  cazro3: ([h, k, l]) => (h === 0 && odd(k + l)) || (l === 0 && odd(h)) || (h === 0 && l === 0 && odd(k)),
  witherite: ([h, k, l]) => (h === 0 && odd(k + l)) || (l === 0 && odd(h)) || (h === 0 && l === 0 && odd(k)),
  ca4ti3o10: ([h, k, l]) => (h === 0 && odd(k)) || (k === 0 && odd(l)) || (l === 0 && odd(h)),
  catio2o4: ([h, k, l]) => odd(h + k) || (k === 0 && odd(l)),
  silicon: ([h, k, l]) => {
    const allOdd = odd(h) && odd(k) && odd(l);
    const allEven = !odd(h) && !odd(k) && !odd(l);
    return !(allOdd || (allEven && (h + k + l) % 4 === 0));
  },
  lime: ([h, k, l]) => !((odd(h) && odd(k) && odd(l)) || (!odd(h) && !odd(k) && !odd(l))),
  anatase: ([h, k, l]) => odd(h + k + l),
};

test('generated data carries the version its content hashes to', () => {
  const body = PHASE_DATA.map((phase) => `  ${JSON.stringify(phase)},`).join('\n');
  assert.equal(REFERENCE_DATA_VERSION, `refs-${hashSeed(body).toString(16).padStart(8, '0')}`);
});

test('every reference records provenance and physical cell contents', () => {
  for (const id of STRUCTURE_IDS) {
    const reference = phaseReference(id);
    assert.ok(reference.source.database.length > 0 && reference.source.entry.length > 0, id);
    assert.ok(reference.contents.density > 1 && reference.contents.density < 8, id);
    assert.ok(reference.contents.massAttenuation > 10, id);
    assert.ok(reference.reflections.length >= 8, `${id}: ${reference.reflections.length} reflections`);
  }
});

test('silicon reproduces the NIST SRM 640f line positions for Cu Kα1', () => {
  // Positions for a = 5.431144 Å and λ = 1.5405929 Å.
  const certified: [Vector3, number][] = [
    [[1, 1, 1], 28.441],
    [[2, 2, 0], 47.301],
    [[3, 1, 1], 56.12],
    [[4, 0, 0], 69.127],
    [[3, 3, 1], 76.373],
    [[4, 2, 2], 88.026],
  ];
  const reference = phaseReference('silicon');
  for (const [hkl, twoTheta] of certified) {
    const reflection = reference.reflections.find((candidate) => [...candidate.hkl].map(Math.abs).sort().join() === [...hkl].sort().join());
    assert.ok(reflection, `missing ${hkl.join('')}`);
    assert.ok(Math.abs((twoThetaFromD(reflection.d, CU_KALPHA1) ?? 0) - twoTheta) < 0.003, hkl.join(''));
  }
});

test('calculated reflections obey the extinction rules of each space group', () => {
  for (const [id, absent] of Object.entries(ABSENCE)) {
    const violations = phaseReference(id).reflections.filter((reflection) => absent(reflection.hkl));
    assert.equal(violations.length, 0, `${id}: ${violations[0]?.hkl.join(' ')}`);
  }
});

test('strongest lines stay where the structures put them', () => {
  const anchors: Record<string, number> = {
    catio3: 33.125,
    rutile: 27.44,
    anatase: 25.307,
    lime: 37.321,
    portlandite: 34.101,
    calcite: 29.409,
    silicon: 28.441,
    baddeleyite: 28.183,
    cazro3: 31.558,
    batio3: 31.535,
    witherite: 23.889,
    catio2o4: 32.594,
    ca4ti3o10: 32.827,
  };
  for (const [id, twoTheta] of Object.entries(anchors)) {
    assert.ok(Math.abs(strongestLines(id, 1)[0].twoTheta - twoTheta) < 0.005, id);
  }
  const corundum = strongestLines('corundum', 3).map((line) => line.twoTheta.toFixed(1)).sort();
  assert.deepEqual(corundum, ['35.1', '43.3', '57.5']);
});

test('diagnostic lines used by the chemical context are present', () => {
  // Monoclinic ZrO₂ from zirconia media: −111 and 111.
  assert.ok(hasLineNear('baddeleyite', 28.17, 0.03, 0.5));
  assert.ok(hasLineNear('baddeleyite', 31.46, 0.03, 0.5));
  // Ca₄Ti₃O₁₀ basal reflections 004 and 006 appear below the perovskite region.
  assert.ok(hasLineNear('ca4ti3o10', 13.0, 0.1, 0.005));
  assert.ok(hasLineNear('ca4ti3o10', 19.6, 0.1, 0.005));
  // Portlandite 001 is the reflection enhanced by platelet orientation.
  assert.ok(hasLineNear('portlandite', 18.07, 0.03, 0.3));
});

test('high-angle Kβ lines survive the shorter-wavelength reference cutoff', () => {
  const reference = phaseReference('silicon');
  const lines = calculateLines(reference, REFERENCE_STATE, LAB_OPTICS, { startDeg: 103, endDeg: 120 });
  // Independent cubic-cell Bragg positions for a = 5.431144 Å, λ(Kβ) = 1.39225 Å;
  // confirmed with pymatgen from the source CIF. Their Kα1 counterparts lie beyond 120°.
  for (const [indices, expected] of [['620', 108.316242], ['533', 114.382811]] as const) {
    const line = lines.find((candidate) => candidate.emission === 'Kβ'
      && [...reference.reflections[candidate.reflection].hkl].map(Math.abs).sort((a, b) => b - a).join('') === indices);
    assert.ok(line, `missing Si ${indices} Kβ`);
    assert.ok(Math.abs(line.twoTheta - expected) < 0.0002, `${indices}: ${line.twoTheta}`);
    assert.ok(line.intensity > 0);
  }
});

test('coverage includes expanded-cell lines whose tails enter the upper scan edge', () => {
  const reference = phaseReference('catio3');
  const state = { latticeScale: 1.01, crystalliteNm: 20, microstrain: 0.004 };
  const lines = calculateLines(reference, state, LAB_OPTICS, { startDeg: 118.5, endDeg: 120 });
  // This Kβ line is at 123.219868° before expansion, beyond the unexpanded 120° + 3° cutoff.
  const line = lines.find((candidate) => candidate.emission === 'Kβ'
    && reference.reflections[candidate.reflection].hkl.join(',') === '3,5,5');
  assert.ok(line);
  assert.ok(Math.abs(line.twoTheta - 121.154965) < 0.0002);
  const grid = { startDeg: 119.9, stepDeg: 0.01, count: 11 };
  const tail = new Float64Array(grid.count);
  accumulateLines(tail, grid, [line], 1, 0, LAB_OPTICS);
  assert.ok(tail.every((count) => count > 0), 'the outside peak contributes inside the measured range');
});
