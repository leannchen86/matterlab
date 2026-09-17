// Observation-only analysis of a recorded pattern.
// Inputs: counts on a grid, recorded mount facts and the candidates a person chose. Nothing about the specimen.
//
// Model: non-negative phase scales on bin-integrated reference patterns (all emission lines), an unconstrained smooth
// background (Chebyshev terms plus two low-angle terms) and optional unassigned broad-scatter humps, which are never
// reported as phases. The generator is richer than this model (grain statistics, texture, air scatter, amorphous halo),
// so fit statistics serve comparison only and are never shown as confidence.
//
// Linear parameters: Lawson–Hanson NNLS on weighted normal equations; weights 1/(N+1), then 1/max(μ, 1).
// Nonlinear parameters: coarse scans over displacement and lattice, then Levenberg–Marquardt over displacement, zero
// and per-phase lattice, size and strain. The search runs twice from the coarse state and keeps the lower settled
// deviance: once with strain in ε and every coordinate free, and once with strain in ε², a refined zero held until the
// rest has settled, a dropped candidate's parameters left where they were, a second lattice scan about the cells, and
// gains counted in the evidence's units.
// Uncertainty: central-difference curvature of χ² at the optimum; a checked zero adds its own uncertainty through the
// lattice–zero correlation.
// Evidence: BIC with Δχ² scaled by the reduced χ², and Currie limits on reflections unique to one phase
// (L. A. Currie, Anal. Chem. 40 (1968) 586): L_C = 1.645√B, L_D = 2.71 + 3.29√B.

import { catalogPhase } from './phases.ts';
import { accumulateLines, braggScale, calculateLines, gridAngle, type Grid } from './pattern.ts';
import { CU_KALPHA1, LAB_OPTICS, peakShape, positionShift, type InstrumentOptics } from './profile.ts';

export const ANALYSIS_VERSION = 'analysis-3';

/** Repeatability of the goniometer zero from one standard check, degrees 2θ. */
export const ZERO_CHECK_SD_DEG = 0.002;

export type Observation = { readonly grid: Grid; readonly counts: ArrayLike<number> };

export type AnalysisOptions = {
  readonly candidates: readonly string[];
  /** Goniometer zero from a standard check; refined when undefined. */
  readonly zeroDeg?: number;
  /** Standard uncertainty of zeroDeg, carried into latticeSigma; one standard check's repeatability when undefined. */
  readonly zeroSigmaDeg?: number;
  /** Spike recorded for the mount; its cell stays at the certified value. */
  readonly internalStandard?: string;
  /** Adds unassigned broad-scatter terms, never reported as phases. */
  readonly broadScatter?: boolean;
  readonly optics?: InstrumentOptics;
};

export type PhaseStatus = 'required' | 'overlapped' | 'not-required' | 'not-detected';

export type LineCheck = {
  readonly twoTheta: number;
  /** Counts the fitted phase puts in a window of ±1 FWHM. */
  readonly predicted: number;
  /** Observed counts above everything else in the model. */
  readonly net: number;
  readonly decision: number;
  readonly detection: number;
};

export type PhaseFit = {
  readonly id: string;
  readonly scale: number;
  readonly latticeScale: number;
  readonly crystalliteNm: number;
  readonly microstrain: number;
  /** Evidence for including the phase: Δχ²/χ²ν − 3 ln N_eff. */
  readonly deltaBic: number;
  readonly status: PhaseStatus;
  /** Reflections of this phase alone that rise above the decision limit. */
  readonly detected: readonly LineCheck[];
  /** Reflections of this phase alone predicted above the detection limit but not observed. */
  readonly missing: readonly LineCheck[];
  /** Reflections where other phases put more than a fifth of this phase's predicted counts, counted as neither seen nor absent. */
  readonly shared: number;
  /** Candidates whose calculated patterns this scan cannot tell apart from this one. */
  readonly indistinguishableFrom: readonly string[];
  /** Smallest scale at which a reflection of its own would reach the detection limit. */
  readonly detectionScale: number;
  /** Standard uncertainty of latticeScale from the curvature of χ², plus a checked zero's own uncertainty; Infinity when the cell was not refined. */
  readonly latticeSigma: number;
  readonly contribution: Float64Array;
};

export type FeatureKind = 'unexplained' | 'position' | 'intensity' | 'broad';

export type Feature = {
  readonly kind: FeatureKind;
  readonly startDeg: number;
  readonly endDeg: number;
  readonly centreDeg: number;
  /** Signed residual significance over the span. */
  readonly z: number;
  /** Candidates giving at least a fifth of the modelled peak intensity in the span. */
  readonly contributors: readonly string[];
};

export type AnalysisWarning = 'no-candidates' | 'shift-correlated' | 'undersampled';

export type AnalysisResult = {
  readonly version: string;
  readonly grid: Grid;
  readonly calculated: Float64Array;
  /** Smooth background plus any unassigned broad scatter. */
  readonly background: Float64Array;
  readonly phases: readonly PhaseFit[];
  readonly features: readonly Feature[];
  readonly displacementMm: number;
  readonly zeroDeg: number;
  readonly zeroRefined: boolean;
  readonly reducedChiSquare: number;
  /** Poisson deviance, comparable between explanations of the same scan. */
  readonly deviance: number;
  readonly effectivePoints: number;
  readonly parameterCount: number;
  /** Largest background-subtracted count in one bin. */
  readonly peakCounts: number;
  readonly pointsPerFwhm: number;
  readonly warnings: readonly AnalysisWarning[];
};

const Z_THRESHOLD = 4;
const BIC_REQUIRED = 10;
const UNIQUE_SHARE = 0.2;
/** Intensity misfits below this fraction of the modelled peak sit within grain-statistics scatter. */
const INTENSITY_TOLERANCE = 0.15;
const CACHE_LIMIT = 240;

type PhaseParams = { latticeScale: number; crystalliteNm: number; microstrain: number };
const START: PhaseParams = { latticeScale: 1, crystalliteNm: 300, microstrain: 0.0003 };

// ---------------------------------------------------------------------------------------------------------------
// Linear algebra

/** Solves the symmetric system restricted to the indices in `set`; undefined when singular. */
function solveSubset(matrix: Float64Array, vector: Float64Array, size: number, set: readonly number[]) {
  const m = set.length;
  const a = new Float64Array(m * m);
  const b = new Float64Array(m);
  for (let i = 0; i < m; i += 1) {
    b[i] = vector[set[i]];
    for (let j = 0; j < m; j += 1) a[i * m + j] = matrix[set[i] * size + set[j]];
    a[i * m + i] *= 1 + 1e-10;
  }
  for (let column = 0; column < m; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < m; row += 1) if (Math.abs(a[row * m + column]) > Math.abs(a[pivot * m + column])) pivot = row;
    if (Math.abs(a[pivot * m + column]) < 1e-14) return undefined;
    if (pivot !== column) {
      for (let k = 0; k < m; k += 1) [a[column * m + k], a[pivot * m + k]] = [a[pivot * m + k], a[column * m + k]];
      [b[column], b[pivot]] = [b[pivot], b[column]];
    }
    for (let row = column + 1; row < m; row += 1) {
      const factor = a[row * m + column] / a[column * m + column];
      if (factor === 0) continue;
      for (let k = column; k < m; k += 1) a[row * m + k] -= factor * a[column * m + k];
      b[row] -= factor * b[column];
    }
  }
  const x = new Float64Array(m);
  for (let row = m - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let k = row + 1; k < m; k += 1) sum -= a[row * m + k] * x[k];
    x[row] = sum / a[row * m + row];
  }
  return x;
}

/** Lawson–Hanson NNLS on normal equations; variables flagged `free` stay unconstrained and always passive. */
export function nnlsNormal(matrix: Float64Array, vector: Float64Array, free: readonly boolean[]) {
  const size = vector.length;
  const passive = [...free];
  const solve = () => {
    const set = passive.flatMap((isPassive, index) => (isPassive ? [index] : []));
    const values = solveSubset(matrix, vector, size, set);
    const z = new Float64Array(size);
    if (values) set.forEach((index, k) => (z[index] = values[k]));
    return z;
  };
  let x = passive.some(Boolean) ? solve() : new Float64Array(size);
  const blocked = new Set<number>();
  for (let outer = 0; outer < 3 * size; outer += 1) {
    let best = -1;
    let bestGradient = 1e-10;
    for (let j = 0; j < size; j += 1) {
      if (passive[j] || blocked.has(j)) continue;
      let gradient = vector[j];
      for (let k = 0; k < size; k += 1) gradient -= matrix[j * size + k] * x[k];
      if (gradient > bestGradient) {
        bestGradient = gradient;
        best = j;
      }
    }
    if (best < 0) break;
    passive[best] = true;
    let z = solve();
    if (z[best] <= 0) {
      // Numerically unable to enter; try the next variable.
      passive[best] = false;
      blocked.add(best);
      continue;
    }
    blocked.clear();
    for (let inner = 0; inner < 3 * size; inner += 1) {
      let limit = -1;
      let alpha = 1;
      for (let j = 0; j < size; j += 1) {
        if (!passive[j] || free[j] || z[j] > 0) continue;
        const step = x[j] / (x[j] - z[j]);
        if (limit < 0 || step < alpha) {
          alpha = step;
          limit = j;
        }
      }
      if (limit < 0) break;
      for (let j = 0; j < size; j += 1) x[j] += alpha * (z[j] - x[j]);
      passive[limit] = false;
      x[limit] = 0;
      for (let j = 0; j < size; j += 1) {
        if (passive[j] && !free[j] && x[j] <= 0) {
          passive[j] = false;
          x[j] = 0;
        }
      }
      z = solve();
    }
    x = z;
  }
  return x;
}

/** Columns of the inverse of a symmetric matrix, solved at unit diagonal so the pivot test is relative; undefined when singular. */
function inverseColumns(matrix: Float64Array, size: number, columns: readonly number[]) {
  const norms = Array.from({ length: size }, (_, j) => Math.sqrt(matrix[j * size + j]) || 1);
  const scaled = matrix.map((value, index) => value / (norms[Math.floor(index / size)] * norms[index % size]));
  const all = Array.from({ length: size }, (_, j) => j);
  return columns.map((column) => {
    const unit = new Float64Array(size);
    unit[column] = 1;
    const solution = solveSubset(scaled, unit, size, all);
    return solution ? solution.map((value, row) => value / (norms[row] * norms[column])) : undefined;
  });
}

type LinearFit = { readonly background: Float64Array; readonly scales: Float64Array; readonly broad: Float64Array; readonly chiSquare: number };

function solveLinear(y: Float64Array, weights: Float64Array, background: readonly Float64Array[], phases: readonly (Float64Array | undefined)[], broad: readonly Float64Array[]): LinearFit {
  const present = phases.flatMap((column, p) => (column ? [p] : []));
  const columns = [...background, ...present.map((p) => phases[p] as Float64Array), ...broad];
  const free = columns.map((_, j) => j < background.length);
  const size = columns.length;
  const n = y.length;
  const matrix = new Float64Array(size * size);
  const vector = new Float64Array(size);
  let chiSquare = 0;
  for (let i = 0; i < n; i += 1) chiSquare += weights[i] * y[i] * y[i];
  for (let j = 0; j < size; j += 1) {
    const cj = columns[j];
    let bj = 0;
    for (let i = 0; i < n; i += 1) bj += weights[i] * cj[i] * y[i];
    vector[j] = bj;
    for (let k = j; k < size; k += 1) {
      const ck = columns[k];
      let sum = 0;
      for (let i = 0; i < n; i += 1) if (cj[i] !== 0) sum += weights[i] * cj[i] * ck[i];
      matrix[j * size + k] = sum;
      matrix[k * size + j] = sum;
    }
  }
  // Unit column norms keep the pivots comparable between background terms and phase columns.
  const norms = columns.map((_, j) => Math.sqrt(matrix[j * size + j]) || 1);
  const scaledMatrix = matrix.map((value, index) => value / (norms[Math.floor(index / size)] * norms[index % size]));
  const scaledVector = vector.map((value, j) => value / norms[j]);
  const solution = nnlsNormal(scaledMatrix, scaledVector, free).map((value, j) => value / norms[j]);
  for (let j = 0; j < size; j += 1) {
    chiSquare -= 2 * solution[j] * vector[j];
    for (let k = 0; k < size; k += 1) chiSquare += solution[j] * matrix[j * size + k] * solution[k];
  }
  const K = background.length;
  const scales = new Float64Array(phases.length);
  present.forEach((p, index) => (scales[p] = solution[K + index]));
  return { background: solution.slice(0, K), scales, broad: solution.slice(K + present.length), chiSquare: Math.max(0, chiSquare) };
}

// ---------------------------------------------------------------------------------------------------------------
// Model columns

function backgroundColumns(grid: Grid) {
  const start = grid.startDeg;
  const span = Math.max(gridAngle(grid, grid.count - 1) - start, 1e-9);
  // Narrow targeted scans only support a line; full scans get Chebyshev terms and low-angle air-scatter terms.
  const narrow = span < 8;
  const order = narrow ? 2 : 5;
  const columns = Array.from({ length: narrow ? order : order + 2 }, () => new Float64Array(grid.count));
  for (let index = 0; index < grid.count; index += 1) {
    const twoTheta = gridAngle(grid, index);
    const x = (2 * (twoTheta - start)) / span - 1;
    let previous = 1;
    let current = x;
    columns[0][index] = 1;
    columns[1][index] = x;
    for (let k = 2; k < order; k += 1) {
      const next = 2 * x * current - previous;
      columns[k][index] = next;
      previous = current;
      current = next;
    }
    if (!narrow) {
      columns[order][index] = start / twoTheta;
      columns[order + 1][index] = (start / twoTheta) ** 3;
    }
  }
  return columns;
}

function broadColumns(grid: Grid) {
  return [22, 30, 38].map((centre) => {
    const column = new Float64Array(grid.count);
    for (let index = 0; index < grid.count; index += 1) column[index] = Math.exp((-4 * Math.LN2 * (gridAngle(grid, index) - centre) ** 2) / 100);
    return column;
  });
}

function linesFor(id: string, params: PhaseParams, grid: Grid, optics: InstrumentOptics) {
  const lines = calculateLines(catalogPhase(id).reference, params, optics, { startDeg: grid.startDeg, endDeg: gridAngle(grid, grid.count - 1) });
  let strongest = 0;
  for (const line of lines) strongest = Math.max(strongest, line.intensity);
  return lines.filter((line) => line.intensity >= 1e-5 * strongest);
}

function addScaled(target: Float64Array, column: Float64Array, scale: number) {
  if (scale === 0) return;
  for (let index = 0; index < target.length; index += 1) target[index] += scale * column[index];
}

function fwhmAt(twoTheta: number, optics: InstrumentOptics) {
  return peakShape(twoTheta, CU_KALPHA1, optics, START).fwhm;
}

/** Poisson deviance of the counts against a model over the first n bins. */
function poissonDeviance(y: Float64Array, model: Float64Array, n: number) {
  let deviance = 0;
  for (let index = 0; index < n; index += 1) {
    const mu = Math.max(model[index], 1e-9);
    deviance += 2 * (mu - y[index] + (y[index] > 0 ? y[index] * Math.log(y[index] / mu) : 0));
  }
  return deviance;
}

// ---------------------------------------------------------------------------------------------------------------
// Analysis

/** A nonlinear parameter with bounds and the finite-difference step used for its derivative. */
type Coordinate = { readonly read: () => number; readonly write: (value: number) => void; readonly lower: number; readonly upper: number; readonly delta: number; readonly phase?: number };
type Snapshot = { readonly displacement: number; readonly zero: number; readonly params: readonly PhaseParams[]; readonly current: LinearFit };

export function analyzePattern(observation: Observation, options: AnalysisOptions): AnalysisResult {
  const { grid } = observation;
  const n = grid.count;
  const y = Float64Array.from(observation.counts);
  const baseOptics = options.optics ?? LAB_OPTICS;
  const standard = options.internalStandard;
  // Sorted so the result never depends on the order candidates were picked in.
  const ids = [...new Set([...options.candidates, ...(standard ? [standard] : [])])].sort();
  const zeroRefined = options.zeroDeg === undefined;
  const background = backgroundColumns(grid);
  const broad = options.broadScatter ? broadColumns(grid) : [];
  const weights = new Float64Array(n);
  for (let index = 0; index < n; index += 1) weights[index] = 1 / (y[index] + 1);

  let displacement = 0;
  let zero = options.zeroDeg ?? 0;
  const params = ids.map((): PhaseParams => ({ ...START }));
  const cache = new Map<string, Float64Array>();
  const column = (p: number) => {
    const { latticeScale, crystalliteNm, microstrain } = params[p];
    const key = `${ids[p]}|${latticeScale}|${crystalliteNm}|${microstrain}|${displacement}|${zero}`;
    let values = cache.get(key);
    if (!values) {
      if (cache.size >= CACHE_LIMIT) cache.clear();
      const optics = { ...baseOptics, zeroShiftDeg: zero };
      values = new Float64Array(n);
      accumulateLines(values, grid, linesFor(ids[p], params[p], grid, optics), braggScale(catalogPhase(ids[p]).reference), displacement, optics);
      cache.set(key, values);
    }
    return values;
  };
  const columns = () => ids.map((_, p) => column(p));
  const fit = (phaseColumns: readonly (Float64Array | undefined)[]) => solveLinear(y, weights, background, phaseColumns, broad);
  let current = fit(columns());

  const attempt = (coordinate: Coordinate, value: number) => {
    const start = coordinate.read();
    const next = Math.min(coordinate.upper, Math.max(coordinate.lower, value));
    if (next === start) return false;
    coordinate.write(next);
    const trial = fit(columns());
    if (trial.chiSquare < current.chiSquare) {
      current = trial;
      return true;
    }
    coordinate.write(start);
    return false;
  };
  const scan = (coordinate: Coordinate, values: readonly number[]) => values.forEach((value) => attempt(coordinate, value));
  const activeCoordinates = (all: readonly Coordinate[]) => all.filter((coordinate) => coordinate.phase === undefined || current.scales[coordinate.phase] > 0);
  const shiftedColumns = (coordinate: Coordinate, value: number) => {
    const start = coordinate.read();
    coordinate.write(value);
    const shifted = columns();
    coordinate.write(start);
    return shifted;
  };
  // Finite differences of the model with the linear parameters held at their current values: forward steps for the
  // search, central steps for the final curvature.
  const normalEquations = (active: readonly Coordinate[], central = false) => {
    const size = active.length;
    const base = columns();
    const residual = assemble(current, base, background, broad, n).total.map((value, index) => y[index] - value);
    const jacobian = active.map((coordinate) => {
      const start = coordinate.read();
      const forward = start + coordinate.delta <= coordinate.upper ? coordinate.delta : -coordinate.delta;
      const up = central ? Math.min(coordinate.upper, start + coordinate.delta) : start + forward;
      const down = central ? Math.max(coordinate.lower, start - coordinate.delta) : start;
      const high = shiftedColumns(coordinate, up);
      const low = central ? shiftedColumns(coordinate, down) : base;
      const h = central ? up - down : forward;
      const derivative = new Float64Array(n);
      high.forEach((values, p) => {
        const factor = current.scales[p] / h;
        if (values === low[p] || factor === 0) return;
        for (let index = 0; index < n; index += 1) derivative[index] += factor * (values[index] - low[p][index]);
      });
      return derivative;
    });
    const matrix = new Float64Array(size * size);
    const gradient = new Float64Array(size);
    for (let j = 0; j < size; j += 1) {
      for (let index = 0; index < n; index += 1) gradient[j] += weights[index] * jacobian[j][index] * residual[index];
      for (let k = j; k < size; k += 1) {
        let sum = 0;
        for (let index = 0; index < n; index += 1) sum += weights[index] * jacobian[j][index] * jacobian[k][index];
        matrix[j * size + k] = sum;
        matrix[k * size + j] = sum;
      }
    }
    return { matrix, gradient };
  };
  // Levenberg–Marquardt with the linear parameters projected out. The Jacobian holds them fixed (Kaufman's
  // approximation); every trial step re-solves them exactly, so a step is kept only if χ² truly falls. `second` marks the
  // second search below, which changes what happens to a dropped candidate and when the search stops.
  const refine = (coordinates: readonly Coordinate[], second: boolean) => {
    let lambda = 1e-3;
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const active = activeCoordinates(coordinates);
      const size = active.length;
      if (!size) return;
      const { matrix, gradient } = normalEquations(active);
      const starts = active.map((coordinate) => coordinate.read());
      const previous = current.chiSquare;
      let accepted = false;
      for (let trial = 0; trial < 10 && !accepted; trial += 1) {
        const damped = matrix.map((value, index) => (index % (size + 1) === 0 ? (value || 1) * (1 + lambda) : value));
        const step = solveSubset(damped, gradient, size, active.map((_, j) => j));
        if (step) {
          const take = (j: number) => Math.min(active[j].upper, Math.max(active[j].lower, starts[j] + step[j]));
          active.forEach((coordinate, j) => coordinate.write(take(j)));
          let candidate = fit(columns());
          // A step that drops a candidate would freeze its parameters wherever the step left them, often at a bound. In the
          // second search they go back to where they were: with that pattern available again the linear solve ends no worse.
          const dropped = second ? active.flatMap((coordinate, j) => (coordinate.phase !== undefined && !(candidate.scales[coordinate.phase] > 0) ? [j] : [])) : [];
          if (dropped.length) {
            dropped.forEach((j) => active[j].write(starts[j]));
            const kept = fit(columns());
            if (kept.chiSquare <= candidate.chiSquare) candidate = kept;
            else dropped.forEach((j) => active[j].write(take(j)));
          }
          if (candidate.chiSquare < current.chiSquare) {
            current = candidate;
            accepted = true;
            lambda = Math.max(1e-9, lambda / 3);
            continue;
          }
          active.forEach((coordinate, j) => coordinate.write(starts[j]));
        }
        lambda *= 4;
      }
      // Evidence thresholds sit at Δχ² ≈ 10, so smaller gains cannot change any conclusion. The evidence divides Δχ² by the
      // reduced χ² when that exceeds 1, and the second search measures its gains the same way; the first stops as before.
      if (!accepted || previous - current.chiSquare < 0.1 * (second ? Math.max(1, previous / n) : 1)) return;
    }
  };

  const coordinates: Coordinate[] = [];
  const displacementCoordinate: Coordinate = { read: () => displacement, write: (value) => (displacement = value), lower: -0.6, upper: 0.6, delta: 0.004 };
  const zeroCoordinate: Coordinate = { read: () => zero, write: (value) => (zero = value), lower: -0.2, upper: 0.2, delta: 0.001 };
  if (ids.length) coordinates.push(displacementCoordinate);
  if (ids.length && zeroRefined) coordinates.push(zeroCoordinate);
  const latticeCoordinates = new Map<number, Coordinate>();
  const linearStrain = new Map<Coordinate, Coordinate>();
  ids.forEach((id, p) => {
    if (id !== standard) {
      const lattice: Coordinate = { read: () => params[p].latticeScale, write: (value) => (params[p].latticeScale = value), lower: 0.99, upper: 1.01, delta: 2e-5, phase: p };
      latticeCoordinates.set(p, lattice);
      coordinates.push(lattice);
    }
    coordinates.push({ read: () => Math.log2(params[p].crystalliteNm), write: (value) => (params[p].crystalliteNm = 2 ** value), lower: Math.log2(20), upper: Math.log2(3000), delta: 0.02, phase: p });
    // The strain width adds in quadrature, so the profile follows ε², not ε. In ε the slope at zero strain is zero and
    // every step clipped at the bound raises χ²; the first search keeps ε as before, the second and the curvature use ε².
    const strain: Coordinate = { read: () => params[p].microstrain ** 2, write: (value) => (params[p].microstrain = Math.sqrt(value)), lower: 0, upper: 0.004 ** 2, delta: 4e-9, phase: p };
    coordinates.push(strain);
    linearStrain.set(strain, { read: () => params[p].microstrain, write: (value) => (params[p].microstrain = value), lower: 0, upper: 0.004, delta: 1e-5, phase: p });
  });

  // Poisson weights from the model, with the linear parameters re-solved after each update.
  const reweight = (phaseColumns: readonly Float64Array[]) => {
    let settled = current;
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const model = assemble(settled, phaseColumns, background, broad, n).total;
      for (let index = 0; index < n; index += 1) weights[index] = 1 / Math.max(model[index], 1);
      settled = fit(phaseColumns);
    }
    return settled;
  };
  const snapshot = (): Snapshot => ({ displacement, zero, params: params.map((phase) => ({ ...phase })), current });
  const restore = (saved: Snapshot) => {
    displacement = saved.displacement;
    zero = saved.zero;
    saved.params.forEach((phase, p) => Object.assign(params[p], phase));
    current = saved.current;
  };
  // The deviance the current parameters would end with, leaving the search weights as they were.
  const settledDeviance = () => {
    const searchWeights = Float64Array.from(weights);
    const phaseColumns = columns();
    const deviance = poissonDeviance(y, assemble(reweight(phaseColumns), phaseColumns, background, broad, n).total, n);
    weights.set(searchWeights);
    return deviance;
  };
  if (ids.length) {
    // Coarse grids first: shifts of a full width or more sit outside the basin of a local search.
    scan(displacementCoordinate, [-0.45, -0.375, -0.3, -0.225, -0.15, -0.075, 0.075, 0.15, 0.225, 0.3, 0.375, 0.45]);
    for (const lattice of latticeCoordinates.values()) scan(lattice, [0.994, 0.995, 0.996, 0.997, 0.998, 0.999, 1.001, 1.002, 1.003, 1.004, 1.005, 1.006]);
    const coarse = snapshot();
    refine(coordinates.map((coordinate) => linearStrain.get(coordinate) ?? coordinate), false);
    const first = snapshot();
    const firstDeviance = settledDeviance();
    // A second search from the same coarse state. Zero and displacement move peaks almost alike, so a joint search runs
    // along that valley and leaves the cells behind: a refined zero stays at the coarse value until the rest has settled.
    restore(coarse);
    if (zeroRefined) refine(coordinates.filter((coordinate) => coordinate !== zeroCoordinate), true);
    refine(coordinates, true);
    // A weak phase's cell has several local minima, and the coarse lattice grid ran at the coarse displacement. The same
    // grid is scanned again about each refined cell, and the search restarts when that lowers χ².
    const settled = current.chiSquare;
    for (const lattice of latticeCoordinates.values()) {
      const centre = lattice.read();
      scan(lattice, [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6].map((k) => centre + 0.001 * k));
    }
    if (current.chiSquare < settled) refine(coordinates, true);
    // Neither search ends lower on every scan, so the fit keeps whichever settles lower, the first on a tie.
    if (!(settledDeviance() < firstDeviance)) restore(first);
  }

  const phaseColumns = columns();
  current = reweight(phaseColumns);
  const { smooth, total } = assemble(current, phaseColumns, background, broad, n);
  const activePhases = ids.filter((_, p) => current.scales[p] > 0).length;
  const parameterCount = background.length + broad.length + 3 * activePhases + (ids.length ? 1 : 0) + (ids.length && zeroRefined ? 1 : 0);
  const reducedChiSquare = current.chiSquare / Math.max(1, n - parameterCount);
  const span = gridAngle(grid, n - 1) - grid.startDeg;
  const midFwhm = fwhmAt(grid.startDeg + span / 2, baseOptics);
  const effectivePoints = Math.max(20, Math.min(n, span / midFwhm));
  const penalty = 3 * Math.log(effectivePoints);
  const finalOptics = { ...baseOptics, zeroShiftDeg: zero };

  // Curvature of χ² at the optimum with every refined nonlinear parameter free, so the lattice uncertainty carries its
  // correlation with displacement and a refined zero. A checked zero stays held, and its own uncertainty enters through
  // the lattice–zero correlation: σ² = C_held[a,a]·max(1, χ²ν) + (C[a,z]/C[z,z]·σ_zero)².
  const latticeSigmas = new Map<number, number>();
  const finalActive = activeCoordinates(coordinates);
  const lattices = finalActive.flatMap((coordinate, j) => (coordinate.phase !== undefined && latticeCoordinates.get(coordinate.phase) === coordinate ? [j] : []));
  if (lattices.length) {
    const zeroSigma = options.zeroSigmaDeg ?? ZERO_CHECK_SD_DEG;
    const propagate = !zeroRefined && zeroSigma > 0;
    const size = finalActive.length;
    // The held zero is not refined, so its steps are not clipped to the refinement bounds.
    const { matrix } = normalEquations(propagate ? [...finalActive, { ...zeroCoordinate, lower: -Infinity, upper: Infinity }] : finalActive, true);
    const held = propagate ? matrix.filter((_, index) => index % (size + 1) !== size && Math.floor(index / (size + 1)) !== size) : matrix;
    const [zeroColumn] = propagate ? inverseColumns(matrix, size + 1, [size]) : [];
    inverseColumns(held, size, lattices).forEach((column, k) => {
      const j = lattices[k];
      const phase = finalActive[j].phase;
      if (!column || !(column[j] > 0) || phase === undefined) return;
      let variance = column[j] * Math.max(1, reducedChiSquare);
      if (propagate) {
        if (!zeroColumn || !(zeroColumn[size] > 0)) return;
        variance += ((zeroColumn[j] / zeroColumn[size]) * zeroSigma) ** 2;
      }
      latticeSigmas.set(phase, Math.sqrt(variance));
    });
  }

  const contributions = phaseColumns.map((values, p) => {
    const contribution = new Float64Array(n);
    addScaled(contribution, values, current.scales[p]);
    return contribution;
  });
  const phaseSum = new Float64Array(n);
  for (let index = 0; index < n; index += 1) phaseSum[index] = total[index] - smooth[index];

  const binOf = (twoTheta: number) => Math.round((twoTheta - grid.startDeg) / grid.stepDeg);
  const endDeg = gridAngle(grid, n - 1);
  const lineChecks = (p: number) => {
    const scale = current.scales[p];
    const lines = linesFor(ids[p], params[p], grid, finalOptics)
      .filter((line) => line.emission === 'Kα1')
      .sort((left, right) => right.intensity - left.intensity);
    const strongest = lines[0]?.intensity ?? 0;
    const taken: [number, number][] = [];
    const checks: (LineCheck & { unit: number })[] = [];
    let shared = 0;
    for (const line of lines) {
      if (line.intensity < 0.01 * strongest) break;
      const centre = line.twoTheta + positionShift(line.twoTheta, displacement, finalOptics);
      if (centre < grid.startDeg || centre > endDeg) continue;
      const half = Math.max(line.shape.fwhm, 1.5 * grid.stepDeg);
      const first = Math.max(0, binOf(centre - half));
      const last = Math.min(n - 1, binOf(centre + half));
      if (first >= last || taken.some(([left, right]) => first <= right && last >= left)) continue;
      taken.push([first, last]);
      let unit = 0;
      let others = 0;
      let blank = 0;
      let observed = 0;
      for (let index = first; index <= last; index += 1) {
        unit += phaseColumns[p][index];
        others += phaseSum[index] - contributions[p][index];
        blank += smooth[index];
        observed += y[index];
      }
      const b = Math.max(0, blank + others);
      const decision = 1.645 * Math.sqrt(b);
      const detection = 2.71 + 3.29 * Math.sqrt(b);
      const predicted = scale * unit;
      if (others > UNIQUE_SHARE * (scale > 0 ? predicted : detection)) {
        shared += 1;
        continue;
      }
      checks.push({ twoTheta: centre, predicted, net: observed - b, decision, detection, unit });
    }
    return { checks, shared };
  };

  const phases = ids.map((id, p): PhaseFit => {
    const scale = current.scales[p];
    let deltaBic = -Infinity;
    if (scale > 0) {
      const without = fit(phaseColumns.map((values, q) => (q === p ? undefined : values)));
      deltaBic = Math.max(0, without.chiSquare - current.chiSquare) / Math.max(1, reducedChiSquare) - penalty;
    }
    const { checks, shared } = lineChecks(p);
    const detected = scale > 0 ? checks.filter((check) => check.predicted >= check.decision && check.net > check.decision) : [];
    const missing = scale > 0 ? checks.filter((check) => check.predicted >= check.detection && check.net < check.decision) : [];
    let detectionScale = Infinity;
    for (const check of checks) if (check.unit > 0) detectionScale = Math.min(detectionScale, check.detection / check.unit);
    const indistinguishableFrom = ids.filter((_, q) => {
      if (q === p) return false;
      let cross = 0;
      let left = 0;
      let right = 0;
      for (let index = 0; index < n; index += 1) {
        cross += weights[index] * phaseColumns[p][index] * phaseColumns[q][index];
        left += weights[index] * phaseColumns[p][index] ** 2;
        right += weights[index] * phaseColumns[q][index] ** 2;
      }
      return left > 0 && right > 0 && cross / Math.sqrt(left * right) > 0.95;
    });
    let status: PhaseStatus = 'not-required';
    if (scale <= 0) status = 'not-detected';
    else if (deltaBic > BIC_REQUIRED) status = detected.length ? 'required' : 'overlapped';
    return {
      id,
      scale,
      latticeScale: params[p].latticeScale,
      crystalliteNm: params[p].crystalliteNm,
      microstrain: params[p].microstrain,
      deltaBic,
      status,
      detected: detected.map(withoutUnit),
      missing: missing.map(withoutUnit),
      shared: scale > 0 ? shared : 0,
      indistinguishableFrom,
      detectionScale,
      latticeSigma: latticeSigmas.get(p) ?? Infinity,
      contribution: contributions[p],
    };
  });

  const deviance = poissonDeviance(y, total, n);
  let peakCounts = 0;
  for (let index = 0; index < n; index += 1) peakCounts = Math.max(peakCounts, y[index] - smooth[index]);
  const pointsPerFwhm = midFwhm / grid.stepDeg;
  const warnings: AnalysisWarning[] = [];
  if (!ids.length) warnings.push('no-candidates');
  else if (!standard) warnings.push('shift-correlated');
  if (pointsPerFwhm < 3) warnings.push('undersampled');

  return {
    version: ANALYSIS_VERSION,
    grid,
    calculated: total,
    background: smooth,
    phases,
    features: findFeatures(grid, y, total, smooth, contributions, ids, baseOptics, reducedChiSquare),
    displacementMm: displacement,
    zeroDeg: zero,
    zeroRefined,
    reducedChiSquare,
    deviance,
    effectivePoints,
    parameterCount,
    peakCounts,
    pointsPerFwhm,
    warnings,
  };
}

function assemble(solution: LinearFit, phaseColumns: readonly Float64Array[], background: readonly Float64Array[], broad: readonly Float64Array[], n: number) {
  const smooth = new Float64Array(n);
  background.forEach((values, k) => addScaled(smooth, values, solution.background[k]));
  broad.forEach((values, k) => addScaled(smooth, values, solution.broad[k]));
  const total = Float64Array.from(smooth);
  phaseColumns.forEach((values, p) => addScaled(total, values, solution.scales[p]));
  return { smooth, total };
}

function withoutUnit({ twoTheta, predicted, net, decision, detection }: LineCheck): LineCheck {
  return { twoTheta, predicted, net, decision, detection };
}

function findFeatures(
  grid: Grid,
  y: Float64Array,
  model: Float64Array,
  smooth: Float64Array,
  contributions: readonly Float64Array[],
  ids: readonly string[],
  optics: InstrumentOptics,
  reducedChiSquare: number,
): Feature[] {
  const n = grid.count;
  const residual = new Float64Array(n);
  const variance = new Float64Array(n);
  const modelled = new Float64Array(n);
  for (let index = 0; index < n; index += 1) {
    residual[index] = y[index] - model[index];
    variance[index] = Math.max(model[index], 1);
    modelled[index] = model[index] - smooth[index];
  }
  const sum = (values: Float64Array, first: number, last: number) => {
    let total = 0;
    for (let index = first; index <= last; index += 1) total += values[index];
    return total;
  };
  const z = (first: number, last: number) => sum(residual, first, last) / Math.sqrt(sum(variance, first, last));

  // Narrow windows about one peak width wide, half overlapping.
  const spans: [number, number][] = [];
  for (let first = 0; first < n; ) {
    const width = Math.max(3, Math.round(fwhmAt(gridAngle(grid, first), optics) / grid.stepDeg));
    const last = Math.min(n - 1, first + width - 1);
    const middle = Math.floor((first + last) / 2);
    const left = z(first, middle);
    const right = z(Math.min(last, middle + 1), last);
    const derivative = Math.abs(left) >= Z_THRESHOLD && Math.abs(right) >= Z_THRESHOLD && Math.sign(left) !== Math.sign(right);
    if (Math.abs(z(first, last)) >= Z_THRESHOLD || derivative) {
      const previous = spans[spans.length - 1];
      if (previous && first <= previous[1] + 1) previous[1] = Math.max(previous[1], last);
      else spans.push([first, last]);
    }
    first += Math.max(1, Math.floor(width / 2));
  }

  const features: Feature[] = [];
  const covered = new Uint8Array(n);
  for (const [first, last] of spans) {
    covered.fill(1, first, last + 1);
    const excess = sum(residual, first, last);
    const peak = sum(modelled, first, last);
    let split = first;
    for (let index = first; index <= last; index += 1) if (modelled[index] > modelled[split]) split = index;
    const left = split > first ? z(first, split) : 0;
    const right = split < last ? z(split + 1, last) : 0;
    let kind: FeatureKind;
    if (peak > 0 && Math.abs(left) >= 3 && Math.abs(right) >= 3 && Math.sign(left) !== Math.sign(right)) kind = 'position';
    else if (excess > 0 && excess >= peak) kind = 'unexplained';
    else if (Math.abs(excess) >= INTENSITY_TOLERANCE * peak) kind = 'intensity';
    else continue;
    let weighted = 0;
    let weight = 0;
    for (let index = first; index <= last; index += 1) {
      weighted += Math.abs(residual[index]) * gridAngle(grid, index);
      weight += Math.abs(residual[index]);
    }
    features.push({
      kind,
      startDeg: gridAngle(grid, first),
      endDeg: gridAngle(grid, last),
      centreDeg: weight > 0 ? weighted / weight : gridAngle(grid, split),
      z: z(first, last),
      contributors: ids.filter((_, p) => peak > 0 && sum(contributions[p], first, last) >= 0.2 * peak),
    });
  }

  // Broad misfit in 2° windows outside the narrow features, scaled by the overall misfit.
  const width = Math.max(5, Math.round(2 / grid.stepDeg));
  const scale = Math.sqrt(Math.max(1, reducedChiSquare));
  let open: [number, number, number] | undefined;
  const close = () => {
    if (!open) return;
    const [first, last, value] = open;
    features.push({ kind: 'broad', startDeg: gridAngle(grid, first), endDeg: gridAngle(grid, last), centreDeg: gridAngle(grid, Math.floor((first + last) / 2)), z: value, contributors: [] });
    open = undefined;
  };
  for (let first = 0; n > 2 * width && first + width <= n; first += Math.floor(width / 2)) {
    const last = first + width - 1;
    let total = 0;
    let varianceTotal = 0;
    for (let index = first; index <= last; index += 1) {
      if (covered[index]) continue;
      total += residual[index];
      varianceTotal += variance[index];
    }
    const value = varianceTotal > 0 ? total / Math.sqrt(varianceTotal) / scale : 0;
    if (Math.abs(value) < 6) continue;
    if (open && first <= open[1] && Math.sign(value) === Math.sign(open[2])) {
      open[1] = last;
      if (Math.abs(value) > Math.abs(open[2])) open[2] = value;
    } else {
      close();
      open = [first, last, value];
    }
  }
  close();
  return features.sort((left, right) => left.centreDeg - right.centreDeg);
}

export type Comparison = 'much-better' | 'better' | 'similar' | 'worse' | 'much-worse';

/** How explanation `b` describes the same scan relative to explanation `a`, from the Poisson deviance and BIC penalty. */
export function compareExplanations(a: AnalysisResult, b: AnalysisResult): Comparison {
  if (a.grid.startDeg !== b.grid.startDeg || a.grid.stepDeg !== b.grid.stepDeg || a.grid.count !== b.grid.count) throw new Error('Explanations describe different scans');
  const scale = Math.max(1, Math.min(a.reducedChiSquare, b.reducedChiSquare));
  const delta = (b.deviance - a.deviance) / scale + (b.parameterCount - a.parameterCount) * Math.log(a.effectivePoints);
  if (delta > 100) return 'much-worse';
  if (delta > 10) return 'worse';
  if (delta < -100) return 'much-better';
  if (delta < -10) return 'better';
  return 'similar';
}

/**
 * Zero-matrix-variance weight fractions of the crystalline phases in the fit (Hill & Howard, J. Appl. Cryst. 20 (1987) 467).
 * Columns already carry λ³/(32πV²ρ), so fractions are the normalized scales. Valid only when every crystalline phase is
 * identified and no amorphous content is present; used to validate the engine, never shown to players.
 */
export function normalizedWeightFractions(result: AnalysisResult) {
  const active = result.phases.filter((phase) => phase.scale > 0);
  const total = active.reduce((sum, phase) => sum + phase.scale, 0);
  return new Map(active.map((phase) => [phase.id, phase.scale / total]));
}
