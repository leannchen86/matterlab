// Simulated laboratory measurement: hidden specimen and mount physics in, recorded counts out.
// Hidden specimen → prepared mount (surface displacement, grain statistics, orientation) → acquisition program →
// Poisson counts. The output names no phase; analysis only ever receives the counts and the recorded settings.
//
// Scale: integrated Bragg intensity per phase is λ³/(32πV²ρ) · M|F|²·LP · w/μ*, and diffuse scattering per radian is
// S(2θ)/(Vρ) · (1 + cos²2θ)/2 · w/μ* in the same units (Klug & Alexander, 1974), so peak-to-background ratios follow from
// the structures. Only the flux, air scatter and residual fluorescence constants are calibrated to typical laboratory data.

import { ELEMENTS, formFactor, type ElementSymbol } from './elements.ts';
import { catalogPhase, mountOrientation, type CatalogPhase, type MountMethod } from './phases.ts';
import { accumulateLines, braggScale, calculateLines, gridAngle, perBin, type AngularRange, type Grid, type PhaseState } from './pattern.ts';
import { CU_KALPHA1, DEG, LAB_OPTICS, type InstrumentOptics } from './profile.ts';
import { createRandom, hashSeed } from './random.ts';
import type { PhaseAmount } from './synthesis.ts';

export const ENGINE_VERSION = 'xrd-engine-3';

export type Grind = 'as-received' | 'hand' | 'extended';
export type SpikeKind = 'none' | 'silicon' | 'corundum';

/** What the notebook records about a mount. */
export type MountRecord = {
  /** 1-based mount number within the sample. */
  readonly index: number;
  /** 1-based powder portion taken from the jar. */
  readonly aliquot: number;
  readonly method: MountMethod;
  readonly grind: Grind;
  readonly spike: SpikeKind;
  /** Mass fraction of spike in the mounted powder; 0 without a spike. */
  readonly spikeFraction: number;
  readonly spin: boolean;
  readonly preparedBy: 'queue' | 'you';
};

export type ProgramId = 'survey' | 'standard' | 'slow' | 'wide' | 'targeted';

export type Acquisition = {
  readonly program: ProgramId;
  readonly range: AngularRange;
  readonly stepDeg: number;
  readonly minutes: number;
};

type Program = { readonly range: AngularRange; readonly stepDeg: number; readonly minutes: number };

/** Illustrative scan programs for a strip-detector diffractometer. */
export const PROGRAMS: Readonly<Record<ProgramId, Program>> = {
  survey: { range: { startDeg: 10, endDeg: 80 }, stepDeg: 0.02, minutes: 6 },
  standard: { range: { startDeg: 10, endDeg: 80 }, stepDeg: 0.01, minutes: 30 },
  slow: { range: { startDeg: 10, endDeg: 80 }, stepDeg: 0.01, minutes: 120 },
  wide: { range: { startDeg: 5, endDeg: 100 }, stepDeg: 0.02, minutes: 12 },
  targeted: { range: { startDeg: -1.5, endDeg: 1.5 }, stepDeg: 0.01, minutes: 15 },
};

/** Angular width seen at once by the strip detector, in degrees. */
const DETECTOR_WIDTH_DEG = 2.5;

export function acquisitionFor(program: ProgramId, centreDeg = 33): Acquisition {
  const preset = PROGRAMS[program];
  const range =
    program === 'targeted'
      ? { startDeg: round(Math.max(5, centreDeg + preset.range.startDeg), 2), endDeg: round(Math.min(120, centreDeg + preset.range.endDeg), 2) }
      : preset.range;
  return { program, range, stepDeg: preset.stepDeg, minutes: preset.minutes };
}

export function gridFor(acquisition: Acquisition): Grid {
  const { range, stepDeg } = acquisition;
  return { startDeg: range.startDeg, stepDeg, count: Math.round((range.endDeg - range.startDeg) / stepDeg) + 1 };
}

/** Counting time per angle in arbitrary units: the strip detector sees each angle for minutes × width / (range + width). Bin width enters once, when intensity is integrated over the bin. */
export function exposure(acquisition: Acquisition) {
  const span = acquisition.range.endDeg - acquisition.range.startDeg;
  return (acquisition.minutes * DETECTOR_WIDTH_DEG) / (span + DETECTOR_WIDTH_DEG);
}

/** Hidden: the powder in the jar. */
export type Specimen = {
  readonly phases: readonly PhaseAmount[];
  /** Weight fraction of non-crystalline material before mounting. */
  readonly amorphousFraction: number;
};

/** Hidden: the instrument during this shift. */
export type InstrumentState = { readonly zeroShiftDeg: number };

type GrindEffect = { readonly grain: number; readonly damage: boolean };
const GRIND: Readonly<Record<Grind, GrindEffect>> = {
  'as-received': { grain: 1.6, damage: false },
  hand: { grain: 0.7, damage: false },
  extended: { grain: 0.3, damage: true },
};

/** Displacement spread of a hand-made mount in mm; back-loading sets the surface against a flat plate. */
export const DISPLACEMENT_SD_MM: Readonly<Record<MountMethod, number>> = { front: 0.04, back: 0.02 };

const SPIKE_PHASE: Readonly<Record<Exclude<SpikeKind, 'none'>, Omit<PhaseAmount, 'weightFraction'>>> = {
  silicon: { structureId: 'silicon', latticeScale: 1, crystalliteNm: 600, microstrain: 0.00005, grainUm: 4.5 },
  corundum: { structureId: 'corundum', latticeScale: 1, crystalliteNm: 300, microstrain: 0.0001, grainUm: 2 },
};

export type MountedPhase = {
  readonly phase: CatalogPhase;
  /** Weight fraction in the mounted powder, after amorphous content and spike dilution. */
  readonly weightFraction: number;
  readonly state: PhaseState;
  readonly grainUm: number;
  /** Particle-statistics factor per reflection (mean 1), fixed for the life of the mount. */
  readonly factors: Float64Array;
};

/** Hidden physics of one mount. */
export type PreparedMount = {
  readonly seed: number;
  readonly displacementMm: number;
  readonly phases: readonly MountedPhase[];
  readonly amorphousFraction: number;
  /** Mass attenuation coefficient of the mounted powder at Cu Kα in cm²/g. */
  readonly attenuation: number;
};

export function mountSeed(sampleCode: string, mount: MountRecord) {
  return hashSeed('mount', sampleCode, mount.aliquot, mount.index, mount.method, mount.grind, mount.spike, mount.spikeFraction, mount.spin ? 1 : 0);
}

/** Relative spread of integrated intensity from the finite number of diffracting grains. */
export function grainStatisticsCv(grainUm: number, multiplicity: number, weightFraction: number, spin: boolean) {
  const grains = (multiplicity / 8) * weightFraction * (spin ? 4 : 1);
  if (grains <= 0) return 0.6;
  return Math.min(0.6, (0.02 * (grainUm / 10) ** 1.5) / Math.sqrt(grains));
}

export function prepareMount(specimen: Specimen, sampleCode: string, mount: MountRecord, displacementMm?: number): PreparedMount {
  const seed = mountSeed(sampleCode, mount);
  const random = createRandom(seed);
  const grind = GRIND[mount.grind];
  const spikeFraction = mount.spike === 'none' ? 0 : mount.spikeFraction;

  const crystalline = specimen.phases.filter((phase) => phase.weightFraction > 0);
  const total = crystalline.reduce((sum, phase) => sum + phase.weightFraction, 0);
  let damage = 0;
  const ground = crystalline.map((phase) => {
    const grainUm = Math.max(0.8, phase.grainUm * grind.grain);
    const damaged = grind.damage && grainUm <= 4;
    if (damaged) damage += phase.weightFraction / total;
    return {
      amount: phase,
      grainUm,
      state: {
        latticeScale: phase.latticeScale,
        crystalliteNm: damaged ? Math.max(25, phase.crystalliteNm * 0.6) : phase.crystalliteNm,
        microstrain: phase.microstrain + (damaged ? 0.0006 : 0),
      },
    };
  });
  // Over-grinding leaves a disordered surface layer on the damaged grains.
  const amorphousBeforeSpike = specimen.amorphousFraction + (1 - specimen.amorphousFraction) * 0.03 * damage;
  const amorphous = amorphousBeforeSpike * (1 - spikeFraction);
  const crystallineShare = (1 - amorphousBeforeSpike) * (1 - spikeFraction);

  const entries = ground.map(({ amount, grainUm, state }) => ({ id: amount.structureId, weightFraction: (crystallineShare * amount.weightFraction) / total, grainUm, state }));
  if (mount.spike !== 'none' && spikeFraction > 0) {
    const spike = SPIKE_PHASE[mount.spike];
    entries.push({
      id: spike.structureId,
      weightFraction: spikeFraction,
      grainUm: spike.grainUm,
      state: { latticeScale: spike.latticeScale, crystalliteNm: spike.crystalliteNm, microstrain: spike.microstrain },
    });
  }

  const phases = entries.map((entry): MountedPhase => {
    const phase = catalogPhase(entry.id);
    const stream = random.fork(`phase:${phase.contentKey}`);
    const factors = new Float64Array(phase.reference.reflections.length);
    phase.reference.reflections.forEach((reflection, index) => {
      const cv = grainStatisticsCv(entry.grainUm, reflection.multiplicity, entry.weightFraction, mount.spin);
      const sigma = Math.sqrt(Math.log(1 + cv * cv));
      factors[index] = Math.exp(sigma * stream.normal() - 0.5 * sigma * sigma);
    });
    const orientation = entry.id === 'silicon' || entry.id === 'corundum' ? undefined : mountOrientation(phase, mount.method);
    return { phase, weightFraction: entry.weightFraction, grainUm: entry.grainUm, state: { ...entry.state, preferredOrientation: orientation }, factors };
  });

  const majority = phases.reduce((best, entry) => (entry.weightFraction > best.weightFraction ? entry : best), phases[0]);
  const attenuation =
    phases.reduce((sum, entry) => sum + entry.weightFraction * entry.phase.reference.contents.massAttenuation, 0) +
    amorphous * (majority?.phase.reference.contents.massAttenuation ?? 100);
  const displacement = displacementMm ?? DISPLACEMENT_SD_MM[mount.method] * random.fork('displacement').normal();
  return { seed, displacementMm: displacement, phases, amorphousFraction: amorphous, attenuation };
}

/**
 * Counts per unit exposure. Calibrated so a hand-ground CaTiO₃ survey peaks near 4000 counts, above the sim's illustrative
 * 3000-count identification threshold (IDENTIFY_COUNTS in lab.ts), while the standard program reaches about 10 000.
 */
const FLUX = 3.2e7;
/** Air scatter reaching the detector at low angle, in the diffuse units used below (about 1.5% of the CaTiO₃ maximum at 10°). */
const AIR_SCATTER = 0.053;
/** Flat background from residual fluorescence in the detector window and holder scatter (about 1% of the CaTiO₃ maximum). */
const FLUORESCENCE = 0.049;
const HOLDER_FLAT = 0.1;

function cellScattering(phase: CatalogPhase, s2: number) {
  let incoherent = 0;
  let coherent = 0;
  const b = phase.reference.meanB;
  for (const [symbol, count] of Object.entries(phase.reference.contents.elementCounts)) {
    const element = symbol as ElementSymbol;
    const z = ELEMENTS[element].z;
    const f = formFactor(element, s2);
    const n = count ?? 0;
    incoherent += n * Math.max(0, z - (f * f) / z);
    coherent += n * f * f;
  }
  return { incoherent, coherent, thermal: coherent * (1 - Math.exp(-2 * b * s2)) };
}

function titaniumMassFraction(phase: CatalogPhase) {
  const ti = phase.reference.contents.elementCounts.Ti ?? 0;
  return (ti * ELEMENTS.Ti.mass) / phase.reference.contents.cellMass;
}

/** Expected counts per bin before counting statistics. */
export function expectedCounts(prepared: PreparedMount, acquisition: Acquisition, instrument: InstrumentState, optics: InstrumentOptics = LAB_OPTICS): { grid: Grid; mean: Float64Array } {
  const grid = gridFor(acquisition);
  const signal = new Float64Array(grid.count);
  const instrumentOptics = { ...optics, zeroShiftDeg: instrument.zeroShiftDeg };
  const mu = prepared.attenuation;

  for (const entry of prepared.phases) {
    const lines = calculateLines(entry.phase.reference, entry.state, instrumentOptics, acquisition.range);
    accumulateLines(signal, grid, lines, (braggScale(entry.phase.reference) * entry.weightFraction) / mu, prepared.displacementMm, instrumentOptics, entry.factors);
  }

  const binWidth = perBin(grid);
  const majority = prepared.phases.reduce((best, entry) => (entry.weightFraction > best.weightFraction ? entry : best), prepared.phases[0]);
  let fluorescence = 0;
  for (const entry of prepared.phases) fluorescence += entry.weightFraction * titaniumMassFraction(entry.phase);
  for (let index = 0; index < grid.count; index += 1) {
    const twoTheta = gridAngle(grid, index);
    const theta = (twoTheta / 2) * DEG;
    const s = Math.sin(theta) / CU_KALPHA1;
    const s2 = s * s;
    const polarization = (1 + Math.cos(2 * theta) ** 2) / 2;
    let diffuse = 0;
    for (const entry of prepared.phases) {
      const { contents } = entry.phase.reference;
      const scattering = cellScattering(entry.phase, s2);
      diffuse += (entry.weightFraction * (scattering.incoherent + scattering.thermal)) / (contents.volume * contents.density);
    }
    if (prepared.amorphousFraction > 0 && majority) {
      const { contents } = majority.phase.reference;
      const scattering = cellScattering(majority.phase, s2);
      const halo = 0.1 + Math.exp((-4 * Math.LN2 * (twoTheta - 30) ** 2) / 64);
      diffuse += (prepared.amorphousFraction * (scattering.coherent * halo + scattering.incoherent)) / (contents.volume * contents.density);
    }
    const air = AIR_SCATTER * Math.exp(-(twoTheta - 5) / 7);
    signal[index] += ((diffuse * polarization) / mu + air + FLUORESCENCE * (fluorescence + HOLDER_FLAT)) * binWidth;
  }

  const scale = FLUX * exposure(acquisition);
  for (let index = 0; index < grid.count; index += 1) signal[index] *= scale;
  return { grid, mean: signal };
}

export function runSeed(prepared: PreparedMount, acquisition: Acquisition, runIndex: number) {
  return hashSeed('run', prepared.seed, runIndex, acquisition.program, acquisition.range.startDeg, acquisition.range.endDeg, acquisition.stepDeg);
}

export type Measurement = { readonly grid: Grid; readonly counts: Uint32Array; readonly seed: number };

/** Records one scan: expected counts drawn through Poisson counting statistics from a seed built from observable settings. */
export function measure(prepared: PreparedMount, acquisition: Acquisition, instrument: InstrumentState, runIndex: number): Measurement {
  const { grid, mean } = expectedCounts(prepared, acquisition, instrument);
  const seed = runSeed(prepared, acquisition, runIndex);
  const random = createRandom(seed);
  const counts = new Uint32Array(grid.count);
  for (let index = 0; index < grid.count; index += 1) counts[index] = random.poisson(mean[index]);
  return { grid, counts, seed };
}

function round(value: number, digits: number) {
  return Number(value.toFixed(digits));
}
