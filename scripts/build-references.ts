// Builds app/xrd/references.generated.ts from the crystal structures in data/crystal-structures.
// Run with `pnpm references`; Node 22.18 or later runs this TypeScript file directly.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCif, structureFromCif, type StructureProvenance } from '../app/xrd/cif.ts';
import {
  cellContents,
  computeReflections,
  expandUnitCell,
  parseSymmetryOperation,
  uniqueRotations,
  type CrystalStructure,
  type Reflection,
  type SymmetryOperation,
  type UnitCell,
  type Vector3,
} from '../app/xrd/crystallography.ts';
import type { PhaseData } from '../app/xrd/library.ts';
import { CU_KALPHA1, DEG, lorentzPolarization, twoThetaFromD } from '../app/xrd/profile.ts';
import { hashSeed } from '../app/xrd/random.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'app/xrd/references.generated.ts');
const MAX_TWO_THETA = 120;
const D_MIN = CU_KALPHA1 / (2 * Math.sin((MAX_TWO_THETA / 2) * DEG));

type AxisOrder = readonly [number, number, number];

type Entry = {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly formula: string;
  readonly spaceGroup: string;
  readonly database: string;
  readonly entry: string;
  /** New axis i is the file's axis order[i]; converts to the setting used for hkl labels. */
  readonly axes?: AxisOrder;
  readonly symmetryOperations?: readonly string[];
  readonly cell?: Partial<UnitCell>;
  /** Replaces displacement parameters: one value for every site, or values by site label. */
  readonly bIso?: number | Readonly<Record<string, number>>;
  readonly citation?: string;
  readonly notes?: readonly string[];
  /** Reflection conditions of the target setting, checked against the calculated list. */
  readonly absent?: (hkl: Vector3) => boolean;
};

const odd = (value: number) => value % 2 !== 0;
const pnma = ([h, k, l]: Vector3) => (h === 0 && odd(k + l)) || (l === 0 && odd(h)) || (h === 0 && l === 0 && odd(k));
const pbca = ([h, k, l]: Vector3) => (h === 0 && odd(k)) || (k === 0 && odd(l)) || (l === 0 && odd(h));
const cmcm = ([h, k, l]: Vector3) => odd(h + k) || (k === 0 && odd(l));

const P4MM = ['x,y,z', '-x,-y,z', '-y,x,z', 'y,-x,z', 'x,-y,z', '-x,y,z', '-y,-x,z', 'y,x,z'];

const ENTRIES: readonly Entry[] = [
  { id: 'catio3', file: 'cod-1567488.cif', name: 'Perovskite', formula: 'CaTiO₃', spaceGroup: 'Pnma', database: 'COD', entry: '1567488', axes: [1, 2, 0], absent: pnma, notes: ['Converted from Pbnm to Pnma (a′ = b, b′ = c, c′ = a).'] },
  { id: 'rutile', file: 'cod-9004141.cif', name: 'Rutile', formula: 'TiO₂', spaceGroup: 'P4₂/mnm', database: 'COD', entry: '9004141' },
  {
    id: 'anatase',
    file: 'cod-9015929.cif',
    name: 'Anatase',
    formula: 'TiO₂',
    spaceGroup: 'I4₁/amd',
    database: 'COD',
    entry: '9015929',
    bIso: { Ti: 0.458, O: 0.568 },
    notes: [
      'The CIF labels its anisotropic columns U11 U22 U33 U12 U13 U23, but the values follow U11 U12 U13 U22 U23 U33 (read as labelled, U22 = U33 = 0). B recomputed from the reordered diagonal: Ti 0.458 Å², O 0.568 Å².',
    ],
  },
  { id: 'lime', file: 'cod-9006694.cif', name: 'Lime', formula: 'CaO', spaceGroup: 'Fm-3m', database: 'COD', entry: '9006694' },
  { id: 'portlandite', file: 'cod-1008781.cif', name: 'Portlandite', formula: 'Ca(OH)₂', spaceGroup: 'P-3m1', database: 'COD', entry: '1008781' },
  { id: 'calcite', file: 'cod-1547350.cif', name: 'Calcite', formula: 'CaCO₃', spaceGroup: 'R-3c', database: 'COD', entry: '1547350' },
  { id: 'corundum', file: 'cod-1000032.cif', name: 'Corundum', formula: 'Al₂O₃', spaceGroup: 'R-3c', database: 'COD', entry: '1000032' },
  {
    id: 'silicon',
    file: 'cod-9011998.cif',
    name: 'Silicon',
    formula: 'Si',
    spaceGroup: 'Fd-3m',
    database: 'COD',
    entry: '9011998',
    cell: { a: 5.431144, b: 5.431144, c: 5.431144 },
    bIso: 0.469,
    notes: [
      'Cell set to the NIST SRM 640f certified value a = 5.431144 Å at 22.5 °C.',
      'B = 0.469 Å² from C. Flensburg and R. F. Stewart, Phys. Rev. B 60 (1999) 284, doi:10.1103/PhysRevB.60.284.',
    ],
  },
  { id: 'baddeleyite', file: 'cod-2108450.cif', name: 'Baddeleyite', formula: 'ZrO₂', spaceGroup: 'P2₁/c', database: 'COD', entry: '2108450' },
  { id: 'cazro3', file: 'cod-1532747.cif', name: 'Calcium zirconate', formula: 'CaZrO₃', spaceGroup: 'Pnma', database: 'COD', entry: '1532747', axes: [2, 1, 0], absent: pnma, notes: ['Converted from Pcmn to Pnma (a′ = c, c′ = a).'] },
  { id: 'batio3', file: 'cod-2100858.cif', name: 'Barium titanate', formula: 'BaTiO₃', spaceGroup: 'P4mm', database: 'COD', entry: '2100858', symmetryOperations: P4MM, notes: ['The CIF lists no symmetry operations; the P4mm operations are supplied by the build script.'] },
  { id: 'witherite', file: 'cod-9010928.cif', name: 'Witherite', formula: 'BaCO₃', spaceGroup: 'Pnma', database: 'COD', entry: '9010928', axes: [2, 0, 1], absent: pnma, notes: ['Converted from Pmcn to Pnma (a′ = c, b′ = a, c′ = b).'] },
  { id: 'catio2o4', file: 'cod-1008077.cif', name: 'Calcium titanium(III) oxide', formula: 'CaTi₂O₄', spaceGroup: 'Cmcm', database: 'COD', entry: '1008077', axes: [2, 0, 1], absent: cmcm, notes: ['Converted from Bbmm to Cmcm (a′ = c, b′ = a, c′ = b).', 'Early structure determination with R = 0.16.'] },
  {
    id: 'ca4ti3o10',
    file: 'computed-ca4ti3o10.cif',
    name: 'Layered calcium titanate (n = 3)',
    formula: 'Ca₄Ti₃O₁₀',
    spaceGroup: 'Pbca',
    database: 'Materials Project (computed coordinates)',
    entry: 'mp-15315',
    absent: pbca,
    citation: 'Materials Project mp-15315 (DFT coordinates, CC BY 4.0) in the cell of Elcombe et al. (1991), Acta Cryst. B47, 305',
    notes: ['DFT-relaxed fractional coordinates placed in the experimental cell (Pcab a, b exchanged to Pbca).'],
  },
];

function formatFraction(value: number) {
  const wrapped = value - Math.floor(value);
  if (wrapped < 1e-9 || 1 - wrapped < 1e-9) return '';
  for (let denominator = 2; denominator <= 12; denominator += 1) {
    const numerator = Math.round(wrapped * denominator);
    if (Math.abs(numerator / denominator - wrapped) < 1e-6) return `${numerator}/${denominator}`;
  }
  throw new Error(`Unexpected translation ${value}`);
}

function formatOperation(operation: SymmetryOperation) {
  return operation.rotation
    .map((row, axis) => {
      let text = '';
      row.forEach((coefficient, variable) => {
        const c = Math.round(coefficient);
        if (c === 0) return;
        const term = Math.abs(c) === 1 ? 'xyz'[variable] : `${Math.abs(c)}*${'xyz'[variable]}`;
        text += c < 0 ? `-${term}` : text ? `+${term}` : term;
      });
      const fraction = formatFraction(operation.translation[axis]);
      return fraction ? `${text}+${fraction}` : text;
    })
    .join(',');
}

function permuteAxes(structure: CrystalStructure, order: AxisOrder): CrystalStructure {
  const { cell } = structure;
  if (cell.alpha !== 90 || cell.beta !== 90 || cell.gamma !== 90) throw new Error('Axis permutation is only implemented for orthogonal cells');
  const lengths = [cell.a, cell.b, cell.c];
  const operations = structure.symmetryOperations.map(parseSymmetryOperation).map(
    (operation): SymmetryOperation => ({
      rotation: [0, 1, 2].map((row) => [0, 1, 2].map((column) => operation.rotation[order[row]][order[column]])) as unknown as SymmetryOperation['rotation'],
      translation: [operation.translation[order[0]], operation.translation[order[1]], operation.translation[order[2]]],
    }),
  );
  return {
    cell: { a: lengths[order[0]], b: lengths[order[1]], c: lengths[order[2]], alpha: 90, beta: 90, gamma: 90 },
    symmetryOperations: operations.map(formatOperation),
    atoms: structure.atoms.map((atom) => {
      const position = [atom.x, atom.y, atom.z];
      return { ...atom, x: position[order[0]], y: position[order[1]], z: position[order[2]] };
    }),
  };
}

function citation(provenance: StructureProvenance) {
  const surnames = provenance.authors.map((author) => author.split(',')[0].trim());
  const who = surnames.length > 2 ? `${surnames[0]} et al.` : surnames.join(' & ');
  const where = [provenance.journal, [provenance.volume, provenance.firstPage].filter(Boolean).join(', ')].filter(Boolean).join(' ');
  return `${who} (${provenance.year ?? 'undated'}), ${where}`;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));
const significant = (value: number, digits: number) => Number(value.toPrecision(digits));

function strongestLines(reflections: readonly Reflection[], limitDeg: number, count: number) {
  const merged: { twoTheta: number; intensity: number; hkl: string }[] = [];
  for (const reflection of reflections) {
    const twoTheta = twoThetaFromD(reflection.d, CU_KALPHA1);
    if (twoTheta === undefined || twoTheta > limitDeg) continue;
    const intensity = reflection.multiplicity * reflection.fSquared * lorentzPolarization(twoTheta);
    const near = merged.find((line) => Math.abs(line.twoTheta - twoTheta) < 0.02);
    if (near) {
      near.intensity += intensity;
      near.hkl += `+${reflection.hkl.join('')}`;
    } else {
      merged.push({ twoTheta, intensity, hkl: reflection.hkl.join('') });
    }
  }
  const max = Math.max(...merged.map((line) => line.intensity));
  return merged
    .sort((left, right) => right.intensity - left.intensity)
    .slice(0, count)
    .map((line) => `${line.twoTheta.toFixed(3)}° ${line.hkl} ${((100 * line.intensity) / max).toFixed(0)}`);
}

const phases: PhaseData[] = [];
for (const entry of ENTRIES) {
  const block = parseCif(readFileSync(join(ROOT, 'data/crystal-structures', entry.file), 'utf8'))[0];
  const { structure: parsed, provenance } = structureFromCif(block, { symmetryOperations: entry.symmetryOperations });
  let structure = entry.axes ? permuteAxes(parsed, entry.axes) : parsed;
  if (entry.cell) structure = { ...structure, cell: { ...structure.cell, ...entry.cell } };
  const notes = [...(entry.notes ?? [])];
  const bOverride = entry.bIso;
  if (bOverride === undefined) notes.push(...provenance.notes);
  else {
    const bFor = (label: string) => {
      const value = typeof bOverride === 'number' ? bOverride : bOverride[label];
      if (value === undefined) throw new Error(`${entry.id}: no displacement override for site ${label}`);
      return value;
    };
    structure = { ...structure, atoms: structure.atoms.map((atom) => ({ ...atom, bIso: bFor(atom.label) })) };
  }

  const reflections = computeReflections(structure, D_MIN);
  const violations = entry.absent ? reflections.filter((reflection) => entry.absent?.(reflection.hkl)) : [];
  if (violations.length) throw new Error(`${entry.id}: ${violations.length} reflections violate ${entry.spaceGroup} conditions, e.g. ${violations[0].hkl.join(' ')}`);

  const contents = cellContents(structure);
  const atoms = expandUnitCell(structure);
  const occupancy = atoms.reduce((sum, atom) => sum + atom.occupancy, 0);
  const meanB = atoms.reduce((sum, atom) => sum + atom.occupancy * atom.bIso, 0) / occupancy;
  const rotations = uniqueRotations(structure.symmetryOperations.map(parseSymmetryOperation));

  phases.push({
    id: entry.id,
    name: entry.name,
    formula: entry.formula,
    spaceGroup: entry.spaceGroup,
    cell: {
      a: round(structure.cell.a, 6),
      b: round(structure.cell.b, 6),
      c: round(structure.cell.c, 6),
      alpha: round(structure.cell.alpha, 4),
      beta: round(structure.cell.beta, 4),
      gamma: round(structure.cell.gamma, 4),
    },
    contents: {
      volume: round(contents.volume, 4),
      cellMass: round(contents.cellMass, 4),
      density: round(contents.density, 5),
      massAttenuation: round(contents.massAttenuation, 3),
      elementCounts: Object.fromEntries(Object.entries(contents.elementCounts).map(([element, count]) => [element, round(count ?? 0, 4)])),
    },
    meanB: round(meanB, 4),
    rotations: rotations.map((rotation) => rotation.flat().map((value) => Math.round(value))),
    reflections: reflections.flatMap((reflection) => [...reflection.hkl, reflection.multiplicity, round(reflection.d, 6), significant(reflection.fSquared, 6)]),
    source: {
      database: entry.database,
      entry: entry.entry,
      citation: entry.citation ?? citation(provenance),
      ...(provenance.doi ? { doi: provenance.doi } : {}),
      ...(provenance.temperatureK ? { temperatureK: provenance.temperatureK } : {}),
      notes,
    },
  });

  const bValues = [...new Set(structure.atoms.map((atom) => `${atom.label} ${atom.bIso.toFixed(3)}`))].join(', ');
  console.log(`${entry.id}: ${reflections.length} reflections, ρ ${contents.density.toFixed(3)} g/cm³, μ/ρ ${contents.massAttenuation.toFixed(1)} cm²/g, B ${bValues}`);
  console.log(`  ${strongestLines(reflections, 90, 8).join(' · ')}`);
}

const body = phases.map((phase) => `  ${JSON.stringify(phase)},`).join('\n');
const version = `refs-${hashSeed(body).toString(16).padStart(8, '0')}`;
writeFileSync(
  OUTPUT,
  `// Generated by scripts/build-references.ts from data/crystal-structures. Do not edit by hand.\n\nimport type { PhaseData } from './library.ts';\n\nexport const REFERENCE_DATA_VERSION = '${version}';\n\nexport const PHASE_DATA: readonly PhaseData[] = [\n${body}\n];\n`,
);
console.log(`Wrote ${phases.length} phases to ${OUTPUT} (${version}, d ≥ ${D_MIN.toFixed(4)} Å).`);
