// Follow-up measurements with honest limits. TGA reports mass-loss steps, never phases. SEM/EDS reports elements
// qualitatively over a handful of particles, with the artefacts of a real stub: carbon from the tape, an occasional Al
// signal from the stub, and possible overlap of Ba Lα with Ti Kα. Both read the hidden powder, as the diffractometer does, and both
// are seeded, so a request always returns the same result.
import { ELEMENTS, type ElementSymbol } from './elements.ts';
import type { Specimen } from './measure.ts';
import { catalogPhase } from './phases.ts';
import { createRandom, hashSeed } from './random.ts';
import { ZR_LATTICE_PER_MOL_PERCENT, type PhaseAmount } from './synthesis.ts';

export type TgaStep = { readonly fromC: number; readonly toC: number; readonly lossPercent: number };
export type TgaResult = { readonly steps: readonly TgaStep[]; readonly detectionPercent: number };

/** Smallest step the balance resolves against drift, in percent of the starting mass. */
const TGA_DETECTION = 0.1;
const WATER_OF_PORTLANDITE = 18.015 / 74.093;
const CO2_OF_CALCITE = 44.009 / 100.087;

/** Heats to 1000 °C in air. Adsorbed water leaves below about 160 °C, Ca(OH)₂ near 400–480 °C, CaCO₃ near 600–800 °C. */
export function runTga(specimen: Specimen, key: string, storageRelativeHumidity: number): TgaResult {
  const random = createRandom(hashSeed('tga', key));
  const crystalline = 1 - specimen.amorphousFraction;
  const share = (id: string) => specimen.phases.filter((phase) => phase.structureId === id).reduce((sum, phase) => sum + phase.weightFraction * crystalline, 0);
  const calcite = specimen.phases.find((phase) => phase.structureId === 'calcite');
  const jitter = () => Math.round((8 * random.normal()) / 5) * 5;
  const candidates: [number, number, number][] = [
    [40, 160, 0.05 + 0.3 * (storageRelativeHumidity / 100) + 5 * specimen.amorphousFraction],
    [390, 480, 100 * share('portlandite') * WATER_OF_PORTLANDITE],
    // Fine carbonate formed by weathering decomposes earlier than coarse unreacted precursor.
    calcite && calcite.crystalliteNm < 50 ? [600, 730, 100 * share('calcite') * CO2_OF_CALCITE] : [650, 800, 100 * share('calcite') * CO2_OF_CALCITE],
  ];
  const steps = candidates
    .map(([fromC, toC, loss]) => ({ fromC: fromC + jitter(), toC: toC + jitter(), lossPercent: loss + 0.03 * random.normal() }))
    .filter((step) => step.lossPercent >= TGA_DETECTION)
    .map((step) => ({ ...step, lossPercent: Math.round(10 * step.lossPercent) / 10 }));
  return { steps, detectionPercent: TGA_DETECTION };
}

export type EdsLevel = 'major' | 'minor' | 'trace';
export type EdsSignal = { readonly element: ElementSymbol; readonly level: EdsLevel; readonly artefact?: 'tape' | 'stub' };
export type SemEdsResult = {
  readonly area: readonly EdsSignal[];
  /** Heavy elements in each analysed particle. */
  readonly spots: readonly (readonly ElementSymbol[])[];
  /** Elements these spectra can neither confirm nor exclude, with the overlapping element. */
  readonly unresolved: readonly { readonly element: ElementSymbol; readonly hiddenBy: ElementSymbol }[];
  readonly detectionPercent: number;
};

/** Area-scan detection limit in wt% for a heavy element in an oxide matrix. */
const EDS_DETECTION = 0.3;
const SPOTS = 8;
const LIGHT: ReadonlySet<ElementSymbol> = new Set<ElementSymbol>(['H', 'C', 'O']);

/** Element mass fractions of one phase; Zr dissolved in CaTiO₃ is read back from the cell expansion it causes. */
function phaseComposition(amount: PhaseAmount): Map<ElementSymbol, number> {
  const contents = catalogPhase(amount.structureId).reference.contents;
  const zr = amount.structureId === 'catio3' ? Math.max(0, (amount.latticeScale - 1) / ZR_LATTICE_PER_MOL_PERCENT) / 100 : 0;
  const counts = new Map<ElementSymbol, number>();
  for (const [symbol, count] of Object.entries(contents.elementCounts)) {
    const element = symbol as ElementSymbol;
    if (element === 'Ti' && zr > 0) {
      counts.set('Ti', (count ?? 0) * (1 - zr));
      counts.set('Zr', (counts.get('Zr') ?? 0) + (count ?? 0) * zr);
    } else counts.set(element, (counts.get(element) ?? 0) + (count ?? 0));
  }
  const mass = [...counts].reduce((sum, [element, count]) => sum + count * ELEMENTS[element].mass, 0);
  return new Map([...counts].map(([element, count]) => [element, (count * ELEMENTS[element].mass) / mass]));
}

function level(percent: number): EdsLevel | undefined {
  if (percent >= 10) return 'major';
  if (percent >= 1) return 'minor';
  return percent >= EDS_DETECTION ? 'trace' : undefined;
}

/** A deliberately coarse limit for this qualitative test, not a universal EDS resolution threshold.
 * Full-spectrum, standards-based fitting can separate Ba/Ti overlaps (Mengason & Ritchie, 2017).
 * Apply the same rule separately to the area and each particle; a Ba-rich particle can supply evidence.
 */
function baUnresolved(composition: ReadonlyMap<ElementSymbol, number>): boolean {
  return (composition.get('Ti') ?? 0) >= 0.01 && (composition.get('Ba') ?? 0) < 0.1;
}

export function runSemEds(specimen: Specimen, key: string): SemEdsResult {
  const random = createRandom(hashSeed('sem-eds', key));
  const phases = specimen.phases.filter((phase) => phase.weightFraction > 0);
  const compositions = phases.map(phaseComposition);
  const bulk = new Map<ElementSymbol, number>();
  phases.forEach((phase, index) => {
    for (const [element, fraction] of compositions[index]) bulk.set(element, (bulk.get(element) ?? 0) + phase.weightFraction * fraction);
  });

  const area: EdsSignal[] = [];
  for (const [element, fraction] of [...bulk].sort((a, b) => b[1] - a[1])) {
    if (element === 'H' || element === 'C') continue;
    // Matrix and geometry effects make standardless levels uncertain by about a quarter.
    const found = level(100 * fraction * Math.exp(0.25 * random.normal()));
    if (found && !(element === 'Ba' && baUnresolved(bulk))) area.push({ element, level: found });
  }
  area.push({ element: 'C', level: 'major', artefact: 'tape' });
  if (random.next() < 0.35) area.push({ element: 'Al', level: 'trace', artefact: 'stub' });

  const total = phases.reduce((sum, phase) => sum + phase.weightFraction, 0);
  const spots = Array.from({ length: SPOTS }, () => {
    let pick = random.next() * total;
    const index = Math.max(0, phases.findIndex((phase) => (pick -= phase.weightFraction) <= 0));
    const composition = compositions[index];
    return [...composition].filter(([element, fraction]) => !LIGHT.has(element) && fraction >= 0.01 && !(element === 'Ba' && baUnresolved(composition))).map(([element]) => element).sort();
  });

  const unresolved = baUnresolved(bulk) && !spots.some((spot) => spot.includes('Ba')) ? [{ element: 'Ba' as ElementSymbol, hiddenBy: 'Ti' as ElementSymbol }] : [];
  return { area, spots, unresolved, detectionPercent: EDS_DETECTION };
}

/** Heavy elements the result supports: area signals that are not artefacts, plus any element seen in a particle. */
export function edsElements(result: SemEdsResult): ElementSymbol[] {
  const found = new Set<ElementSymbol>();
  for (const signal of result.area) if (!signal.artefact && !LIGHT.has(signal.element)) found.add(signal.element);
  for (const spot of result.spots) for (const element of spot) found.add(element);
  return [...found].sort();
}
