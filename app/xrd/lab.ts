// One shift in the analytical lab, shared by free play and guided samples. State holds only what a notebook
// would: revealed notes, mounts, immutable runs, interpretations, requests and calls. Powders and the instrument are
// derived from the seed whenever an instrument reads them and are never stored where an interface could show them. Hidden
// truth appears only in the debrief, and only after a call is committed.
import { analyzePattern, compareExplanations, type AnalysisOptions, type AnalysisResult, type Comparison } from './analysis.ts';
import { sampleCase, specimenFor, type Objective } from './cases.ts';
import { candidateLibrary, chemicalSupport, type ElementEvidence } from './context.ts';
import { edsElements, runSemEds, runTga, type SemEdsResult, type TgaResult } from './followups.ts';
import { acquisitionFor, measure, prepareMount, type Grind, type InstrumentState, type MountRecord, type ProgramId, type SpikeKind } from './measure.ts';
import { catalogPhase } from './phases.ts';
import { createRandom, hashSeed } from './random.ts';
import { createInterpretation, createRun, interpretationOptions, sameInterpretation, type Interpretation, type RunRecord } from './records.ts';
import { ZR_LATTICE_PER_MOL_PERCENT, synthesize, type PhaseAmount, type SynthesisHistory } from './synthesis.ts';

export { ZR_LATTICE_PER_MOL_PERCENT };
export const SHIFT_MINUTES = 480;

/** Illustrative bench times in minutes. */
export const COSTS = {
  inspect: 2,
  mount: { front: 8, back: 12 },
  grind: { 'as-received': 0, hand: 15, extended: 30 },
  spike: 20,
  spin: 5,
  scanHandling: 2,
  standard: 35,
  tga: { handling: 5, duration: 90 },
  sem: { handling: 10, duration: 60 },
} as const;

export const POWDER_G = { front: 0.25, back: 0.4, tga: 0.02, sem: 0.005 } as const;
/** Instrument slots for the whole shift, shared by every sample. */
export const CAPACITY = { tga: 2, sem: 2 } as const;
const SPIKE_FRACTION = 0.1;
const GRIND_ORDER: Readonly<Record<Grind, number>> = { 'as-received': 0, hand: 1, extended: 2 };

export type Decision = 'release' | 'recalcine' | 'regrind-recalcine' | 'adjust-stoichiometry' | 'change-media' | 'hold-reference';
export const DECISIONS: readonly Decision[] = ['release', 'recalcine', 'regrind-recalcine', 'adjust-stoichiometry', 'change-media', 'hold-reference'];
export const DECISION_LABELS: Readonly<Record<Decision, string>> = {
  release: 'Release',
  recalcine: 'Recalcine',
  'regrind-recalcine': 'Regrind + recalcine',
  'adjust-stoichiometry': 'Reweigh 1:1',
  'change-media': 'Agate media',
  'hold-reference': 'Hold for reference',
};
type BatchDecision = Exclude<Decision, 'hold-reference'>;
/** Relative effort of acting on a batch, used to judge whether a cheaper decision would have met the objective. */
const DECISION_TIER: Readonly<Record<BatchDecision, number>> = { release: 0, recalcine: 1, 'regrind-recalcine': 2, 'adjust-stoichiometry': 3, 'change-media': 3 };

/** What the call says about signal it does not explain: nothing left, a phase with no reference, or data too weak to say. */
export type Unexplained = 'none' | 'reference' | 'measurement';

export type Call = {
  readonly phases: readonly string[];
  readonly unexplained: Unexplained;
  readonly decision: Decision;
  /** Interpretation the call rests on. */
  readonly basis: string;
  readonly minute: number;
};

export type Request = { readonly requestedMinute: number; readonly readyMinute: number };

export type SampleState = {
  readonly code: string;
  readonly revealed: readonly string[];
  readonly broadened: boolean;
  readonly mounts: readonly MountRecord[];
  readonly powderUsedG: number;
  readonly runs: readonly RunRecord[];
  readonly interpretations: readonly Interpretation[];
  readonly tga?: Request;
  readonly sem?: Request;
  readonly call?: Call;
};

export type LogEntry = { readonly minute: number; readonly minutes: number; readonly kind: Action['type']; readonly code?: string };

export type LabState = {
  readonly seed: string;
  readonly minute: number;
  readonly samples: readonly SampleState[];
  /** Goniometer zero measured on the line-position standard, once checked. */
  readonly zeroDeg?: number;
  readonly log: readonly LogEntry[];
};

export type MountChoice = { readonly aliquot: 'same' | 'new'; readonly method: MountRecord['method']; readonly grind: Grind; readonly spike: SpikeKind; readonly spin: boolean };

export type Action =
  | { readonly type: 'inspect'; readonly code: string; readonly cue: string }
  | { readonly type: 'broaden'; readonly code: string; readonly on: boolean }
  | { readonly type: 'mount'; readonly code: string; readonly choice: MountChoice }
  | { readonly type: 'scan'; readonly code: string; readonly program: ProgramId; readonly centreDeg?: number }
  | { readonly type: 'interpret'; readonly code: string; readonly runId: string; readonly candidates: readonly string[]; readonly standard?: boolean; readonly zero?: boolean }
  | { readonly type: 'standard' }
  | { readonly type: 'tga'; readonly code: string }
  | { readonly type: 'sem'; readonly code: string }
  | { readonly type: 'wait'; readonly minutes: number }
  | { readonly type: 'call'; readonly code: string; readonly phases: readonly string[]; readonly unexplained: Unexplained; readonly decision: Decision; readonly basis: string };

export type LabError =
  | 'unknown-sample'
  | 'committed'
  | 'no-time'
  | 'no-powder'
  | 'no-capacity'
  | 'already-requested'
  | 'cannot-ungrind'
  | 'cannot-unspike'
  | 'unknown-run'
  | 'unknown-interpretation'
  | 'no-candidates'
  | 'not-in-library'
  | 'no-spike'
  | 'no-standard'
  | 'not-in-basis'
  | 'invalid';

export type Cost = { readonly minutes: number; readonly powderG: number };
/** A successful action returns the new state and, for scans and interpretations, the id of the record it produced or matched. */
export type Outcome = { readonly ok: true; readonly state: LabState; readonly id?: string } | { readonly ok: false; readonly error: LabError };

export function createLab(seed: string, codes: readonly string[]): LabState {
  return {
    seed,
    minute: 0,
    samples: codes.map((code) => {
      const { queueMount } = sampleCase(code);
      return { code, revealed: [], broadened: false, mounts: [{ index: 1, aliquot: 1, ...queueMount, preparedBy: 'queue' }], powderUsedG: POWDER_G[queueMount.method], runs: [], interpretations: [] };
    }),
    log: [],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Selectors

export function sampleState(state: LabState, code: string): SampleState | undefined {
  return state.samples.find((sample) => sample.code === code);
}

export function currentMount(sample: SampleState): MountRecord {
  return sample.mounts[sample.mounts.length - 1];
}

export function powderLeftG(state: LabState, code: string) {
  const sample = sampleState(state, code);
  return sample ? Math.max(0, sampleCase(code).powderG - sample.powderUsedG) : 0;
}

export function slotsLeft(state: LabState, kind: 'tga' | 'sem') {
  return CAPACITY[kind] - state.samples.filter((sample) => sample[kind]).length;
}

const hiddenKey = (state: LabState, code: string) => `${state.seed}/${code}`;

function instrumentOf(seed: string): InstrumentState {
  const random = createRandom(hashSeed('instrument', seed));
  return { zeroShiftDeg: Math.max(-0.03, Math.min(0.03, 0.012 * random.normal())) };
}

export type FollowUp<T> = { readonly status: 'none' } | { readonly status: 'running'; readonly readyMinute: number } | { readonly status: 'ready'; readonly readyMinute: number; readonly result: T };

export function tgaStatus(state: LabState, code: string, minute = state.minute): FollowUp<TgaResult> {
  const request = sampleState(state, code)?.tga;
  if (!request) return { status: 'none' };
  if (minute < request.readyMinute) return { status: 'running', readyMinute: request.readyMinute };
  const source = sampleCase(code);
  return { status: 'ready', readyMinute: request.readyMinute, result: runTga(specimenFor(source), hiddenKey(state, code), source.history.storage.relativeHumidity) };
}

export function semStatus(state: LabState, code: string, minute = state.minute): FollowUp<SemEdsResult> {
  const request = sampleState(state, code)?.sem;
  if (!request) return { status: 'none' };
  if (minute < request.readyMinute) return { status: 'running', readyMinute: request.readyMinute };
  return { status: 'ready', readyMinute: request.readyMinute, result: runSemEds(specimenFor(sampleCase(code)), hiddenKey(state, code)) };
}

/** Elements the notebook supports: the record, revealed notes, and EDS once it has returned. */
export function evidenceFor(state: LabState, code: string, minute = state.minute): ElementEvidence[] {
  const sample = sampleState(state, code);
  if (!sample) return [];
  const source = sampleCase(code);
  const evidence: ElementEvidence[] = source.record.elements.map((element) => ({ element, source: 'record' as const }));
  for (const cue of source.cues) if (sample.revealed.includes(cue.id)) for (const element of cue.elements ?? []) evidence.push({ element, source: 'notebook' });
  const sem = semStatus(state, code, minute);
  if (sem.status === 'ready') for (const element of edsElements(sem.result)) evidence.push({ element, source: 'eds' });
  return evidence;
}

/** Library phases the search offers for a sample right now, plus any spike the analyst added to one of its mounts. */
export function libraryFor(state: LabState, code: string): string[] {
  const sample = sampleState(state, code);
  const library = candidateLibrary(evidenceFor(state, code), sample?.broadened ?? false);
  const spikes = (sample?.mounts ?? []).map((mount) => mount.spike).filter((spike) => spike !== 'none' && !library.includes(spike));
  return [...library, ...new Set(spikes)];
}

const analyses = new WeakMap<Uint32Array, Map<string, AnalysisResult>>();

function analysisCache(run: RunRecord) {
  let cache = analyses.get(run.counts);
  if (!cache) {
    cache = new Map();
    analyses.set(run.counts, cache);
  }
  return cache;
}

const analysisKey = (options: AnalysisOptions) => JSON.stringify([[...options.candidates].sort(), options.internalStandard ?? '', options.zeroDeg ?? null]);

/** The stored analysis of this run with these references, if one has been computed. */
export function cachedAnalysis(run: RunRecord, options: AnalysisOptions): AnalysisResult | undefined {
  return analyses.get(run.counts)?.get(analysisKey(options));
}

/** Stores an analysis computed elsewhere, such as in a worker, so selectors read it without refitting. */
export function primeAnalysis(run: RunRecord, options: AnalysisOptions, result: AnalysisResult) {
  analysisCache(run).set(analysisKey(options), result);
}

/** Analysis of one run; it reads the counts and the chosen references only, and is cached per run. */
export function analysisOf(run: RunRecord, options: AnalysisOptions): AnalysisResult {
  const cache = analysisCache(run);
  const key = analysisKey(options);
  let result = cache.get(key);
  if (!result) {
    result = analyzePattern(run, options);
    cache.set(key, result);
  }
  return result;
}

export function interpretationResult(state: LabState, code: string, id: string): AnalysisResult | undefined {
  const sample = sampleState(state, code);
  const interpretation = sample?.interpretations.find((item) => item.id === id);
  const run = interpretation && sample?.runs.find((item) => item.id === interpretation.runId);
  return interpretation && run ? analysisOf(run, interpretationOptions(interpretation)) : undefined;
}

/** How explanation b describes its scan relative to explanation a; undefined unless both read the same run. */
export function compareInterpretations(state: LabState, code: string, a: string, b: string): Comparison | undefined {
  const sample = sampleState(state, code);
  const first = sample?.interpretations.find((item) => item.id === a);
  const second = sample?.interpretations.find((item) => item.id === b);
  if (!first || !second || first.runId !== second.runId) return undefined;
  const left = interpretationResult(state, code, a);
  const right = interpretationResult(state, code, b);
  return left && right ? compareExplanations(left, right) : undefined;
}

export type Limitation = 'counts' | 'sampling' | 'grains' | 'unexplained' | 'position' | 'broad' | 'missing-lines' | 'overlap';

/** What this explanation of this scan cannot settle, read from observations only. */
export function limitations(result: AnalysisResult): Limitation[] {
  const found = new Set<Limitation>();
  if (result.peakCounts < 3000) found.add('counts');
  if (result.warnings.includes('undersampled')) found.add('sampling');
  for (const feature of result.features) found.add(feature.kind === 'intensity' ? 'grains' : feature.kind);
  for (const phase of result.phases) {
    if (phase.missing.length >= 2) found.add('missing-lines');
    if (phase.status === 'overlapped' || phase.indistinguishableFrom.length > 0) found.add('overlap');
  }
  return [...found];
}

// ---------------------------------------------------------------------------------------------------------------
// Actions

function withinShift(state: LabState, cost: Cost): Cost | LabError {
  return state.minute + cost.minutes > SHIFT_MINUTES ? 'no-time' : cost;
}

function mountCost(sample: SampleState, choice: MountChoice): Cost | LabError {
  const spin = choice.spin ? COSTS.spin : 0;
  if (choice.aliquot === 'new') {
    return { minutes: COSTS.mount[choice.method] + COSTS.grind[choice.grind] + (choice.spike === 'none' ? 0 : COSTS.spike) + spin, powderG: POWDER_G[choice.method] };
  }
  const current = currentMount(sample);
  if (GRIND_ORDER[choice.grind] < GRIND_ORDER[current.grind]) return 'cannot-ungrind';
  if (current.spike !== 'none' && choice.spike !== current.spike) return 'cannot-unspike';
  return {
    minutes: COSTS.mount[choice.method] + COSTS.grind[choice.grind] - COSTS.grind[current.grind] + (choice.spike === current.spike ? 0 : COSTS.spike) + spin,
    powderG: Math.max(0, POWDER_G[choice.method] - POWDER_G[current.method]),
  };
}

function nextMount(sample: SampleState, choice: MountChoice): MountRecord {
  const current = currentMount(sample);
  const same = choice.aliquot === 'same';
  const aliquot = same ? current.aliquot : Math.max(...sample.mounts.map((mount) => mount.aliquot)) + 1;
  const spikeFraction = choice.spike === 'none' ? 0 : same && current.spike === choice.spike ? current.spikeFraction : SPIKE_FRACTION;
  return { index: sample.mounts.length + 1, aliquot, method: choice.method, grind: choice.grind, spike: choice.spike, spikeFraction, spin: choice.spin, preparedBy: 'you' };
}

/** Minutes and powder an action would cost now, or why it cannot be done. */
export function costOf(state: LabState, action: Action): Cost | LabError {
  if (action.type === 'standard') return withinShift(state, { minutes: COSTS.standard, powderG: 0 });
  if (action.type === 'wait') return Number.isFinite(action.minutes) && action.minutes >= 1 ? withinShift(state, { minutes: Math.round(action.minutes), powderG: 0 }) : 'invalid';
  const sample = sampleState(state, action.code);
  if (!sample) return 'unknown-sample';
  if (sample.call) return 'committed';
  const source = sampleCase(action.code);
  const fits = (cost: Cost | LabError): Cost | LabError => {
    if (typeof cost === 'string') return cost;
    return sample.powderUsedG + cost.powderG > source.powderG + 1e-9 ? 'no-powder' : withinShift(state, cost);
  };
  switch (action.type) {
    case 'inspect':
      if (!source.cues.some((cue) => cue.id === action.cue)) return 'invalid';
      return fits({ minutes: sample.revealed.includes(action.cue) ? 0 : COSTS.inspect, powderG: 0 });
    case 'broaden':
      return { minutes: 0, powderG: 0 };
    case 'mount':
      return fits(mountCost(sample, action.choice));
    case 'scan':
      return fits({ minutes: acquisitionFor(action.program, action.centreDeg).minutes + COSTS.scanHandling, powderG: 0 });
    case 'interpret': {
      const run = sample.runs.find((item) => item.id === action.runId);
      if (!run) return 'unknown-run';
      if (action.candidates.length === 0) return 'no-candidates';
      const library = libraryFor(state, action.code);
      if (!action.candidates.every((id) => library.includes(id))) return 'not-in-library';
      if (action.standard && run.mount.spike === 'none') return 'no-spike';
      if (action.zero && state.zeroDeg === undefined) return 'no-standard';
      return { minutes: 0, powderG: 0 };
    }
    case 'tga':
    case 'sem': {
      if (sample[action.type]) return 'already-requested';
      if (slotsLeft(state, action.type) <= 0) return 'no-capacity';
      const { handling, duration } = COSTS[action.type];
      if (state.minute + handling + duration > SHIFT_MINUTES) return 'no-time';
      return fits({ minutes: handling, powderG: POWDER_G[action.type] });
    }
    case 'call': {
      const basis = sample.interpretations.find((item) => item.id === action.basis);
      if (!basis) return 'unknown-interpretation';
      if (!DECISIONS.includes(action.decision)) return 'invalid';
      if (action.phases.length === 0 || !action.phases.every((id) => basis.candidates.includes(id) && id !== basis.internalStandard)) return 'not-in-basis';
      return { minutes: 0, powderG: 0 };
    }
  }
}

export function apply(state: LabState, action: Action): Outcome {
  const cost = costOf(state, action);
  if (typeof cost === 'string') return { ok: false, error: cost };
  const minute = state.minute + cost.minutes;
  const code = 'code' in action ? action.code : undefined;
  const log = cost.minutes > 0 || action.type === 'call' ? [...state.log, { minute: state.minute, minutes: cost.minutes, kind: action.type, ...(code ? { code } : {}) }] : state.log;
  const done = (samples: readonly SampleState[], id?: string, zeroDeg = state.zeroDeg): Outcome => ({
    ok: true,
    state: { ...state, minute, samples, log, ...(zeroDeg === undefined ? {} : { zeroDeg }) },
    ...(id ? { id } : {}),
  });

  if (action.type === 'standard') {
    const random = createRandom(hashSeed('standard', state.seed, state.log.filter((entry) => entry.kind === 'standard').length));
    return done(state.samples, undefined, Math.round(1e4 * (instrumentOf(state.seed).zeroShiftDeg + 0.002 * random.normal())) / 1e4);
  }
  if (action.type === 'wait') return done(state.samples);
  const sample = sampleState(state, action.code);
  if (!sample) return { ok: false, error: 'unknown-sample' };
  const update = (change: (item: SampleState) => SampleState) => state.samples.map((item) => (item.code === sample.code ? change(item) : item));

  switch (action.type) {
    case 'inspect':
      return done(update((item) => (item.revealed.includes(action.cue) ? item : { ...item, revealed: [...item.revealed, action.cue] })));
    case 'broaden':
      return done(update((item) => ({ ...item, broadened: action.on })));
    case 'mount': {
      const mount = nextMount(sample, action.choice);
      return done(update((item) => ({ ...item, mounts: [...item.mounts, mount], powderUsedG: item.powderUsedG + cost.powderG })));
    }
    case 'scan': {
      const mount = currentMount(sample);
      const acquisition = acquisitionFor(action.program, action.centreDeg);
      const prepared = prepareMount(specimenFor(sampleCase(sample.code)), hiddenKey(state, sample.code), mount);
      const index = sample.runs.length + 1;
      const measurement = measure(prepared, acquisition, instrumentOf(state.seed), index);
      const run = createRun(sample.code, index, mount, acquisition, state.minute, measurement.grid, measurement.counts);
      return done(update((item) => ({ ...item, runs: [...item.runs, run] })), run.id);
    }
    case 'interpret': {
      const run = sample.runs.find((item) => item.id === action.runId);
      if (!run) return { ok: false, error: 'unknown-run' };
      const options: AnalysisOptions = {
        candidates: action.candidates,
        ...(action.standard && run.mount.spike !== 'none' ? { internalStandard: run.mount.spike } : {}),
        ...(action.zero ? { zeroDeg: state.zeroDeg } : {}),
      };
      const draft = createInterpretation(run, sample.interpretations.filter((item) => item.runId === run.id).length + 1, options, state.minute);
      const existing = sample.interpretations.find((item) => sameInterpretation(item, draft));
      if (existing) return done(state.samples, existing.id);
      return done(update((item) => ({ ...item, interpretations: [...item.interpretations, draft] })), draft.id);
    }
    case 'tga':
    case 'sem': {
      const request: Request = { requestedMinute: state.minute, readyMinute: state.minute + COSTS[action.type].handling + COSTS[action.type].duration };
      const powderUsedG = sample.powderUsedG + cost.powderG;
      return done(update((item) => (action.type === 'tga' ? { ...item, tga: request, powderUsedG } : { ...item, sem: request, powderUsedG })));
    }
    case 'call': {
      const call: Call = { phases: [...new Set(action.phases)].sort(), unexplained: action.unexplained, decision: action.decision, basis: action.basis, minute: state.minute };
      return done(update((item) => ({ ...item, call })));
    }
  }
}

/** Rebuilds a shift from its seed and actions; actions that fail are skipped, exactly as they were when first tried. */
export function replay(seed: string, codes: readonly string[], actions: readonly Action[]): LabState {
  return actions.reduce((state, action) => {
    const outcome = apply(state, action);
    return outcome.ok ? outcome.state : state;
  }, createLab(seed, codes));
}

// ---------------------------------------------------------------------------------------------------------------
// Debrief

export type Grade = 'good' | 'mixed' | 'poor';
export type DebriefRowId = 'measurement' | 'support' | 'identity' | 'decision';
export type DebriefRow = { readonly id: DebriefRowId; readonly grade: Grade; readonly notes: readonly string[] };
export type TruthBand = 'major' | 'minor' | 'trace';
export type TruthPhase = { readonly id: string; readonly band: TruthBand; readonly claimed: boolean; readonly inLibrary: boolean };

export type Debrief = {
  readonly code: string;
  readonly minutes: number;
  readonly scans: number;
  readonly followUps: number;
  /** Crystalline phases in the powder, in bands rather than percentages. */
  readonly truth: readonly TruthPhase[];
  /** Whether the batch as made met its objective. */
  readonly objectiveMet: boolean;
  /** Batch decisions that would have met the objective, cheapest first. */
  readonly fixes: readonly Decision[];
  readonly rows: readonly DebriefRow[];
};

/** Reportable phases in a qualitative call. */
export const REPORTABLE = 0.005;
const TRACE = 0.001;
const MINOR = 0.02;
/** Illustrative identification threshold used by the sim, in counts on the strongest peak. */
const IDENTIFY_COUNTS = 3000;
/** Features are flagged from z 4, which counting noise reaches about once in twenty scans; from z 5 it almost never does. */
const ROBUST_Z = 5;
const FRESH_STORAGE = { hours: 24, relativeHumidity: 35 } as const;
const MOLAR_MASS = { CaCO3: 100.087, TiO2: 79.866, ZrO2: 123.218 } as const;

type Note = { readonly grade: Grade; readonly text: string };
const RANK: Readonly<Record<Grade, number>> = { good: 0, mixed: 1, poor: 2 };

function row(id: DebriefRowId, notes: readonly Note[], fallback: string): DebriefRow {
  if (notes.length === 0) return { id, grade: 'good', notes: [fallback] };
  const sorted = [...notes].sort((a, b) => RANK[b.grade] - RANK[a.grade]);
  return { id, grade: sorted[0].grade, notes: sorted.slice(0, 3).map((note) => note.text) };
}

const formula = (id: string) => catalogPhase(id).reference.formula;
const degrees = (value: number) => `${value.toFixed(1)}°`;

/** The batch after a decision, replayed through the same forward model that made it. */
export function afterDecision(history: SynthesisHistory, decision: Decision): SynthesisHistory {
  const { calcination } = history;
  const refire = (regrinds: number): SynthesisHistory => ({
    ...history,
    calcination: { temperatureC: Math.max(calcination.temperatureC, 1250), hours: calcination.hours + 12, regrinds: calcination.regrinds + regrinds, bed: 'open' },
    storage: FRESH_STORAGE,
  });
  switch (decision) {
    case 'recalcine':
      return refire(0);
    case 'regrind-recalcine':
      return refire(1);
    case 'adjust-stoichiometry': {
      const moles = (material: 'TiO2' | 'ZrO2') => history.precursors.filter((item) => item.material === material).reduce((sum, item) => sum + item.massG, 0) / MOLAR_MASS[material];
      const carbonate = { material: 'CaCO3' as const, massG: (moles('TiO2') + moles('ZrO2')) * MOLAR_MASS.CaCO3 };
      return { ...history, precursors: [carbonate, ...history.precursors.filter((item) => item.material !== 'CaCO3')], carbonateMoisture: 0, storage: FRESH_STORAGE };
    }
    case 'change-media':
      return history.milling ? { ...history, milling: { ...history.milling, media: 'agate' }, storage: FRESH_STORAGE } : history;
    default:
      return history;
  }
}

export function meetsObjective(phases: readonly PhaseAmount[], objective: Objective) {
  const total = phases.reduce((sum, phase) => sum + phase.weightFraction, 0);
  if (total <= 0) return false;
  const target = phases.filter((phase) => objective.targets.includes(phase.structureId)).reduce((sum, phase) => sum + phase.weightFraction, 0) / total;
  const others = phases.every((phase) => objective.targets.includes(phase.structureId) || phase.weightFraction / total < REPORTABLE);
  if (target < 0.99 || !others) return false;
  if (objective.zrMolPercent === undefined) return true;
  const host = phases.find((phase) => phase.structureId === objective.targets[0]);
  return host !== undefined && Math.abs((host.latticeScale - 1) / ZR_LATTICE_PER_MOL_PERCENT - objective.zrMolPercent) <= 1;
}

function band(fraction: number): TruthBand {
  if (fraction > 0.2) return 'major';
  return fraction >= MINOR ? 'minor' : 'trace';
}

const FOLLOW_UP_LABELS = { tga: 'TGA', sem: 'SEM/EDS' } as const;

/** Earlier full-range runs, which the debrief re-reads to see whether one already settled the call. */
function earlierChecks(sample: SampleState, run: RunRecord) {
  return sample.runs.filter((candidate) => candidate.index < run.index && candidate.acquisition.program !== 'targeted');
}

/** The basis references applied to another run; a spike that run does not carry is dropped. */
function checkOptions(basis: Interpretation, candidate: RunRecord): AnalysisOptions {
  const options = interpretationOptions(basis);
  return basis.internalStandard === candidate.mount.spike ? options : { ...options, internalStandard: undefined };
}

/** Every analysis the debrief reads, so an interface can compute them off the main thread before asking for it. */
export function debriefAnalyses(state: LabState, code: string): { readonly run: RunRecord; readonly options: AnalysisOptions }[] {
  const sample = sampleState(state, code);
  const call = sample?.call;
  const basis = call && sample.interpretations.find((item) => item.id === call.basis);
  const run = basis && sample.runs.find((item) => item.id === basis.runId);
  if (!sample || !basis || !run) return [];
  return [{ run, options: interpretationOptions(basis) }, ...earlierChecks(sample, run).map((candidate) => ({ run: candidate, options: checkOptions(basis, candidate) }))];
}

export function debrief(state: LabState, code: string): Debrief | undefined {
  const sample = sampleState(state, code);
  const call = sample?.call;
  const basis = call && sample.interpretations.find((item) => item.id === call.basis);
  const run = basis && sample.runs.find((item) => item.id === basis.runId);
  if (!sample || !call || !basis || !run) return undefined;
  const source = sampleCase(code);
  const result = analysisOf(run, interpretationOptions(basis));

  // Measurement: judged on the observations the call rests on.
  const measurement: Note[] = [];
  if (result.peakCounts < 1000) measurement.push({ grade: 'poor', text: 'Strongest peak under 1000 counts' });
  else if (result.peakCounts < IDENTIFY_COUNTS) measurement.push({ grade: 'mixed', text: 'Strongest peak under 3000 counts' });
  // A phase the fit is missing distorts intensities too, so the cause is only named when nothing is left unexplained.
  if (result.features.some((feature) => feature.kind === 'intensity')) {
    const unexplained = result.features.some((feature) => feature.kind === 'unexplained');
    measurement.push({ grade: 'mixed', text: unexplained ? 'Intensities still off' : 'Intensity misfit left: grains or orientation' });
  }
  if (result.warnings.includes('undersampled')) measurement.push({ grade: 'mixed', text: 'Steps too coarse for the peak width' });
  const settles = (candidate: RunRecord) => {
    const options = checkOptions(basis, candidate);
    const check = analysisOf(candidate, options);
    // A refined zero trades against the cell, so a run cannot settle a solid-solution aim without a checked zero or a spike.
    if (source.record.objective.zrMolPercent !== undefined && check.zeroRefined && !options.internalStandard) return false;
    return check.peakCounts >= IDENTIFY_COUNTS && !check.warnings.includes('undersampled') && check.features.length === 0 && call.phases.every((id) => check.phases.some((phase) => phase.id === id && phase.status === 'required'));
  };
  const settled = earlierChecks(sample, run).find(settles);
  if (settled) measurement.push({ grade: 'mixed', text: `R${settled.index} already settled it; later scans only used up the shift` });
  const requested = (['tga', 'sem'] as const).filter((kind) => sample[kind]);
  const pending = requested.filter((kind) => (sample[kind]?.readyMinute ?? 0) > call.minute);
  if (pending.length > 0) measurement.push({ grade: 'mixed', text: `${pending.map((kind) => FOLLOW_UP_LABELS[kind]).join(' + ')} still running at the call` });
  const noted = new Set([...source.record.elements, ...source.cues.filter((cue) => sample.revealed.includes(cue.id)).flatMap((cue) => cue.elements ?? [])]);
  const tga = tgaStatus(state, code, call.minute);
  const sem = semStatus(state, code, call.minute);
  const informative = (tga.status === 'ready' && tga.result.steps.some((step) => step.fromC >= 200 && step.lossPercent >= 0.3)) || (sem.status === 'ready' && edsElements(sem.result).some((element) => !noted.has(element)));
  if (requested.length === 2 && pending.length === 0 && !informative) measurement.push({ grade: 'mixed', text: 'TGA and SEM/EDS added nothing new' });

  // Support: judged on the basis interpretation and the chemistry known at the call.
  const support: Note[] = [];
  const evidence = evidenceFor(state, code, call.minute);
  for (const id of call.phases) {
    const fit = result.phases.find((phase) => phase.id === id);
    if (!fit || fit.status === 'not-detected' || fit.status === 'not-required') support.push({ grade: 'poor', text: `${formula(id)} not required by the fit` });
    else {
      if (fit.status === 'overlapped') support.push({ grade: 'mixed', text: `${formula(id)} has no lines of its own` });
      else if (fit.detected.length < 2) support.push({ grade: 'mixed', text: `${formula(id)} rests on one line` });
      if (fit.missing.length >= 2) support.push({ grade: 'poor', text: `${formula(id)}: ${fit.missing.length} predicted lines absent` });
      const uncompared = fit.indistinguishableFrom.filter((other) => !sample.interpretations.some((item) => item.runId === basis.runId && item.candidates.includes(other)));
      if (uncompared.length > 0) support.push({ grade: 'mixed', text: `Not compared with ${uncompared.map(formula).join(', ')}` });
    }
    const chemistry = chemicalSupport(id, evidence);
    if (!chemistry.supported) support.push({ grade: 'poor', text: `Nothing on record for ${chemistry.unsupported.join(', ')}` });
  }
  const unexplained = result.features.filter((feature) => feature.kind === 'unexplained');
  const robust = unexplained.some((feature) => Math.abs(feature.z) >= ROBUST_Z);
  if (unexplained.length > 0 && call.unexplained === 'none') support.push({ grade: robust ? 'poor' : 'mixed', text: `Unexplained at ${unexplained.slice(0, 3).map((feature) => degrees(feature.centreDeg)).join(', ')}` });
  const missingLines = result.phases.some((phase) => call.phases.includes(phase.id) && phase.missing.length >= 2);
  if (call.unexplained === 'reference' && unexplained.length === 0 && !missingLines) support.push({ grade: 'mixed', text: 'Nothing unexplained to hold for' });
  if (call.unexplained === 'measurement' && result.features.length === 0 && result.peakCounts >= IDENTIFY_COUNTS) support.push({ grade: 'mixed', text: 'The scan was adequate' });
  const unclaimed = result.phases.filter((phase) => phase.status === 'required' && phase.id !== basis.internalStandard && !call.phases.includes(phase.id));
  if (unclaimed.length > 0) support.push({ grade: 'mixed', text: `${unclaimed.map((phase) => formula(phase.id)).join(', ')} required but not claimed` });

  // Identity: the powder itself, revealed now that the call is committed.
  const amounts = synthesize(source.history);
  const total = amounts.reduce((sum, phase) => sum + phase.weightFraction, 0);
  const share = (id: string) => amounts.filter((phase) => phase.structureId === id).reduce((sum, phase) => sum + phase.weightFraction, 0) / total;
  const truth = amounts
    .filter((phase) => phase.weightFraction / total >= TRACE)
    .sort((a, b) => b.weightFraction - a.weightFraction)
    .map((phase) => ({ id: phase.structureId, band: band(phase.weightFraction / total), claimed: call.phases.includes(phase.structureId), inLibrary: catalogPhase(phase.structureId).inLibrary }));
  const identity: Note[] = [];
  for (const id of call.phases) if (share(id) < TRACE) identity.push({ grade: 'poor', text: `${formula(id)} was not in the powder` });
  const missed = amounts.filter((phase) => phase.weightFraction / total >= REPORTABLE && !call.phases.includes(phase.structureId));
  for (const phase of missed) {
    const name = formula(phase.structureId);
    const minor = phase.weightFraction / total >= MINOR;
    if (!catalogPhase(phase.structureId).inLibrary) {
      if (call.unexplained === 'reference') identity.push({ grade: 'good', text: `${name} had no reference: flagging it was right` });
      else if (call.unexplained === 'measurement') identity.push({ grade: 'mixed', text: `${name} needed a reference, not more data` });
      else identity.push({ grade: minor ? 'poor' : 'mixed', text: `Missed ${name}, which has no reference` });
    } else if (call.unexplained === 'reference') identity.push({ grade: 'mixed', text: `${name} was in the full library` });
    else if (call.unexplained === 'none' || minor) identity.push({ grade: minor ? 'poor' : 'mixed', text: `Missed ${name}` });
  }
  if (call.unexplained !== 'none' && missed.length === 0) identity.push({ grade: 'mixed', text: 'Every reportable phase could be claimed' });

  // Decision: each batch decision replayed through the forward model.
  const objective = source.record.objective;
  const meets = (decision: Decision) => meetsObjective(synthesize(afterDecision(source.history, decision)), objective);
  const fixes = (Object.keys(DECISION_TIER) as BatchDecision[]).filter(meets).sort((a, b) => DECISION_TIER[a] - DECISION_TIER[b]);
  const decision: Note[] = [];
  const holdJustified = missed.some((phase) => !catalogPhase(phase.structureId).inLibrary);
  if (call.decision === 'hold-reference') {
    if (holdJustified) {
      decision.push({ grade: 'good', text: 'Holding for a reference was justified' });
      if (fixes.length > 0) decision.push({ grade: 'good', text: `Once identified, ${DECISION_LABELS[fixes[0]]} meets the objective` });
    }
    else decision.push({ grade: 'mixed', text: fixes.length > 0 ? `${DECISION_LABELS[fixes[0]]} would have settled it` : 'Nothing needed a new reference' });
  } else if (!meets(call.decision)) {
    decision.push({ grade: 'poor', text: fixes.length > 0 ? `Misses the objective; ${DECISION_LABELS[fixes[0]]} meets it` : 'Misses the objective' });
  } else if (fixes.length > 0 && DECISION_TIER[call.decision] > DECISION_TIER[fixes[0] as BatchDecision]) {
    decision.push({ grade: 'mixed', text: `${DECISION_LABELS[fixes[0]]} would also meet it` });
  }

  const minutes = state.log.filter((entry) => entry.code === code).reduce((sum, entry) => sum + entry.minutes, 0);
  return {
    code,
    minutes,
    scans: sample.runs.length,
    followUps: requested.length,
    truth,
    objectiveMet: meets('release'),
    fixes,
    rows: [
      row('measurement', measurement, 'Counts and fit adequate for the call'),
      row('support', support, 'Every claim rests on required lines'),
      row('identity', identity, 'Claims match the powder'),
      row('decision', decision, 'Cheapest decision that meets the objective'),
    ],
  };
}
