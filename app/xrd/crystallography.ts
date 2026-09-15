// Crystal-structure calculations for powder reference patterns.
// Everything here depends only on a documented structure (cell, symmetry operations, atom sites);
// wavelength, instrument geometry, and specimen effects are applied later by the measurement model.

import { ELEMENTS, formFactor, type ElementSymbol } from './elements.ts';

export type Vector3 = readonly [number, number, number];
export type Matrix3 = readonly [Vector3, Vector3, Vector3];

export type UnitCell = {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly alpha: number;
  readonly beta: number;
  readonly gamma: number;
};

export type SiteAtom = {
  readonly label: string;
  readonly element: ElementSymbol;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly occupancy: number;
  /** Isotropic displacement parameter B in Å². */
  readonly bIso: number;
};

export type CrystalStructure = {
  readonly cell: UnitCell;
  readonly symmetryOperations: readonly string[];
  readonly atoms: readonly SiteAtom[];
};

export type SymmetryOperation = {
  readonly rotation: Matrix3;
  readonly translation: Vector3;
};

export type ExpandedAtom = {
  readonly label: string;
  readonly element: ElementSymbol;
  readonly position: Vector3;
  readonly occupancy: number;
  readonly bIso: number;
};

export type Reflection = {
  /** Representative indices of the symmetry-equivalent family. */
  readonly hkl: Vector3;
  readonly multiplicity: number;
  /** Interplanar spacing in Å. */
  readonly d: number;
  /** |F|² for one member of the family, in electrons², including displacement factors. */
  readonly fSquared: number;
};

export type CellContents = {
  /** Unit-cell volume in Å³. */
  readonly volume: number;
  /** Mass of the unit-cell contents in g/mol (Z times the formula mass). */
  readonly cellMass: number;
  /** Calculated density in g/cm³. */
  readonly density: number;
  /** Photoabsorption mass attenuation at Cu Kα in cm²/g. */
  readonly massAttenuation: number;
  readonly elementCounts: Readonly<Partial<Record<ElementSymbol, number>>>;
};

const AVOGADRO = 6.02214076e23;
const POSITION_TOLERANCE = 2e-3;

export function parseSymmetryOperation(text: string): SymmetryOperation {
  const components = text.replace(/\s+/g, '').toLowerCase().split(',');
  if (components.length !== 3) throw new Error(`Invalid symmetry operation: ${text}`);
  const rows: number[][] = [];
  const shifts: number[] = [];
  for (const component of components) {
    const row = [0, 0, 0];
    let shift = 0;
    const terms = component.match(/[+-]?[^+-]+/g);
    if (!terms) throw new Error(`Invalid symmetry operation: ${text}`);
    for (const term of terms) {
      const sign = term.startsWith('-') ? -1 : 1;
      const body = term.replace(/^[+-]/, '');
      const axisTerm = body.match(/^(.*?)\*?([xyz])$/);
      if (axisTerm) {
        const coefficient = axisTerm[1] ? parseFraction(axisTerm[1], text) : 1;
        row['xyz'.indexOf(axisTerm[2])] += sign * coefficient;
      } else {
        shift += sign * parseFraction(body, text);
      }
    }
    rows.push(row);
    shifts.push(shift);
  }
  return {
    rotation: [toVector(rows[0]), toVector(rows[1]), toVector(rows[2])],
    translation: toVector(shifts),
  };
}

function parseFraction(value: string, source: string) {
  const [numerator, denominator] = value.split('/');
  const parsed = denominator === undefined ? Number(numerator) : Number(numerator) / Number(denominator);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number "${value}" in symmetry operation: ${source}`);
  return parsed;
}

function toVector(values: readonly number[]): Vector3 {
  return [values[0], values[1], values[2]];
}

export function applyOperation(operation: SymmetryOperation, position: Vector3): Vector3 {
  const [x, y, z] = position;
  const { rotation: r, translation: t } = operation;
  return [
    r[0][0] * x + r[0][1] * y + r[0][2] * z + t[0],
    r[1][0] * x + r[1][1] * y + r[1][2] * z + t[1],
    r[2][0] * x + r[2][1] * y + r[2][2] * z + t[2],
  ];
}

function wrapFraction(value: number) {
  const wrapped = value - Math.floor(value);
  return wrapped > 1 - 1e-6 ? 0 : wrapped;
}

function samePosition(left: Vector3, right: Vector3) {
  for (let axis = 0; axis < 3; axis += 1) {
    const delta = left[axis] - right[axis];
    if (Math.abs(delta - Math.round(delta)) > POSITION_TOLERANCE) return false;
  }
  return true;
}

/** Generates every atom in the unit cell from the asymmetric unit, merging symmetry-duplicate positions. */
export function expandUnitCell(structure: CrystalStructure): ExpandedAtom[] {
  const operations = structure.symmetryOperations.map(parseSymmetryOperation);
  const expanded: ExpandedAtom[] = [];
  for (const atom of structure.atoms) {
    const positions: Vector3[] = [];
    for (const operation of operations) {
      const moved = applyOperation(operation, [atom.x, atom.y, atom.z]);
      const position: Vector3 = [wrapFraction(moved[0]), wrapFraction(moved[1]), wrapFraction(moved[2])];
      if (positions.some((other) => samePosition(other, position))) continue;
      positions.push(position);
      expanded.push({ label: atom.label, element: atom.element, position, occupancy: atom.occupancy, bIso: atom.bIso });
    }
  }
  return expanded;
}

export function metricTensor(cell: UnitCell): Matrix3 {
  const { a, b, c } = cell;
  const cosAlpha = Math.cos((cell.alpha * Math.PI) / 180);
  const cosBeta = Math.cos((cell.beta * Math.PI) / 180);
  const cosGamma = Math.cos((cell.gamma * Math.PI) / 180);
  return [
    [a * a, a * b * cosGamma, a * c * cosBeta],
    [a * b * cosGamma, b * b, b * c * cosAlpha],
    [a * c * cosBeta, b * c * cosAlpha, c * c],
  ];
}

function determinant(m: Matrix3) {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

function invert(m: Matrix3): Matrix3 {
  const det = determinant(m);
  if (Math.abs(det) < 1e-12) throw new Error('Singular metric tensor');
  const inverse = (value: number) => value / det;
  return [
    [inverse(m[1][1] * m[2][2] - m[1][2] * m[2][1]), inverse(m[0][2] * m[2][1] - m[0][1] * m[2][2]), inverse(m[0][1] * m[1][2] - m[0][2] * m[1][1])],
    [inverse(m[1][2] * m[2][0] - m[1][0] * m[2][2]), inverse(m[0][0] * m[2][2] - m[0][2] * m[2][0]), inverse(m[0][2] * m[1][0] - m[0][0] * m[1][2])],
    [inverse(m[1][0] * m[2][1] - m[1][1] * m[2][0]), inverse(m[0][1] * m[2][0] - m[0][0] * m[2][1]), inverse(m[0][0] * m[1][1] - m[0][1] * m[1][0])],
  ];
}

export function cellVolume(cell: UnitCell) {
  return Math.sqrt(determinant(metricTensor(cell)));
}

export function reciprocalMetric(cell: UnitCell): Matrix3 {
  return invert(metricTensor(cell));
}

/** Returns 1/d² in 1/Å² for indices hkl and a reciprocal metric tensor. */
export function inverseDSquared(reciprocal: Matrix3, hkl: Vector3) {
  const [h, k, l] = hkl;
  return (
    h * h * reciprocal[0][0] +
    k * k * reciprocal[1][1] +
    l * l * reciprocal[2][2] +
    2 * (h * k * reciprocal[0][1] + h * l * reciprocal[0][2] + k * l * reciprocal[1][2])
  );
}

export function dSpacing(cell: UnitCell, hkl: Vector3) {
  return 1 / Math.sqrt(inverseDSquared(reciprocalMetric(cell), hkl));
}

export function uniqueRotations(operations: readonly SymmetryOperation[]) {
  const seen = new Set<string>();
  const rotations: Matrix3[] = [];
  for (const { rotation } of operations) {
    const key = rotation.flat().map((value) => Math.round(value)).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    rotations.push(rotation);
  }
  return rotations;
}

function compareIndices(left: Vector3, right: Vector3) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (left[axis] !== right[axis]) return left[axis] - right[axis];
  }
  return 0;
}

/** Symmetry-equivalent reciprocal-lattice indices, including Friedel mates. */
export function reflectionFamily(hkl: Vector3, rotations: readonly Matrix3[]) {
  const family = new Map<string, Vector3>();
  for (const r of rotations) {
    const transformed: Vector3 = [
      Math.round(hkl[0] * r[0][0] + hkl[1] * r[1][0] + hkl[2] * r[2][0]),
      Math.round(hkl[0] * r[0][1] + hkl[1] * r[1][1] + hkl[2] * r[2][1]),
      Math.round(hkl[0] * r[0][2] + hkl[1] * r[1][2] + hkl[2] * r[2][2]),
    ];
    const mate: Vector3 = [-transformed[0], -transformed[1], -transformed[2]];
    family.set(transformed.join(','), transformed);
    family.set(mate.join(','), mate);
  }
  return [...family.values()];
}

/**
 * Lists symmetry-unique reflections with d ≥ dMin, their multiplicities, and |F|².
 * Systematically absent reflections (|F|² numerically zero) are omitted.
 */
export function computeReflections(structure: CrystalStructure, dMin: number): Reflection[] {
  const rotations = uniqueRotations(structure.symmetryOperations.map(parseSymmetryOperation));
  const atoms = expandUnitCell(structure);
  const reciprocal = reciprocalMetric(structure.cell);
  const limit = 1 / (dMin * dMin);
  const electrons = atoms.reduce((sum, atom) => sum + atom.occupancy * ELEMENTS[atom.element].z, 0);
  const absenceThreshold = 1e-6 * electrons * electrons;
  const elements = [...new Set(atoms.map((atom) => atom.element))];
  const maxIndex = [structure.cell.a, structure.cell.b, structure.cell.c].map((length) => Math.floor(length / dMin));
  const reflections: Reflection[] = [];

  for (let h = -maxIndex[0]; h <= maxIndex[0]; h += 1) {
    for (let k = -maxIndex[1]; k <= maxIndex[1]; k += 1) {
      for (let l = -maxIndex[2]; l <= maxIndex[2]; l += 1) {
        if (h === 0 && k === 0 && l === 0) continue;
        const hkl: Vector3 = [h, k, l];
        const invD2 = inverseDSquared(reciprocal, hkl);
        if (invD2 > limit) continue;
        const family = reflectionFamily(hkl, rotations);
        if (family.some((member) => compareIndices(member, hkl) > 0)) continue;

        const s2 = invD2 / 4;
        const factors: Partial<Record<ElementSymbol, number>> = {};
        for (const element of elements) factors[element] = formFactor(element, s2);
        let real = 0;
        let imaginary = 0;
        for (const atom of atoms) {
          const amplitude = atom.occupancy * (factors[atom.element] ?? 0) * Math.exp(-atom.bIso * s2);
          const phase = 2 * Math.PI * (h * atom.position[0] + k * atom.position[1] + l * atom.position[2]);
          real += amplitude * Math.cos(phase);
          imaginary += amplitude * Math.sin(phase);
        }
        const fSquared = real * real + imaginary * imaginary;
        if (fSquared < absenceThreshold) continue;
        reflections.push({ hkl, multiplicity: family.length, d: 1 / Math.sqrt(invD2), fSquared });
      }
    }
  }

  return reflections.sort((left, right) => right.d - left.d);
}

export function cellContents(structure: CrystalStructure): CellContents {
  const counts: Partial<Record<ElementSymbol, number>> = {};
  for (const atom of expandUnitCell(structure)) counts[atom.element] = (counts[atom.element] ?? 0) + atom.occupancy;
  let cellMass = 0;
  let absorption = 0;
  for (const element of Object.keys(counts) as ElementSymbol[]) {
    const count = counts[element] ?? 0;
    cellMass += count * ELEMENTS[element].mass;
    absorption += count * ELEMENTS[element].mass * ELEMENTS[element].muRho;
  }
  const volume = cellVolume(structure.cell);
  return {
    volume,
    cellMass,
    density: cellMass / (AVOGADRO * volume * 1e-24),
    massAttenuation: absorption / cellMass,
    elementCounts: counts,
  };
}
