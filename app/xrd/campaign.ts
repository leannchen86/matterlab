// Campaign batches from the shared XRD core, so the campaign console draws and scores the same physics as the bench.
// A campaign candidate becomes a synthesis history. Its phases give the survey trace (a hand-ground front-loaded mount),
// the CaTiO₃ host share that every mission verdict reads, and the leftover phase an SEM / EDS follow-up would find.
// Only the forecasts shown before a run (prediction and uncertainty in campaign-spec.ts) are authored.

import type { CustomComposition } from '../campaign-spec.ts';
import { gridAngle, type Grid } from './pattern.ts';
import { acquisitionFor, measure, prepareMount, type MountRecord, type Specimen } from './measure.ts';
import { synthesize, type PhaseAmount, type SynthesisHistory } from './synthesis.ts';

/** The fields of a campaign spec that decide its powder. */
export type CampaignPatternInput = {
  readonly id: string;
  readonly formula: string;
  readonly temperature: string;
  readonly dwell: string;
  readonly composition?: CustomComposition;
};

export type CampaignPattern = {
  /** 2θ in degrees of each bucket's strongest point. */
  readonly angles: readonly number[];
  /** Counts relative to the strongest point of the scan, so the maximum is 1. */
  readonly intensities: readonly number[];
};

export type CampaignChemistry = { readonly caExcess: number; readonly zrDopant: number };

/**
 * Batch chemistry of the authored candidates, read from their formulas and matching their precursor lots:
 * Ca excess over the B site (Ti + Zr) and Zr on the Ti site, both in mol%. Temperature and dwell come from the spec.
 */
export const AUTHORED_CHEMISTRY: Readonly<Record<string, CampaignChemistry>> = {
  // CaTiO₃ + 8.3 mol% Ca excess
  'C-42': { caExcess: 8.3, zrDopant: 0 },
  // CaTi₀.₉₆Zr₀.₀₄O₃
  'Z-17': { caExcess: 0, zrDopant: 4 },
  // CaTiO₃
  'D-08': { caExcess: 0, zrDopant: 0 },
  // CaTi₀.₉₈Zr₀.₀₂O₃
  'A-29': { caExcess: 0, zrDopant: 2 },
  // CaTiO₃
  'R-31': { caExcess: 0, zrDopant: 0 },
};

const STOICHIOMETRIC: CampaignChemistry = { caExcess: 0, zrDopant: 0 };

/** Molar masses in g/mol, as used by the bench cases. */
const MOLAR_MASS = { CaCO3: 100.087, TiO2: 79.866, ZrO2: 123.218 };
/** 0.1 mol of B-site cations per batch, like the bench cases. */
const BATCH_MOL = 0.1;

function leadingNumber(text: string) {
  return Number.parseFloat(text.replace(/,/g, '').replace(/[^\d.]+/g, ' ').trim());
}

/** Chemistry and firing of a candidate: its own composition when it has one, otherwise the authored table and the spec's firing strings. */
export function campaignComposition(input: CampaignPatternInput): CustomComposition {
  if (input.composition) return input.composition;
  const chemistry = AUTHORED_CHEMISTRY[input.id] ?? STOICHIOMETRIC;
  return { ...chemistry, temperature: leadingNumber(input.temperature), dwell: leadingNumber(input.dwell) };
}

/**
 * Hidden synthesis history of a campaign batch: CaCO₃ + rutile TiO₂ (+ ZrO₂) weighed to the composition, fired once in an
 * open crucible at the setpoint for the dwell with no regrind, then carried to XRD within the shift (2 h at 35% RH).
 * Precursor sizes and moisture follow the bench base case.
 */
export function campaignHistory(input: CampaignPatternInput): SynthesisHistory {
  const { caExcess, zrDopant, temperature, dwell } = campaignComposition(input);
  const zr = BATCH_MOL * (zrDopant / 100);
  return {
    precursors: [
      { material: 'CaCO3', massG: BATCH_MOL * (1 + caExcess / 100) * MOLAR_MASS.CaCO3 },
      { material: 'TiO2', massG: (BATCH_MOL - zr) * MOLAR_MASS.TiO2 },
      ...(zr > 0 ? [{ material: 'ZrO2' as const, massG: zr * MOLAR_MASS.ZrO2 }] : []),
    ],
    carbonateMoisture: 0,
    titania: { polymorph: 'rutile', d50Um: 0.5 },
    calcination: { temperatureC: temperature, hours: dwell, regrinds: 0, bed: 'open' },
    storage: { hours: 2, relativeHumidity: 35 },
  };
}

const phaseCache = new Map<string, readonly PhaseAmount[]>();

/** Phases of a campaign batch from the shared synthesis model, cached by chemistry and firing. Callers must not mutate them. */
export function campaignPhases(input: CampaignPatternInput): readonly PhaseAmount[] {
  const { caExcess, zrDopant, temperature, dwell } = campaignComposition(input);
  const key = `${caExcess}|${zrDopant}|${temperature}|${dwell}`;
  const cached = phaseCache.get(key);
  if (cached) return cached;
  const phases = synthesize(campaignHistory(input));
  phaseCache.set(key, phases);
  return phases;
}

function weightShare(phases: readonly PhaseAmount[], structureIds: readonly string[]) {
  const total = phases.reduce((sum, phase) => sum + phase.weightFraction, 0);
  const selected = phases.reduce((sum, phase) => sum + (structureIds.includes(phase.structureId) ? phase.weightFraction : 0), 0);
  return total > 0 ? selected / total : 0;
}

/**
 * Target-phase share of the batch in percent, to one decimal: the CaTiO₃ host's weight over all phases, counted as the bench's
 * objective check counts it. Mission verdicts, gaps, and follow-ups all read this number.
 */
export function campaignTargetShare(input: CampaignPatternInput): number {
  return Math.round(weightShare(campaignPhases(input), ['catio3']) * 1000) / 10;
}

export type CampaignSecondaryPhase = 'titania' | 'calcium' | 'zirconia' | 'none';

/** Leftover phases grouped by how an SEM / EDS map would show them. */
const SECONDARY_GROUPS: readonly (readonly [Exclude<CampaignSecondaryPhase, 'none'>, readonly string[]])[] = [
  // Leftover TiO₂, from incomplete conversion or a Ca-deficient batch: Ti-rich cores.
  ['titania', ['rutile', 'anatase']],
  // Unreacted or excess calcium and its storage products, plus the Ca-rich Ca₄Ti₃O₁₀ phase.
  ['calcium', ['lime', 'portlandite', 'calcite', 'ca4ti3o10']],
  // Undissolved ZrO₂.
  ['zirconia', ['baddeleyite']],
];
/** A leftover group counts once it reaches 0.5 wt%, the floor the bench uses for a reportable phase. */
const VISIBLE_SECONDARY = 0.005;

/** The leftover group that dominates the batch by weight, or 'none' when no group reaches the reportable floor. */
export function campaignSecondaryPhase(input: CampaignPatternInput): CampaignSecondaryPhase {
  const phases = campaignPhases(input);
  let dominant: CampaignSecondaryPhase = 'none';
  let dominantShare = 0;
  for (const [group, structureIds] of SECONDARY_GROUPS) {
    const share = weightShare(phases, structureIds);
    if (share > dominantShare) {
      dominant = group;
      dominantShare = share;
    }
  }
  return dominantShare >= VISIBLE_SECONDARY ? dominant : 'none';
}

/** Whether the listed phases together reach the 0.5 wt% reportable floor in the batch. */
export function campaignPhaseReportable(input: CampaignPatternInput, structureIds: readonly string[]): boolean {
  return weightShare(campaignPhases(input), structureIds) >= VISIBLE_SECONDARY;
}

const MOUNT: MountRecord = { index: 1, aliquot: 1, method: 'front', grind: 'hand', spike: 'none', spikeFraction: 0, spin: false, preparedBy: 'queue' };
const INSTRUMENT = { zeroShiftDeg: 0 };
/** Non-crystalline share of a calcined batch, as in most bench cases. */
const AMORPHOUS_FRACTION = 0.01;
const MAX_POINTS = 400;

/** Survey scan with counting noise; the mount surface sits on the focusing circle, so only the lattice moves peaks between candidates. */
function survey(specimen: Specimen, sampleCode: string, mount: MountRecord) {
  const prepared = prepareMount(specimen, sampleCode, mount, 0);
  return measure(prepared, acquisitionFor('survey'), INSTRUMENT, 1);
}

/** Keeps the strongest point of each bucket, so narrow peaks survive the reduction. */
function downsample(grid: Grid, counts: ArrayLike<number>): CampaignPattern {
  let strongest = 1;
  for (let index = 0; index < grid.count; index += 1) strongest = Math.max(strongest, counts[index]);
  const size = Math.ceil(grid.count / MAX_POINTS);
  const angles: number[] = [];
  const intensities: number[] = [];
  for (let start = 0; start < grid.count; start += size) {
    let best = start;
    for (let index = start + 1; index < Math.min(grid.count, start + size); index += 1) if (counts[index] > counts[best]) best = index;
    angles.push(Number(gridAngle(grid, best).toFixed(4)));
    intensities.push(counts[best] / strongest);
  }
  return { angles, intensities };
}

const cache = new Map<string, CampaignPattern>();

/** Normalised survey trace of a campaign candidate, deterministic for a given id and composition. Callers must not mutate it. */
export function campaignPattern(input: CampaignPatternInput): CampaignPattern {
  const { caExcess, zrDopant, temperature, dwell } = campaignComposition(input);
  const key = `sample|${input.id}|${caExcess}|${zrDopant}|${temperature}|${dwell}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const specimen: Specimen = { phases: [...campaignPhases(input)], amorphousFraction: AMORPHOUS_FRACTION };
  const { grid, counts } = survey(specimen, `campaign/${input.id}`, MOUNT);
  const pattern = downsample(grid, counts);
  cache.set(key, pattern);
  return pattern;
}

/** Normalised survey trace of the silicon QC material: neat silicon spike powder on its own mount. */
export function siliconQcPattern(): CampaignPattern {
  const key = 'silicon-qc';
  const cached = cache.get(key);
  if (cached) return cached;
  const { grid, counts } = survey({ phases: [], amorphousFraction: 0 }, 'campaign/silicon-qc', { ...MOUNT, spike: 'silicon', spikeFraction: 1 });
  const pattern = downsample(grid, counts);
  cache.set(key, pattern);
  return pattern;
}
