// Reference phases hydrated from the generated structure data (see scripts/build-references.ts).

import type { CellContents, Matrix3, Reflection, UnitCell, Vector3 } from './crystallography.ts';
import type { PhaseReference, ReferenceSource } from './pattern.ts';
import { PHASE_DATA, REFERENCE_DATA_VERSION } from './references.generated.ts';

export type PhaseData = {
  readonly id: string;
  readonly name: string;
  readonly formula: string;
  readonly spaceGroup: string;
  readonly cell: UnitCell;
  readonly contents: CellContents;
  readonly meanB: number;
  /** Point-group rotations, 9 integers each, row-major. */
  readonly rotations: readonly (readonly number[])[];
  /** Flat [h, k, l, multiplicity, d (Å), |F|² (electrons²)] records, strongest spacing first. */
  readonly reflections: readonly number[];
  readonly source: ReferenceSource;
};

export const REFERENCE_LIBRARY_VERSION = REFERENCE_DATA_VERSION;

function hydrate(data: PhaseData): PhaseReference {
  const rotations = data.rotations.map((r): Matrix3 => [
    [r[0], r[1], r[2]],
    [r[3], r[4], r[5]],
    [r[6], r[7], r[8]],
  ]);
  const reflections: Reflection[] = [];
  const values = data.reflections;
  for (let index = 0; index < values.length; index += 6) {
    const hkl: Vector3 = [values[index], values[index + 1], values[index + 2]];
    reflections.push({ hkl, multiplicity: values[index + 3], d: values[index + 4], fSquared: values[index + 5] });
  }
  return {
    id: data.id,
    formula: data.formula,
    name: data.name,
    spaceGroup: data.spaceGroup,
    cell: data.cell,
    contents: data.contents,
    meanB: data.meanB,
    rotations,
    reflections,
    source: data.source,
  };
}

const references = new Map<string, PhaseReference>(PHASE_DATA.map((data) => [data.id, hydrate(data)]));

export const STRUCTURE_IDS: readonly string[] = PHASE_DATA.map((data) => data.id);

export function phaseReference(id: string): PhaseReference {
  const reference = references.get(id);
  if (!reference) throw new Error(`Unknown reference structure ${id}`);
  return reference;
}

export type { CellContents };
