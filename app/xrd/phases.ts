// Phase catalog: reference structures plus the facts the lab keeps about each phase.
// inLibrary marks what the reference search can return; a phase can exist in samples without a library entry.

import type { Vector3 } from './crystallography.ts';
import type { ElementSymbol } from './elements.ts';
import { phaseReference } from './library.ts';
import type { PhaseReference, PreferredOrientation } from './pattern.ts';
import { hashSeed } from './random.ts';

export type MountMethod = 'front' | 'back';

/** Crystal habit that orients grains in a pressed powder surface. */
export type Habit = {
  readonly axis: Vector3;
  /** March–Dollase ratio for a front-loaded mount; back-loading moves it toward 1. */
  readonly frontLoadRatio: number;
};

export type CatalogPhase = {
  readonly id: string;
  readonly reference: PhaseReference;
  readonly formulaUnits: number;
  /** g/mol per formula unit. */
  readonly formulaMass: number;
  readonly elements: readonly ElementSymbol[];
  readonly inLibrary: boolean;
  readonly habit?: Habit;
  /** Seed component derived from structure content, so noise streams never depend on names. */
  readonly contentKey: number;
};

type Entry = { readonly formulaUnits: number; readonly inLibrary: boolean; readonly habit?: Habit };

const ENTRIES: Readonly<Record<string, Entry>> = {
  catio3: { formulaUnits: 4, inLibrary: true },
  rutile: { formulaUnits: 2, inLibrary: true },
  anatase: { formulaUnits: 4, inLibrary: true },
  lime: { formulaUnits: 4, inLibrary: true },
  // Portlandite grows as hexagonal platelets that lie flat when pressed.
  portlandite: { formulaUnits: 1, inLibrary: true, habit: { axis: [0, 0, 1], frontLoadRatio: 0.72 } },
  // Calcite cleaves into {104} rhombs.
  calcite: { formulaUnits: 6, inLibrary: true, habit: { axis: [1, 0, 4], frontLoadRatio: 0.88 } },
  corundum: { formulaUnits: 6, inLibrary: true },
  silicon: { formulaUnits: 8, inLibrary: true },
  baddeleyite: { formulaUnits: 4, inLibrary: true },
  cazro3: { formulaUnits: 4, inLibrary: true },
  batio3: { formulaUnits: 1, inLibrary: true },
  witherite: { formulaUnits: 4, inLibrary: true },
  catio2o4: { formulaUnits: 4, inLibrary: true },
  // The Crystallography Open Database has no Ca₄Ti₃O₁₀ entry; the structure is used only to generate samples.
  ca4ti3o10: { formulaUnits: 4, inLibrary: false, habit: { axis: [0, 0, 1], frontLoadRatio: 0.9 } },
};

function build(id: string, entry: Entry): CatalogPhase {
  const reference = phaseReference(id);
  const { cell, contents } = reference;
  const elements = (Object.keys(contents.elementCounts) as ElementSymbol[]).sort();
  return {
    id,
    reference,
    formulaUnits: entry.formulaUnits,
    formulaMass: contents.cellMass / entry.formulaUnits,
    elements,
    inLibrary: entry.inLibrary,
    habit: entry.habit,
    contentKey: hashSeed(reference.spaceGroup, cell.a, cell.b, cell.c, cell.beta, reference.reflections.length, contents.cellMass),
  };
}

const CATALOG = new Map<string, CatalogPhase>(Object.entries(ENTRIES).map(([id, entry]) => [id, build(id, entry)]));

export function catalogPhase(id: string): CatalogPhase {
  const phase = CATALOG.get(id);
  if (!phase) throw new Error(`Unknown phase ${id}`);
  return phase;
}

export const CATALOG_IDS: readonly string[] = [...CATALOG.keys()];
export const LIBRARY_PHASE_IDS: readonly string[] = [...CATALOG.values()].filter((phase) => phase.inLibrary).map((phase) => phase.id);

/** Library phases whose elements (ignoring O, H and C, which EDS and records handle poorly) are all in the given set. */
export function searchLibrary(elements: readonly ElementSymbol[]): string[] {
  const allowed = new Set<ElementSymbol>([...elements, 'O', 'H', 'C']);
  return LIBRARY_PHASE_IDS.filter((id) => catalogPhase(id).elements.every((element) => allowed.has(element)));
}

export function mountOrientation(phase: CatalogPhase, method: MountMethod): PreferredOrientation | undefined {
  if (!phase.habit) return undefined;
  const ratio = method === 'front' ? phase.habit.frontLoadRatio : 1 - 0.35 * (1 - phase.habit.frontLoadRatio);
  return { axis: phase.habit.axis, ratio };
}
