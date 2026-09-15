// Calculated powder patterns from reference structures.
// Shared by the measurement simulator (hidden specimen parameters) and by analysis (parameters fitted to an
// observation), so both describe peaks with identical physics and differ only in where their parameters come from.

import { reciprocalMetric, reflectionFamily, type CellContents, type Matrix3, type Reflection, type UnitCell, type Vector3 } from './crystallography.ts';
import { CU_KALPHA1, DEG, lorentzPolarization, peakShape, positionShift, profileWindow, twoThetaFromD, type EmissionLabel, type InstrumentOptics, type PeakShape } from './profile.ts';

export type ReferenceSource = {
  readonly database: string;
  readonly entry: string;
  readonly citation: string;
  readonly doi?: string;
  readonly temperatureK?: number;
  readonly notes: readonly string[];
};

export type PhaseReference = {
  readonly id: string;
  readonly formula: string;
  readonly name: string;
  readonly spaceGroup: string;
  readonly cell: UnitCell;
  readonly contents: CellContents;
  /** Mean isotropic displacement parameter of the cell contents in Å². */
  readonly meanB: number;
  /** Point-group rotations used to enumerate symmetry-equivalent reflections for preferred orientation. */
  readonly rotations: readonly Matrix3[];
  readonly reflections: readonly Reflection[];
  readonly source: ReferenceSource;
};

export type PreferredOrientation = {
  /** Orientation axis as reciprocal-lattice indices, e.g. [0, 0, 1] for platelets. */
  readonly axis: Vector3;
  /** March–Dollase ratio r: 1 is random; r < 1 enhances reflections along the axis (platelets lying flat). */
  readonly ratio: number;
};

export type PhaseState = {
  /** Multiplies every cell length; 1 reproduces the reference cell. */
  readonly latticeScale: number;
  readonly crystalliteNm: number;
  readonly microstrain: number;
  readonly preferredOrientation?: PreferredOrientation;
};

export const REFERENCE_STATE: PhaseState = { latticeScale: 1, crystalliteNm: Infinity, microstrain: 0 };

export type AngularRange = { readonly startDeg: number; readonly endDeg: number };

/** One emission line of one reflection. */
export type CalculatedLine = {
  readonly reflection: number;
  readonly emission: EmissionLabel;
  /** Ideal 2θ in degrees before specimen displacement and goniometer zero. */
  readonly twoTheta: number;
  /** Integrated intensity per unit phase scale: M |F|² × LP × preferred orientation × spectral weight. */
  readonly intensity: number;
  readonly shape: PeakShape;
};

/** Grid of counting bins; bin i is centred at startDeg + i · stepDeg. */
export type Grid = { readonly startDeg: number; readonly stepDeg: number; readonly count: number };

export function gridAngle(grid: Grid, index: number) {
  return grid.startDeg + index * grid.stepDeg;
}

/**
 * Bragg scale per unit weight fraction for Bragg–Brentano geometry with an infinitely thick specimen:
 * λ³ / (32 π V² ρ). Multiplying by w / μ*_mix gives integrated intensity in the same units as diffuse scattering
 * per electron-unit cross-section (Klug & Alexander; Hill & Howard, J. Appl. Cryst. 20 (1987) 467).
 */
export function braggScale(reference: PhaseReference) {
  const { volume, density } = reference.contents;
  return CU_KALPHA1 ** 3 / (32 * Math.PI * volume * volume * density);
}

/** March–Dollase preferred-orientation correction averaged over the symmetry-equivalent reflections. */
export function marchDollase(reference: PhaseReference, hkl: Vector3, orientation: PreferredOrientation, reciprocal: Matrix3) {
  const r = orientation.ratio;
  if (Math.abs(r - 1) < 1e-9) return 1;
  const axis = orientation.axis;
  const axisLength = Math.sqrt(dot(axis, axis, reciprocal));
  const family = reflectionFamily(hkl, reference.rotations);
  let sum = 0;
  for (const member of family) {
    const memberLength = Math.sqrt(dot(member, member, reciprocal));
    const cosine = dot(member, axis, reciprocal) / (memberLength * axisLength);
    const cos2 = Math.min(1, cosine * cosine);
    sum += (r * r * cos2 + (1 - cos2) / r) ** -1.5;
  }
  return sum / family.length;
}

function dot(left: Vector3, right: Vector3, metric: Matrix3) {
  let total = 0;
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) total += left[i] * metric[i][j] * right[j];
  }
  return total;
}

/** Lists every emission line of a phase inside an angular range (with a margin for tails reaching into it). */
export function calculateLines(reference: PhaseReference, state: PhaseState, optics: InstrumentOptics, range: AngularRange): CalculatedLine[] {
  const lines: CalculatedLine[] = [];
  const reciprocal = reciprocalMetric(reference.cell);
  const margin = 3;
  reference.reflections.forEach((reflection, index) => {
    const d = reflection.d * state.latticeScale;
    let orientation: number | undefined;
    for (const emission of optics.spectrum) {
      const twoTheta = twoThetaFromD(d, emission.wavelength);
      if (twoTheta === undefined || twoTheta < range.startDeg - margin || twoTheta > range.endDeg + margin || twoTheta > 170) continue;
      orientation ??= state.preferredOrientation ? marchDollase(reference, reflection.hkl, state.preferredOrientation, reciprocal) : 1;
      lines.push({
        reflection: index,
        emission: emission.label,
        twoTheta,
        intensity: reflection.multiplicity * reflection.fSquared * lorentzPolarization(twoTheta) * orientation * emission.weight,
        shape: peakShape(twoTheta, emission.wavelength, optics, state),
      });
    }
  });
  return lines;
}

/** Error function (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const polynomial = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-x * x));
}

function symmetricCdf(x: number, h: number, eta: number) {
  const lorentz = 0.5 + Math.atan((2 * x) / h) / Math.PI;
  const gauss = 0.5 * (1 + erf((2 * Math.sqrt(Math.LN2) * x) / h));
  return eta * lorentz + (1 - eta) * gauss;
}

/** Cumulative area of the area-normalized split pseudo-Voigt from −∞ to offset x (degrees) from its maximum. */
export function pseudoVoigtCdf(x: number, shape: PeakShape) {
  const low = shape.fwhm * shape.lowSide;
  const high = shape.fwhm * shape.highSide;
  const total = low + high;
  if (x < 0) return ((2 * low) / total) * symmetricCdf(x, low, shape.eta);
  return low / total + ((2 * high) / total) * (symmetricCdf(x, high, shape.eta) - 0.5);
}

/**
 * Adds scale × line intensity × (profile area inside each bin) to target.
 * Bins are integrated exactly, so narrow peaks keep their area whatever the step size.
 * reflectionFactors, when given, multiplies each reflection (for example grain-sampling fluctuations of one mount).
 */
export function accumulateLines(
  target: Float64Array,
  grid: Grid,
  lines: readonly CalculatedLine[],
  scale: number,
  displacementMm: number,
  optics: InstrumentOptics,
  reflectionFactors?: ArrayLike<number>,
) {
  if (scale === 0) return;
  for (const line of lines) {
    const centre = line.twoTheta + positionShift(line.twoTheta, displacementMm, optics);
    const half = profileWindow(line.shape);
    const first = Math.max(0, Math.floor((centre - half - grid.startDeg) / grid.stepDeg));
    const last = Math.min(grid.count - 1, Math.ceil((centre + half - grid.startDeg) / grid.stepDeg));
    if (first > last) continue;
    let previous = pseudoVoigtCdf(gridAngle(grid, first) - 0.5 * grid.stepDeg - centre, line.shape);
    const amplitude = scale * line.intensity * (reflectionFactors ? reflectionFactors[line.reflection] : 1);
    for (let index = first; index <= last; index += 1) {
      const current = pseudoVoigtCdf(gridAngle(grid, index) + 0.5 * grid.stepDeg - centre, line.shape);
      target[index] += amplitude * (current - previous);
      previous = current;
    }
  }
}

/** Converts a diffuse intensity per radian of 2θ into intensity per bin. */
export function perBin(grid: Grid) {
  return grid.stepDeg * DEG;
}
