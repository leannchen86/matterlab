import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { anisotropicEquivalents, cifNumber, equivalentIsotropic, findLoop, loopColumn, parseCif, structureFromCif } from './cif.ts';

const HEXAGONAL = { a: 4, b: 4, c: 10, alpha: 90, beta: 90, gamma: 120 };
const U_TO_B = 8 * Math.PI * Math.PI;

function structureFile(file: string) {
  return parseCif(readFileSync(new URL(`../../data/crystal-structures/${file}`, import.meta.url), 'utf8'))[0];
}

test('equivalent isotropic displacement follows the metric of a hexagonal cell', () => {
  // a*²a² = 4/3 and a₁·a₂ = −a²/2, while c is normal to a₁ and a₂: Ueq = ⅓[4/3 (U11 + U22) − 4/3 U12 + U33].
  // U11 0.012, U22 0.009, U33 0.006, U12 0.003 give ⅓(0.028 − 0.004 + 0.006) = 0.010; U13 and U23 drop out.
  assert.ok(Math.abs(equivalentIsotropic(HEXAGONAL, [0.012, 0.009, 0.006, 0.003, 0.002, -0.001]) - 0.01) < 1e-12);
  // On a 3-fold axis (U11 = U22 = 2 U12) it reduces to the mean of the diagonal.
  assert.ok(Math.abs(equivalentIsotropic(HEXAGONAL, [0.012, 0.012, 0.006, 0.006, 0, 0]) - 0.01) < 1e-12);
});

test('a site with only an anisotropic tensor takes Ueq, with absent off-diagonal columns as zero', () => {
  const block = parseCif(`data_test
_cell_length_a 4
_cell_length_b 4
_cell_length_c 10
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 120
loop_
_symmetry_equiv_pos_as_xyz
x,y,z
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
O1 0.1 0.2 0.3
loop_
_atom_site_aniso_label
_atom_site_aniso_U_11
_atom_site_aniso_U_22
_atom_site_aniso_U_33
_atom_site_aniso_U_12
O1 0.012 0.009 0.006 0.003
`)[0];
  assert.ok(Math.abs(structureFromCif(block).structure.atoms[0].bIso - U_TO_B * 0.01) < 1e-9);
});

test('corundum O1 takes Ueq rather than the mean of its diagonal', () => {
  // Hand-computed from the COD 1000032 tensors: Al1 ⅓(2 × 0.0022 + 0.0012); O1 ⅓(4/3 × 0.0055 − 4/3 × 0.0017 + 0.0019).
  // The diagonal mean for O1 would be 0.002467.
  const atoms = structureFromCif(structureFile('cod-1000032.cif')).structure.atoms;
  const u = (label: string) => (atoms.find((atom) => atom.label === label)?.bIso ?? 0) / U_TO_B;
  assert.ok(Math.abs(u('Al1') - 0.0056 / 3) < 1e-9);
  assert.ok(Math.abs(u('O1') - 0.0069667 / 3) < 1e-7);
});

test('Ueq from the calcite tensors matches the Ueq the same CIF reports', () => {
  const block = structureFile('cod-1547350.cif');
  const equivalents = anisotropicEquivalents(block, structureFromCif(block).structure.cell);
  const loop = findLoop(block, '_atom_site_u_iso_or_equiv');
  assert.ok(loop);
  const reported = loopColumn(loop, '_atom_site_u_iso_or_equiv') ?? [];
  loopColumn(loop, '_atom_site_label')?.forEach((label, row) => {
    // Reported to four decimals; the diagonal mean for O1 (0.01957) would miss 0.0186 by ten times that.
    assert.ok(Math.abs((equivalents.get(label) ?? 0) / U_TO_B - (cifNumber(reported[row]) ?? 0)) < 1e-4, label);
  });
});
