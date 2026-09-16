'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useModalFocusTrap } from './mission-ui';
import {
  ARIA,
  ARTEFACT_WORD,
  BAND_LABEL,
  COMPARISON_WORD,
  DATA_LIMITS,
  ERROR_WORD,
  FEATURE_WORD,
  GRADE_WORD,
  GRIND_LABEL,
  LIMIT_COPY,
  METHOD_LABEL,
  PROGRAM_LABEL,
  PROGRAM_ORDER,
  ROW_LABEL,
  SAMPLE_STATUS,
  SHEET_LABEL,
  SOURCE_WORD,
  SPIKE_LABEL,
  STATUS_WORD,
  SWEEP_MS,
  TEST_LABEL,
  UNEXPLAINED_LABEL,
  WORD,
  debriefCounts,
  formatCounts,
  mountTag,
  phaseLabel,
  unsupportedLine,
} from './xrd-bench/copy';
import { dispatch, newShift, saveSlots, savedSlots, seat, seatedMount, useAnalysesReady, useAnalysis, useLab } from './xrd-bench/session';
import { overlayScale, probeGroups, probeZ, runCentre, runCovers, runTag, sampleStatus } from './xrd-bench/view';
import { PatternPlot, phaseColor, type PlotOverlay, type PlotRange, type PlotTicks } from './xrd-plot';
import { compareExplanations, type AnalysisResult, type Comparison } from './xrd/analysis';
import { ensureAnalysis } from './xrd/analysis-client';
import { CASE_CODES, sampleCase } from './xrd/cases';
import { chemicalSupport, type ElementEvidence } from './xrd/context';
import {
  CAPACITY,
  COSTS,
  DECISIONS,
  DECISION_LABELS,
  SHIFT_MINUTES,
  cachedAnalysis,
  costOf,
  currentMount,
  debrief,
  debriefAnalyses,
  evidenceFor,
  libraryFor,
  limitations,
  powderLeftG,
  sampleState,
  semStatus,
  slotsLeft,
  tgaStatus,
  type Action,
  type Debrief,
  type Decision,
  type FollowUp,
  type Grade,
  type LabState,
  type Limitation,
  type MountChoice,
  type SampleState,
  type Unexplained,
} from './xrd/lab';
import { acquisitionFor, type Grind, type ProgramId, type SpikeKind } from './xrd/measure';
import { LIBRARY_PHASE_IDS } from './xrd/phases';
import { referenceLines } from './xrd/probe';
import { interpretationOptions, sameInterpretation, type Interpretation, type RunRecord } from './xrd/records';
import './xrd-bench.css';

export type XrdBenchStage = 'idle' | 'open' | 'loaded' | 'closed' | 'scanning' | 'review' | 'complete';

export type XrdRunContext = {
  readonly sampleId: string;
  readonly sampleName: string;
  readonly prep: string;
  readonly scan: string;
  readonly scanMinutes: number;
  readonly runNumber: number;
};

export type XrdRunResult = XrdRunContext & {
  readonly phases: readonly string[];
  readonly decision: string;
  /** The SUPPORT row was not graded poor. */
  readonly supported: boolean;
  /** The call left signal unexplained or held the batch for a reference. */
  readonly uncertain: boolean;
  readonly summary: string;
};

type SlotId = 'A' | 'B';
type Slots = Readonly<Record<SlotId, readonly string[]>>;
type Sheet = 'data' | 'support' | 'aim' | 'decide';
type CallDraft = { readonly basis?: SlotId; readonly phases: readonly string[]; readonly unexplained?: Unexplained; readonly decision?: Decision };
type Sweep = { readonly runId: string; readonly start: number; readonly ms: number; readonly startDeg: number; readonly endDeg: number };
type DataTab = 'scan' | 'prep' | 'runs';
type SupportTab = 'limits' | 'refs' | 'tests';
type SlotFits = Readonly<Record<SlotId, string | undefined>>;
/** Whether the next fits apply the mount's spike as internal standard and the checked goniometer zero. */
type Use = { readonly spike: boolean; readonly zero: boolean };
/** A sample's A and B chips and the fit flags they were fitted with. */
type Held = { readonly slots: Slots; readonly use: Use };
type Step = readonly [number, XrdBenchStage];
type Pending = { readonly stage: XrdBenchStage; readonly context: XrdRunContext; readonly onEnd?: () => void };
/** Minutes and grams a hovered, pressed or focused control would spend, valid only for the state it was read from. */
type CostGhost = { readonly at: LabState; readonly minutes: number; readonly powderG: number };
type CostHandlers = {
  readonly onPointerEnter: () => void;
  readonly onPointerDown: () => void;
  readonly onFocus: () => void;
  readonly onPointerLeave: () => void;
  readonly onPointerCancel: () => void;
  readonly onBlur: () => void;
};
type OnCost = (action?: Action) => CostHandlers;

const MAX_CHIPS = 4;
const EMPTY_CALL: CallDraft = { phases: [] };
const NO_FITS: SlotFits = { A: undefined, B: undefined };
const NO_USE: Use = { spike: false, zero: false };
const HOLD_MS = 700;
const REVIEW_MS = 600;
const DOOR_MS = 1400;
/** Enclosure opens, the holder is seated, the enclosure closes. */
const DOOR: readonly Step[] = [[0, 'open'], [700, 'loaded'], [DOOR_MS, 'closed']];
/** Below the cheapest scan the shift is over for measurements; fits, references and calls cost nothing. */
const SHIFT_OVER_MIN = Math.min(...PROGRAM_ORDER.map((id) => acquisitionFor(id).minutes)) + COSTS.scanHandling;
/** Targeted centres whose window the goniometer limits never cut, so a targeted run's midpoint is the centre asked for. */
const TARGET_LIMITS = (() => {
  const { startDeg, endDeg } = acquisitionFor('targeted', 60).range;
  const half = (endDeg - startDeg) / 2;
  return { min: acquisitionFor('targeted', -1e3).range.startDeg + half, max: acquisitionFor('targeted', 1e3).range.endDeg - half };
})();
const targetCentre = (deg: number) => Math.min(TARGET_LIMITS.max, Math.max(TARGET_LIMITS.min, deg));
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** What the bench remembers between openings. */
const memory = { code: CASE_CODES[0], held: new Map<string, Held>(), calls: new Map<string, CallDraft>(), unreported: new Set<string>() };

const degrees = (value: number, digits = 2) => `${value.toFixed(digits)}°`;
const flagWord = (words: readonly string[]) => (words.length === 0 ? WORD.noFlags : words.length === 1 ? words[0] : `${words.length} ${WORD.flags}`);
const reportKey = (state: LabState, code: string) => `${state.seed}/${code}`;
const clockShare = (minutes: number) => `${(100 * Math.max(0, minutes)) / SHIFT_MINUTES}%`;

function latestFits(sample: SampleState) {
  const latest = sample.runs[sample.runs.length - 1];
  return latest ? sample.interpretations.filter((item) => item.runId === latest.id) : [];
}

function initialSlots(sample: SampleState): Slots {
  const fits = latestFits(sample);
  const own = (item?: Interpretation) => (item ? item.candidates.filter((id) => id !== item.internalStandard) : []);
  return { A: own(fits[0]), B: own(fits[1]) };
}

function initialUse(sample: SampleState): Use {
  const first = latestFits(sample)[0];
  return first ? { spike: first.internalStandard !== undefined, zero: first.zeroDeg !== undefined } : NO_USE;
}

/** Slots saved in this shift, when every chip is still a phase this sample could be fitted with. */
function storedSlots(state: LabState, sample: SampleState): Held | undefined {
  const saved = savedSlots(state.seed, sample.code);
  if (!saved) return undefined;
  const known = new Set([...LIBRARY_PHASE_IDS, ...libraryFor(state, sample.code), ...sample.interpretations.flatMap((item) => item.candidates)]);
  const valid = (set: readonly string[]) => set.length <= MAX_CHIPS && new Set(set).size === set.length && set.every((id) => known.has(id));
  return valid(saved.A) && valid(saved.B) ? { slots: { A: saved.A, B: saved.B }, use: { spike: saved.spike, zero: saved.zero } } : undefined;
}

/** This visit's slots for the sample, then the slots saved before a reload, then its latest fits. */
function heldFor(state: LabState, sample: SampleState): Held {
  return memory.held.get(sample.code) ?? storedSlots(state, sample) ?? { slots: initialSlots(sample), use: initialUse(sample) };
}

function initialSheet(sample: SampleState): Sheet {
  return sample.call ? 'decide' : sample.runs.length > 0 ? 'support' : 'data';
}

function mountDraft(sample: SampleState): MountChoice {
  const mount = currentMount(sample);
  return { aliquot: 'same', method: mount.method, grind: mount.grind, spike: mount.spike, spin: mount.spin };
}

function slotDraft(state: LabState, run: RunRecord, set: readonly string[], use: Use) {
  const spike = use.spike && run.mount.spike !== 'none' ? run.mount.spike : undefined;
  const candidates = [...new Set([...set, ...(spike ? [spike] : [])])].sort();
  return { runId: run.id, candidates, internalStandard: spike, zeroDeg: use.zero ? state.zeroDeg : undefined };
}

function runContext(sample: SampleState, run?: RunRecord): XrdRunContext {
  return {
    sampleId: sample.code,
    sampleName: sampleCase(sample.code).record.title,
    prep: mountTag(run?.mount ?? currentMount(sample)),
    scan: PROGRAM_LABEL[run?.acquisition.program ?? 'survey'],
    scanMinutes: run?.acquisition.minutes ?? 0,
    runNumber: run?.index ?? 0,
  };
}

/** A run's number and program, `R5 TARGET`. */
const runShort = (run: RunRecord) => `R${run.index} ${PROGRAM_LABEL[run.acquisition.program]}`;

/** The run bar's name: `R1 SURVEY`, or `R5 TARGET 27.5°` as in the run tag. */
function runName(run: RunRecord) {
  return `${runShort(run)}${run.acquisition.program === 'targeted' ? ` ${degrees(runCentre(run), 1)}` : ''}`;
}

/** `SCAN 8 MIN`, `MOUNT 28 MIN · 0 G`, or the label with the error in place of the cost. */
function costText(state: LabState, action: Action, label: string, grams = false) {
  const cost = costOf(state, action);
  if (typeof cost === 'string') return { label: `${label} · ${ERROR_WORD[cost]}`, disabled: true };
  const parts = [cost.minutes > 0 || grams ? `${label} ${cost.minutes} ${WORD.min}` : label];
  if (grams || cost.powderG > 0) parts.push(`${Number(cost.powderG.toFixed(3))} ${WORD.g}`);
  return { label: parts.join(' · '), disabled: false };
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function XrdWorkbench({ onStage, onResult, onClose }: {
  readonly stage: XrdBenchStage;
  readonly result: XrdRunResult | null;
  readonly onStage: (stage: XrdBenchStage, context: XrdRunContext) => void;
  readonly onResult: (result: XrdRunResult) => void;
  readonly onClose: () => void;
}) {
  const dialogRef = useModalFocusTrap();
  const state = useLab();
  const [code, setCode] = useState(memory.code);
  const sample = sampleState(state, code) ?? state.samples[0];
  const source = sampleCase(sample.code);
  const [runChoice, setRunChoice] = useState<string>();
  const run = sample.runs.find((item) => item.id === runChoice) ?? sample.runs[sample.runs.length - 1];
  const [held, setHeld] = useState<Held>(() => heldFor(state, sample));
  const { slots, use } = held;
  const [active, setActive] = useState<SlotId>('A');
  const [chip, setChip] = useState<string>();
  const [probeDeg, setProbeDeg] = useState<number>();
  const [sheet, setSheet] = useState<Sheet>(() => initialSheet(sample));
  const [supportTab, setSupportTab] = useState<SupportTab>('limits');
  const [draft, setDraft] = useState<MountChoice>(() => mountDraft(sample));
  const [callDraft, setCallDraft] = useState<CallDraft>(() => memory.calls.get(sample.code) ?? EMPTY_CALL);
  const [focus, setFocus] = useState<PlotRange & { key: number }>();
  const [notice, setNotice] = useState<string>();
  const [sweep, setSweep] = useState<Sweep>();
  const [revealDeg, setRevealDeg] = useState<number>();
  const [dataTab, setDataTab] = useState<DataTab>('scan');
  const [program, setProgram] = useState<ProgramId>('survey');
  const [targetDeg, setTargetDeg] = useState<number>();
  const [ghost, setGhost] = useState<string>();
  const [overlayId, setOverlayId] = useState<string>();
  /** The interpretation each slot last fitted, set only when that slot's newest FIT finishes. */
  const [fitted, setFitted] = useState<SlotFits>(NO_FITS);
  /** The sample whose debrief is held behind REVIEWING while its analyses warm. */
  const [reviewing, setReviewing] = useState<string>();
  const [costGhost, setCostGhost] = useState<CostGhost>();
  const fitTokens = useRef<Record<SlotId, number>>({ A: 0, B: 0 });
  const timers = useRef<number[]>([]);
  /** The stage a running door or scan sequence ends on, emitted once if the sequence is cut short. */
  const pending = useRef<Pending | undefined>(undefined);

  useEffect(() => {
    const list = timers.current;
    return () => list.splice(0).forEach((id) => window.clearTimeout(id));
  }, []);
  const later = (ms: number, task: () => void) => {
    timers.current.push(window.setTimeout(task, ms));
  };
  /** Cancels the running sequence and emits the stage it would have ended on, once. */
  const settle = () => {
    timers.current.splice(0).forEach((id) => window.clearTimeout(id));
    const final = pending.current;
    pending.current = undefined;
    if (!final) return;
    final.onEnd?.();
    onStage(final.stage, final.context);
  };
  /** Emits each stage at its offset; the last one goes through settle, so a sequence ends exactly once. */
  const sequence = (context: XrdRunContext, steps: readonly Step[], onEnd?: () => void) => {
    settle();
    const last = steps.length - 1;
    pending.current = { stage: steps[last][1], context, onEnd };
    steps.forEach(([ms, next], index) => {
      const emit = index < last ? () => onStage(next, context) : settle;
      if (ms > 0) later(ms, emit);
      else emit();
    });
  };

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(undefined), 2400);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!sweep) return;
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, Math.max(0, (performance.now() - sweep.start) / Math.max(1, sweep.ms)));
      setRevealDeg(sweep.startDeg + t * (sweep.endDeg - sweep.startDeg));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sweep]);

  const evidence = evidenceFor(state, sample.code);
  const library = libraryFor(state, sample.code);
  /** The displayed run's spike, never offered as a phase. */
  const runSpike = run && run.mount.spike !== 'none' ? run.mount.spike : undefined;
  /** The spike the fits use as internal standard, once USE SPIKE is on. */
  const spike = use.spike ? runSpike : undefined;

  const interpretationFor = (set: readonly string[]) => (run && set.length > 0 ? sample.interpretations.find((item) => sameInterpretation(item, slotDraft(state, run, set, use))) : undefined);
  const interpA = interpretationFor(slots.A);
  const interpB = interpretationFor(slots.B);
  const fitA = useAnalysis(run, interpA && interpretationOptions(interpA));
  const fitB = useAnalysis(run, interpB && interpretationOptions(interpB));
  const fits = { A: fitA, B: fitB };
  const records = { A: interpA, B: interpB };
  const activeFit = active === 'A' ? fitA.result : fitB.result;
  const otherFit = active === 'A' ? fitB.result : fitA.result;
  const activeSet = slots[active];
  const committed = Boolean(sample.call);
  /** Chips not yet fitted on the displayed run. */
  const draftSlot = (id: SlotId) => Boolean(run) && slots[id].length > 0 && !records[id] && !committed;
  const fitting = (id: SlotId) => Boolean(run && records[id] && !fits[id].result && !fits[id].failed && !committed);
  const fitFailed = (id: SlotId) => Boolean(run && records[id] && !fits[id].result && fits[id].failed);
  /** While chips are a draft or their fit runs, the slot's last fit on this run stays on the plot, faint. */
  const staleFit = (id: SlotId) => {
    const record = run && fitted[id] ? sample.interpretations.find((item) => item.id === fitted[id] && item.runId === run.id) : undefined;
    return run && record ? cachedAnalysis(run, interpretationOptions(record)) : undefined;
  };
  const plotFit = activeFit ?? staleFit(active);

  const fitAction = (id: SlotId): Action | undefined => {
    if (!run) return undefined;
    const request = slotDraft(state, run, slots[id], use);
    return { type: 'interpret', code: sample.code, runId: run.id, candidates: request.candidates, standard: request.internalStandard !== undefined, zero: request.zeroDeg !== undefined };
  };

  /** Records the slot's chips as an interpretation (0 MIN) and fits it; only the newest FIT per slot updates the slot. */
  const fitSlot = (id: SlotId) => {
    const action = fitAction(id);
    if (!run || !action || !draftSlot(id)) return;
    const outcome = dispatch(action);
    if (!outcome.ok) return setNotice(ERROR_WORD[outcome.error]);
    const record = sampleState(outcome.state, sample.code)?.interpretations.find((item) => item.id === outcome.id);
    if (!record) return;
    const token = fitTokens.current[id] + 1;
    fitTokens.current[id] = token;
    ensureAnalysis(run, interpretationOptions(record)).then(
      () => {
        if (fitTokens.current[id] === token) setFitted((current) => ({ ...current, [id]: record.id }));
      },
      () => {
        if (fitTokens.current[id] === token) setNotice(WORD.fitFailed);
      },
    );
  };

  const comparison: Comparison | undefined = useMemo(() => {
    if (!fitA.result || !fitB.result) return undefined;
    try {
      return compareExplanations(fitA.result, fitB.result);
    } catch {
      return undefined;
    }
  }, [fitA.result, fitB.result]);

  const tickKey = [...activeSet, ...(spike ? [spike] : [])].join(',');
  const ticks = useMemo<PlotTicks[]>(() => (tickKey ? tickKey.split(',').map((id) => {
    const phase = activeFit?.phases.find((item) => item.id === id);
    return { id, lines: referenceLines(id), status: phase?.status, missing: phase?.missing.map((line) => line.twoTheta) };
  }) : []), [tickKey, activeFit]);
  const ghostTicks = useMemo(() => (ghost ? { id: ghost, lines: referenceLines(ghost) } : undefined), [ghost]);
  const overlayRun = overlayId && overlayId !== run?.id ? sample.runs.find((item) => item.id === overlayId) : undefined;
  const overlay = useMemo<PlotOverlay | undefined>(() => (run && overlayRun ? { grid: overlayRun.grid, counts: overlayRun.counts, scale: overlayScale(run.acquisition, overlayRun.acquisition) } : undefined), [run, overlayRun]);
  const target = useMemo(() => (targetDeg === undefined ? undefined : acquisitionFor('targeted', targetDeg).range), [targetDeg]);

  const limits = activeFit ? limitations(activeFit) : [];
  const unsupported = [...new Set(activeSet.flatMap((id) => chemicalSupport(id, evidence).unsupported))];
  const key = reportKey(state, sample.code);
  const inReview = reviewing === key;
  const debriefJobs = useMemo(() => (sample.call ? debriefAnalyses(state, sample.code) : []), [state, sample.call, sample.code]);
  const debriefReady = useAnalysesReady(debriefJobs);
  const report = useMemo(() => (sample.call && debriefReady && !inReview ? debrief(state, sample.code) : undefined), [state, sample.call, sample.code, debriefReady, inReview]);

  // The debrief has rendered: report the call to the page once.
  useEffect(() => {
    const call = sample.call;
    if (!report || !call || !memory.unreported.has(key)) return;
    memory.unreported.delete(key);
    const basis = sample.interpretations.find((item) => item.id === call.basis);
    const basisRun = sample.runs.find((item) => item.id === basis?.runId);
    const phases = call.phases.map(phaseLabel);
    const decision = DECISION_LABELS[call.decision];
    onResult({
      ...runContext(sample, basisRun),
      phases,
      decision,
      supported: report.rows.find((row) => row.id === 'support')?.grade !== 'poor',
      uncertain: call.unexplained !== 'none' || call.decision === 'hold-reference',
      summary: `${phases.join(' + ')} · ${decision.toUpperCase()}`,
    });
  }, [report, sample, key, onResult]);

  /** Sample switches keep any running door or scan sequence going and emit nothing. */
  const resetUi = (next: SampleState, at: LabState = state) => {
    memory.code = next.code;
    setCode(next.code);
    setRunChoice(undefined);
    setHeld(heldFor(at, next));
    setActive('A');
    setChip(undefined);
    setProbeDeg(undefined);
    setDraft(mountDraft(next));
    setCallDraft(memory.calls.get(next.code) ?? EMPTY_CALL);
    setFocus(undefined);
    setSweep(undefined);
    setRevealDeg(undefined);
    setSheet(initialSheet(next));
    setSupportTab('limits');
    setDataTab('scan');
    setProgram('survey');
    setTargetDeg(undefined);
    setGhost(undefined);
    setOverlayId(undefined);
    setCostGhost(undefined);
    fitTokens.current = { A: fitTokens.current.A + 1, B: fitTokens.current.B + 1 };
    setFitted(NO_FITS);
  };

  const chooseSample = (next: string) => {
    const nextSample = sampleState(state, next);
    if (nextSample) resetUi(nextSample);
  };

  /** Keeps a sample's slots for this visit and, where storage allows, across a reload. */
  const hold = (next: Held) => {
    memory.held.set(sample.code, next);
    saveSlots(state.seed, sample.code, { ...next.slots, ...next.use });
    setHeld(next);
  };

  const updateSlot = (id: SlotId, set: readonly string[]) => hold({ slots: { ...slots, [id]: set }, use });

  const addPhase = (id: string) => {
    if (id === runSpike || activeSet.includes(id)) return;
    if (activeSet.length >= MAX_CHIPS) return setNotice(`${MAX_CHIPS} ${WORD.max}`);
    updateSlot(active, [...activeSet, id]);
  };

  const removePhase = (id: string) => {
    updateSlot(active, activeSet.filter((item) => item !== id));
    if (chip === id) setChip(undefined);
  };

  const toggleUse = (flag: keyof Use) => hold({ slots, use: { ...use, [flag]: !use[flag] } });

  const saveCall = (next: CallDraft) => {
    memory.calls.set(sample.code, next);
    setCallDraft(next);
  };

  const scan = (programId: ProgramId, centreDeg?: number) => {
    const outcome = dispatch({ type: 'scan', code: sample.code, program: programId, ...(programId === 'targeted' ? { centreDeg } : {}) });
    if (!outcome.ok) return setNotice(ERROR_WORD[outcome.error]);
    const next = sampleState(outcome.state, sample.code);
    const fresh = next?.runs.find((item) => item.id === outcome.id);
    if (!next || !fresh) return;
    setRunChoice(undefined);
    setChip(undefined);
    setFocus(undefined);
    // A targeted scan keeps the probe only when it measured that angle.
    if (programId !== 'targeted' || (probeDeg !== undefined && !runCovers(fresh, probeDeg))) setProbeDeg(undefined);
    const held = seatedMount();
    const delay = held?.code === next.code && held.mountIndex === fresh.mount.index ? 0 : DOOR_MS;
    const ms = reducedMotion() ? 0 : SWEEP_MS[programId];
    const steps: Step[] = [...(delay > 0 ? DOOR : []), [delay, 'scanning'], [delay + ms, 'review']];
    sequence(runContext(next, fresh), steps, () => {
      setSweep(undefined);
      setRevealDeg(undefined);
    });
    seat({ code: next.code, mountIndex: fresh.mount.index });
    if (delay + ms === 0) return;
    setRevealDeg(fresh.grid.startDeg);
    setSweep({ runId: fresh.id, start: performance.now() + delay, ms, startDeg: fresh.grid.startDeg, endDeg: fresh.grid.startDeg + (fresh.grid.count - 1) * fresh.grid.stepDeg });
  };

  const mount = () => {
    const outcome = dispatch({ type: 'mount', code: sample.code, choice: draft });
    if (!outcome.ok) return setNotice(ERROR_WORD[outcome.error]);
    const next = sampleState(outcome.state, sample.code);
    if (!next) return;
    setDraft(mountDraft(next));
    setDataTab('scan');
    sequence(runContext(next), DOOR);
    seat({ code: next.code, mountIndex: currentMount(next).index });
  };

  /** The line-position standard takes the sample's place, so nothing is seated afterwards. */
  const checkZero = () => {
    const outcome = dispatch({ type: 'standard' });
    if (!outcome.ok) return setNotice(ERROR_WORD[outcome.error]);
    const ms = reducedMotion() ? 0 : SWEEP_MS.targeted;
    sequence({ ...runContext(sample), prep: WORD.zeroPrep, scan: WORD.checkZero, scanMinutes: COSTS.standard, runNumber: 0 }, [...DOOR, [DOOR_MS, 'scanning'], [DOOR_MS + ms, 'review']]);
    seat(null);
  };

  const act = (action: Action) => {
    const outcome = dispatch(action);
    if (!outcome.ok) setNotice(ERROR_WORD[outcome.error]);
    return outcome.ok;
  };

  const commit = (basisId: string, phases: readonly string[]) => {
    const { unexplained, decision } = callDraft;
    if (!unexplained || !decision) return;
    const outcome = dispatch({ type: 'call', code: sample.code, phases, unexplained, decision, basis: basisId });
    if (!outcome.ok) return setNotice(ERROR_WORD[outcome.error]);
    const committedKey = reportKey(outcome.state, sample.code);
    memory.unreported.add(committedKey);
    setReviewing(committedKey);
    const minimum = new Promise<void>((resolve) => {
      window.setTimeout(resolve, reducedMotion() ? 0 : REVIEW_MS);
    });
    const warm = Promise.all(debriefAnalyses(outcome.state, sample.code).map((job) => ensureAnalysis(job.run, job.options))).catch(() => undefined);
    Promise.all([minimum, warm]).then(() => setReviewing((current) => (current === committedKey ? undefined : current)));
  };

  const sweeping = Boolean(run && sweep?.runId === run.id);

  const probe = (deg: number) => {
    if (sweeping) return settle();
    setProbeDeg(deg);
  };

  const selectSlot = (id: SlotId) => {
    setActive(id);
    setChip(undefined);
  };

  /** The slot `+`: SUPPORT on REFS, adding to that slot. */
  const openRefs = (id: SlotId) => {
    selectSlot(id);
    setSheet('support');
    setSupportTab('refs');
  };

  const viewRun = (id: string) => {
    const next = sample.runs.find((item) => item.id === id);
    setRunChoice(id);
    setChip(undefined);
    if (overlayId === id) setOverlayId(undefined);
    if (next && probeDeg !== undefined && !runCovers(next, probeDeg)) setProbeDeg(undefined);
  };

  /** Sets the targeted-scan centre, kept clear of the goniometer limits; nothing runs until SCAN is pressed. */
  const holdTarget = (deg: number) => {
    setTargetDeg(targetCentre(deg));
    setProgram('targeted');
  };

  const openTarget = (deg: number) => {
    holdTarget(deg);
    setDataTab('scan');
    setSheet('data');
  };

  /** Copies a run's program and centre into SCAN without scanning. */
  const rerun = (item: RunRecord) => {
    setProgram(item.acquisition.program);
    if (item.acquisition.program === 'targeted') setTargetDeg(targetCentre(runCentre(item)));
    setDataTab('scan');
  };

  const focusOn = (deg: number, half = 1.2) => {
    setProbeDeg(deg);
    setFocus((current) => ({ startDeg: deg - half, endDeg: deg + half, key: (current?.key ?? 0) + 1 }));
  };

  const focusLimit = (limit: Limitation) => {
    if (!activeFit) return;
    const kind = limit === 'grains' ? 'intensity' : limit;
    const feature = activeFit.features.find((item) => item.kind === kind);
    if (feature) return focusOn(feature.centreDeg, Math.max(1, (feature.endDeg - feature.startDeg) * 2));
    if (limit === 'missing-lines') {
      const line = activeFit.phases.flatMap((phase) => phase.missing)[0];
      if (line) focusOn(line.twoTheta);
    }
  };

  /** One ghost for every costed control: its minutes on the clock bar and, in PREP, its grams on the jar bar. */
  const onCost: OnCost = (action) => {
    const show = () => {
      const cost = action ? costOf(state, action) : undefined;
      setCostGhost(cost && typeof cost !== 'string' && (cost.minutes > 0 || cost.powderG > 0) ? { at: state, minutes: cost.minutes, powderG: cost.powderG } : undefined);
    };
    const hide = () => setCostGhost(undefined);
    return { onPointerEnter: show, onPointerDown: show, onFocus: show, onPointerLeave: hide, onPointerCancel: hide, onBlur: hide };
  };
  const shownCost = costGhost?.at === state ? costGhost : undefined;

  const close = () => {
    settle();
    onClose();
  };

  const startShift = () => {
    memory.held.clear();
    memory.calls.clear();
    memory.unreported.clear();
    settle();
    const fresh = newShift();
    resetUi(fresh.samples[0], fresh);
  };

  /**
   * Bench keys, heard on the document: a focused control that unmounts (FIT, ADD, HOLD TO COMMIT) drops focus to the body,
   * and keys from there still belong to the bench.
   */
  const onBenchKey = useEffectEvent((event: globalThis.KeyboardEvent) => {
    const dialog = dialogRef.current;
    if (!dialog || event.isComposing) return;
    const origin = event.target instanceof Element ? event.target : null;
    const dropped = !origin || origin === document.body || origin === document.documentElement;
    if (!dropped && !dialog.contains(origin)) return;
    if (event.key === 'Tab') {
      // The focus trap handles Tab from a control; from the body or the dialog itself, Tab re-enters the dialog.
      if (event.defaultPrevented || (!dropped && origin !== dialog)) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.getClientRects().length > 0);
      const next = event.shiftKey ? items[items.length - 1] : items[0];
      if (!next) return;
      event.preventDefault();
      next.focus();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (chip) setChip(undefined);
      else close();
      return;
    }
    if (!run || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if ((origin instanceof HTMLElement && origin.isContentEditable) || origin?.closest('input, select, textarea')) return;
    const pressed = event.key.toLowerCase();
    if (pressed === 'a' || pressed === 'b') {
      event.preventDefault();
      selectSlot(pressed === 'a' ? 'A' : 'B');
    } else if (pressed === 'f' && draftSlot(active)) {
      event.preventDefault();
      fitSlot(active);
    }
  });

  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => onBenchKey(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  // A focused control that unmounts leaves focus on the body; put it back on the dialog so screen readers stay inside.
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) dialogRef.current?.focus({ preventScroll: true });
  });

  const minutesLeft = Math.max(0, SHIFT_MINUTES - state.minute);
  const shiftOver = minutesLeft < SHIFT_OVER_MIN;
  const ghostMinutes = Math.min(shownCost?.minutes ?? 0, minutesLeft);
  const dataWords = limits.filter((item) => DATA_LIMITS.includes(item)).map((item) => LIMIT_COPY[item].word);
  const supportWords = [...limits.filter((item) => !DATA_LIMITS.includes(item)).map((item) => LIMIT_COPY[item].word), ...unsupported.map((element) => `${element} ${WORD.unsupported}`)];
  const beforeFit = fitting(active) ? WORD.fitting : WORD.noFit;
  const aimTarget = `${source.record.objective.targets.map(phaseLabel).join(' + ')}${source.record.objective.zrMolPercent ? ` · Zr${source.record.objective.zrMolPercent}` : ''}`;
  const dock: readonly { readonly id: Sheet; readonly value: string; readonly flag?: boolean; readonly ready?: boolean }[] = [
    // Before a fit only SUPPORT says NO FIT or FITTING; DATA names the run on show.
    { id: 'data', value: activeFit ? flagWord(dataWords) : run ? runShort(run) : WORD.noRun, flag: dataWords.length > 0 },
    { id: 'support', value: activeFit ? flagWord(supportWords) : beforeFit, flag: supportWords.length > 0, ready: sampleStatus(state, sample) === 'ready' },
    { id: 'aim', value: aimTarget },
    { id: 'decide', value: committed ? WORD.committed : callDraft.decision ? DECISION_LABELS[callDraft.decision].toUpperCase() : WORD.unset },
  ];
  const selectedFit = chip ? activeFit?.phases.find((item) => item.id === chip) : undefined;
  const nextOpen = state.samples.find((item) => !item.call && item.code !== sample.code);

  return <div className="xb-backdrop">
    <section ref={dialogRef} className="xb" role="dialog" aria-modal="true" aria-label={ARIA.bench} tabIndex={-1}>
      <header className="xb-top">
        <label className="xb-sample">
          <span className="xb-hidden">{ARIA.sample}</span>
          <select value={sample.code} onChange={(event) => chooseSample(event.target.value)}>
            {state.samples.map((item) => <option key={item.code} value={item.code}>{`${item.code} · ${sampleCase(item.code).record.title} · ${SAMPLE_STATUS[sampleStatus(state, item)]}`}</option>)}
          </select>
        </label>
        <div className="xb-clock" data-tone={shiftOver ? 'over' : minutesLeft < 60 ? 'low' : undefined}>
          {shiftOver ? <b>{WORD.shiftOver}</b> : <><b>{minutesLeft}</b> {WORD.minLeft}</>}
          <i style={{ width: clockShare(minutesLeft) }} />
          {ghostMinutes > 0 && <i className="xb-ghost" style={{ left: clockShare(minutesLeft - ghostMinutes), width: clockShare(ghostMinutes) }} />}
        </div>
        <button type="button" className="xb-icon" aria-label={ARIA.close} onClick={close}>✕</button>
      </header>

      <div className="xb-body">
        <section className="xb-work" aria-label={ARIA.pattern}>
          <div className="xb-runbar">
            <div className="xb-runs" role="tablist" aria-label={ARIA.runs}>
              {sample.runs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === run?.id} onClick={() => viewRun(item.id)}>{runName(item)}</button>)}
            </div>
            {sweeping ? <button type="button" className="xb-link" onClick={settle}>{WORD.skip}</button>
              : activeFit && <span className="xb-muted" title={ARIA.strongestPeak}>{formatCounts(activeFit.peakCounts)}</span>}
          </div>

          <div className="xb-plot">
            {run ? <PatternPlot
              key={run.id}
              grid={run.grid}
              counts={run.counts}
              fit={sweeping ? undefined : plotFit}
              dim={!activeFit}
              other={sweeping ? undefined : otherFit}
              overlay={sweeping ? undefined : overlay}
              highlight={chip}
              ticks={ticks}
              ghost={ghostTicks}
              target={target}
              onTarget={committed ? undefined : holdTarget}
              probeDeg={probeDeg}
              onProbe={probe}
              revealDeg={sweeping ? revealDeg : undefined}
              focus={focus}
              label={ARIA.plot(runTag(sample, run), sample.code)}
            /> : <div className="xb-empty">
              {/* The scan itself is chosen and run from DATA → SCAN; this only points there. */}
              {sheet === 'data' && dataTab === 'scan'
                ? <span>{WORD.scan}</span>
                : <button type="button" className="xb-link" onClick={() => { setDataTab('scan'); setSheet('data'); }}>{WORD.scan}</button>}
            </div>}
            {sweeping && <div className="xb-fitting" role="status">{WORD.scanning}</div>}
            {!sweeping && fitting(active) && <div className="xb-fitting" role="status">{WORD.fitting}</div>}
            {notice && <div className="xb-notice" role="status">{notice}</div>}
          </div>

          {run && probeDeg !== undefined && <ProbeCard
            state={state}
            sample={sample}
            run={run}
            deg={probeDeg}
            fit={activeFit}
            evidence={evidence}
            library={library}
            set={activeSet}
            runSpike={runSpike}
            ghost={ghost}
            committed={committed}
            onGhost={(id) => setGhost(ghost === id ? undefined : id)}
            onAdd={addPhase}
            onTarget={() => openTarget(probeDeg)}
            onCost={onCost}
            onClose={() => {
              setProbeDeg(undefined);
              setGhost(undefined);
            }}
          />}

          {run && <div className="xb-slots">
            {(['A', 'B'] as const).map((id) => <div key={id} className="xb-slot" data-slot={id} data-active={id === active || undefined}>
              <button type="button" className="xb-slot-name" aria-pressed={id === active} aria-keyshortcuts={id} onClick={() => selectSlot(id)}>{id}</button>
              <div className="xb-chips">
                {slots[id].map((phase) => {
                  const fit = fits[id].result?.phases.find((item) => item.id === phase);
                  return <button key={phase} type="button" className="xb-chip" data-status={fit?.status} aria-pressed={id === active && chip === phase} onClick={() => { setActive(id); setChip(id === active && chip === phase ? undefined : phase); }}>
                    <i style={{ background: phaseColor(phase) }} />{phaseLabel(phase)}
                  </button>;
                })}
                {spike && slots[id].length > 0 && <span className="xb-chip" data-locked title={ARIA.internalStandard}>{SPIKE_LABEL[spike]} {WORD.spike}</span>}
                {!committed && slots[id].length < MAX_CHIPS && <button type="button" className="xb-add" aria-label={ARIA.addReference(id)} onClick={() => openRefs(id)}>+</button>}
                {id === active && draftSlot(id) && <FitButton state={state} action={fitAction(id)} onFit={() => fitSlot(id)} />}
              </div>
              {id === 'A' && <CompareWord comparison={comparison} pending={fitting('A') || fitting('B')} />}
            </div>)}
          </div>}

          {chip && <div className="xb-detail">
            <b style={{ color: phaseColor(chip) }}>{phaseLabel(chip)}</b>
            {selectedFit ? <>
              <span>{STATUS_WORD[selectedFit.status]}</span>
              <span>{selectedFit.detected.length} {WORD.seen} · {selectedFit.missing.length} {WORD.absent}</span>
              {selectedFit.indistinguishableFrom.length > 0 && <span className="xb-warn">{WORD.looksLike} {selectedFit.indistinguishableFrom.map(phaseLabel).join(', ')}</span>}
            </> : <span className="xb-muted">{fitting(active) ? WORD.fitting : WORD.noFit}</span>}
            {chemicalSupport(chip, evidence).unsupported.map((element) => <span key={element} className="xb-warn">{element} {WORD.unsupported}</span>)}
            {!committed && <button type="button" className="xb-link" onClick={() => removePhase(chip)}>{WORD.remove}</button>}
          </div>}
        </section>

        <nav className="xb-tabs" role="tablist" aria-label={ARIA.sheets}>
          {dock.map((cell) => <button key={cell.id} type="button" role="tab" aria-selected={sheet === cell.id} onClick={() => setSheet(cell.id)}>
            <b>
              {SHEET_LABEL[cell.id]}
              {cell.flag && <em className="xb-dot" />}
              {cell.ready && <em className="xb-dot" data-tone="ready" role="img" aria-label={ARIA.resultReady} />}
            </b>
            <span>{cell.value}</span>
          </button>)}
        </nav>

        <section className="xb-sheet" role="tabpanel" aria-label={SHEET_LABEL[sheet]}>
          {sheet === 'data' && <DataSheet
            state={state}
            sample={sample}
            run={run}
            tab={dataTab}
            program={program}
            targetDeg={targetDeg}
            overlayId={overlayRun?.id}
            draft={draft}
            costGhost={shownCost}
            onTab={setDataTab}
            onProgram={setProgram}
            onDraft={setDraft}
            onScan={scan}
            onMount={mount}
            onZero={checkZero}
            onView={viewRun}
            onOverlay={(id) => setOverlayId(overlayRun?.id === id ? undefined : id)}
            onRerun={rerun}
            onCost={onCost}
          />}
          {sheet === 'support' && <SupportSheet
            state={state}
            sample={sample}
            tab={supportTab}
            fit={activeFit}
            limits={limits}
            unsupported={unsupported}
            onTab={setSupportTab}
            onLimit={focusLimit}
            onAct={act}
            onCost={onCost}
            refs={<RefsPanel
              state={state}
              sample={sample}
              library={library}
              evidence={evidence}
              set={activeSet}
              active={active}
              runSpike={runSpike}
              use={use}
              preview={ghost}
              onPreview={(id) => setGhost(ghost === id ? undefined : id)}
              onAdd={addPhase}
              onUse={toggleUse}
              onAct={act}
            />}
          />}
          {sheet === 'aim' && <AimSheet state={state} sample={sample} onAct={act} onCost={onCost} />}
          {sheet === 'decide' && (committed
            ? <DebriefView report={report} tried={sample.interpretations.length} hasNext={Boolean(nextOpen)} onNext={() => nextOpen && resetUi(nextOpen)} onNewShift={startShift} onClose={close} />
            : <DecideSheet
              state={state}
              sample={sample}
              interpretations={records}
              active={active}
              run={run}
              draft={callDraft}
              fits={{ A: fitA.result, B: fitB.result }}
              pending={fitting('A') || fitting('B')}
              failed={fitFailed('A') || fitFailed('B')}
              onFocus={(deg) => focusOn(deg)}
              onDraft={saveCall}
              onCommit={commit}
            />)}
        </section>
      </div>
    </section>
  </div>;
}

function PrimaryCost({ state, action, label, onRun, onCost, secondary = false, grams = false, disabled = false }: {
  readonly state: LabState;
  readonly action: Action;
  readonly label: string;
  readonly onRun: () => void;
  readonly onCost: OnCost;
  readonly secondary?: boolean;
  /** Show grams even when zero, as PREP and the test cards do. */
  readonly grams?: boolean;
  readonly disabled?: boolean;
}) {
  const cost = costText(state, action, label, grams);
  const off = cost.disabled || disabled;
  return <button type="button" className={secondary ? 'xb-secondary' : 'xb-primary'} disabled={off} onClick={onRun} {...onCost(off ? undefined : action)}>{cost.label}</button>;
}

/** The only way a slot's chips get fitted: an explicit press or `F`. */
function FitButton({ state, action, onFit }: { readonly state: LabState; readonly action?: Action; readonly onFit: () => void }) {
  if (!action) return null;
  const cost = costText(state, action, WORD.fit);
  return <button type="button" className="xb-primary xb-fit" aria-keyshortcuts="F" disabled={cost.disabled} onClick={onFit}>{cost.label}</button>;
}

function CompareWord({ comparison, pending }: { readonly comparison?: Comparison; readonly pending: boolean }) {
  const [open, setOpen] = useState(false);
  if (pending) return <span className="xb-compare xb-muted">{WORD.fitting}</span>;
  if (!comparison) return null;
  return <button type="button" className="xb-compare" data-tone={comparison} aria-expanded={open} onClick={() => setOpen(!open)}>
    {COMPARISON_WORD[comparison]}
    {open && <small>{WORD.notProof}</small>}
  </button>;
}

function ProbeCard({ state, sample, run, deg, fit, evidence, library, set, runSpike, ghost, committed, onGhost, onAdd, onTarget, onCost, onClose }: {
  readonly state: LabState;
  readonly sample: SampleState;
  readonly run: RunRecord;
  readonly deg: number;
  readonly fit?: AnalysisResult;
  readonly evidence: readonly ElementEvidence[];
  readonly library: readonly string[];
  readonly set: readonly string[];
  readonly runSpike?: SpikeKind;
  readonly ghost?: string;
  readonly committed: boolean;
  readonly onGhost: (id: string) => void;
  readonly onAdd: (id: string) => void;
  readonly onTarget: () => void;
  readonly onCost: OnCost;
  readonly onClose: () => void;
}) {
  // Catalogue order, never strength order, so the list does not rank the answers.
  const groups = probeGroups(deg, library, runSpike);
  const z = fit ? probeZ(run, fit, deg) : undefined;
  const step = run.grid.stepDeg;
  const feature = fit?.features.find((item) => deg >= item.startDeg - step && deg <= item.endDeg + step);
  return <div className="xb-probe">
    <div className="xb-probe-head">
      <b>{degrees(deg)}</b>
      {/* No z at an angle this run never measured; amber stays on the feature word. */}
      {!fit ? <span className="xb-muted">{WORD.noFit}</span> : z !== undefined && <span className="xb-muted">z {z >= 0 ? '+' : '−'}{Math.abs(z).toFixed(1)}</span>}
      {feature && <span className="xb-warn">{FEATURE_WORD[feature.kind]}</span>}
      <button type="button" className="xb-icon xb-icon-small" aria-label={ARIA.clearProbe} onClick={onClose}>✕</button>
    </div>
    <ul className="xb-groups" aria-label={ARIA.libraryLines}>
      {groups.length === 0 && <li className="xb-muted">{WORD.noLines}</li>}
      {groups.slice(0, MAX_CHIPS).map(({ id, relative }) => <li key={id}>
        <button type="button" className="xb-chip" aria-pressed={ghost === id} title={ARIA.showLines} onClick={() => onGhost(id)}>
          <i style={{ background: phaseColor(id) }} />{phaseLabel(id)}
          <span className="xb-strength" role="img" aria-label={ARIA.strength(relative)}>{relative >= 0.5 ? '▮▮▮' : relative >= 0.15 ? '▮▮' : '▮'}</span>
          {!chemicalSupport(id, evidence).supported && <em className="xb-dot" title={ARIA.notOnRecord} />}
        </button>
        {!committed && !set.includes(id) && <button type="button" className="xb-link" aria-label={ARIA.add(phaseLabel(id))} onClick={() => onAdd(id)}>{WORD.add}</button>}
      </li>)}
      {groups.length > MAX_CHIPS && <li className="xb-muted">+{groups.length - MAX_CHIPS}</li>}
    </ul>
    {!committed && <PrimaryCost state={state} secondary action={{ type: 'scan', code: sample.code, program: 'targeted', centreDeg: deg }} label={WORD.target} onRun={onTarget} onCost={onCost} />}
  </div>;
}

function Options<T extends string | boolean>({ label, value, options, onChange, disabled }: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly (readonly [T, string])[];
  readonly onChange: (value: T) => void;
  readonly disabled?: (value: T) => boolean;
}) {
  return <div className="xb-field">
    <span className="xb-label">{label}</span>
    <div className="xb-seg" role="group" aria-label={label}>
      {options.map(([option, text]) => <button key={String(option)} type="button" aria-pressed={option === value} disabled={disabled?.(option)} onClick={() => onChange(option)}>{text}</button>)}
    </div>
  </div>;
}

function Tabs<T extends string>({ value, options, onChange }: { readonly value: T; readonly options: readonly (readonly [T, string])[]; readonly onChange: (value: T) => void }) {
  return <div className="xb-subtabs" role="tablist">
    {options.map(([option, text]) => <button key={option} type="button" role="tab" aria-selected={option === value} onClick={() => onChange(option)}>{text}</button>)}
  </div>;
}

const plainDeg = (value: number) => `${Number(value.toFixed(2))}`;
const GRIND_RANK: Readonly<Record<Grind, number>> = { 'as-received': 0, hand: 1, extended: 2 };

function DataSheet({ state, sample, run, tab, program, targetDeg, overlayId, draft, costGhost, onTab, onProgram, onDraft, onScan, onMount, onZero, onView, onOverlay, onRerun, onCost }: {
  readonly state: LabState;
  readonly sample: SampleState;
  readonly run?: RunRecord;
  readonly tab: DataTab;
  readonly program: ProgramId;
  readonly targetDeg?: number;
  readonly overlayId?: string;
  readonly draft: MountChoice;
  readonly costGhost?: CostGhost;
  readonly onTab: (tab: DataTab) => void;
  readonly onProgram: (program: ProgramId) => void;
  readonly onDraft: (draft: MountChoice) => void;
  readonly onScan: (program: ProgramId, centreDeg?: number) => void;
  readonly onMount: () => void;
  readonly onZero: () => void;
  readonly onView: (runId: string) => void;
  readonly onOverlay: (runId: string) => void;
  readonly onRerun: (run: RunRecord) => void;
  readonly onCost: OnCost;
}) {
  const mount = currentMount(sample);
  const [more, setMore] = useState({ scan: false, prep: draft.method === 'back' || draft.spike !== 'none' });
  const targeted = program === 'targeted';
  const centre = targeted ? targetDeg : undefined;
  const scanAction: Action = { type: 'scan', code: sample.code, program, ...(centre === undefined ? {} : { centreDeg: centre }) };
  // costOf falls back to 33° without a centre, so a targeted scan waits for a centre set on the plot.
  const waiting = targeted && targetDeg === undefined;
  const rescan = sample.runs.some((item) => item.mount.index === mount.index);
  const same = draft.aliquot === 'same';
  const mounts = [...new Map(sample.runs.map((item) => [item.mount.index, item.mount])).values()].reverse();
  const jarG = sampleCase(sample.code).powderG;
  const leftG = powderLeftG(state, sample.code);
  const ghostG = Math.min(costGhost?.powderG ?? 0, leftG);
  const jarShare = (grams: number) => `${(100 * Math.max(0, grams)) / jarG}%`;
  return <>
    <Tabs value={tab} options={[['scan', WORD.scan], ['prep', WORD.prep], ['runs', WORD.runs]]} onChange={onTab} />
    {tab === 'scan' && <>
      <p className="xb-line">{mountTag(mount)}</p>
      <div className="xb-programs" role="group" aria-label={ARIA.program}>
        {PROGRAM_ORDER.map((id) => {
          const pinned = id === 'targeted' && targetDeg === undefined;
          const action: Action = { type: 'scan', code: sample.code, program: id, ...(id === 'targeted' && targetDeg !== undefined ? { centreDeg: targetDeg } : {}) };
          const cost = costOf(state, action);
          const acquisition = acquisitionFor(id, targetDeg);
          const detail = id !== 'targeted' ? `${plainDeg(acquisition.range.startDeg)}-${plainDeg(acquisition.range.endDeg)}° · ${acquisition.stepDeg}°` : targetDeg === undefined ? WORD.holdPlot : `${degrees(targetDeg, 1)} · ${WORD.checkOnly}`;
          return <button key={id} type="button" aria-pressed={program === id} onClick={() => onProgram(id)} {...onCost(pinned ? undefined : action)}>
            <b>{PROGRAM_LABEL[id]} {typeof cost === 'string' ? ERROR_WORD[cost] : cost.minutes}</b><span>{detail}</span>
          </button>;
        })}
      </div>
      <PrimaryCost state={state} action={scanAction} label={rescan ? WORD.rescan : WORD.scan} onRun={() => onScan(program, centre)} onCost={onCost} disabled={waiting} />
      <button type="button" className="xb-link" aria-expanded={more.scan} onClick={() => setMore({ ...more, scan: !more.scan })}>{WORD.more}</button>
      {more.scan && <div className="xb-field">
        <span className="xb-label">{WORD.zero} {state.zeroDeg === undefined ? WORD.unchecked : degrees(state.zeroDeg, 3)}</span>
        <PrimaryCost state={state} secondary action={{ type: 'standard' }} label={WORD.checkZero} onRun={onZero} onCost={onCost} />
      </div>}
    </>}
    {tab === 'runs' && <>
      {mounts.map((item) => <div key={item.index} className="xb-field">
        <span className="xb-label">{mountTag(item)}</span>
        <ul className="xb-list" aria-label={mountTag(item)}>
          {sample.runs.filter((entry) => entry.mount.index === item.index).reverse().map((entry) => {
            const shown = entry.id === run?.id;
            return <li key={entry.id} data-active={shown || undefined}>
              <button type="button" className="xb-row" aria-current={shown || undefined} onClick={() => onView(entry.id)}><b>{runTag(sample, entry)}</b></button>
              {!shown && <button type="button" className="xb-link" aria-pressed={overlayId === entry.id} onClick={() => onOverlay(entry.id)}>{WORD.overlay}</button>}
              {shown && !sample.call && <button type="button" className="xb-link" onClick={() => onRerun(entry)}>{WORD.rerunOn} M{mount.index}</button>}
            </li>;
          })}
        </ul>
      </div>)}
    </>}
    {tab === 'prep' && <>
      <div className="xb-field">
        <p className="xb-line">{WORD.jar} {leftG.toFixed(2)} {WORD.g}</p>
        <div className="xb-bar">
          <i style={{ width: jarShare(leftG) }} />
          {ghostG > 0 && <i className="xb-ghost" style={{ left: jarShare(leftG - ghostG), width: jarShare(ghostG) }} />}
        </div>
      </div>
      <Options label={WORD.aliquot} value={draft.aliquot} options={[['same', WORD.same], ['new', WORD.new]]} onChange={(aliquot) => onDraft(aliquot === 'new' ? { ...draft, aliquot } : { ...draft, aliquot, grind: GRIND_RANK[draft.grind] < GRIND_RANK[mount.grind] ? mount.grind : draft.grind, spike: mount.spike === 'none' ? draft.spike : mount.spike })} />
      <Options label={WORD.grind} value={draft.grind} options={(Object.keys(GRIND_LABEL) as Grind[]).map((grind) => [grind, GRIND_LABEL[grind]] as const)} onChange={(grind) => onDraft({ ...draft, grind })} disabled={(grind) => same && GRIND_RANK[grind] < GRIND_RANK[mount.grind]} />
      <Options label={WORD.spin} value={draft.spin} options={[[false, WORD.off], [true, WORD.on]]} onChange={(spin) => onDraft({ ...draft, spin })} />
      <button type="button" className="xb-link" aria-expanded={more.prep} onClick={() => setMore({ ...more, prep: !more.prep })}>{WORD.more}</button>
      {more.prep && <>
        <Options label={WORD.load} value={draft.method} options={[['front', METHOD_LABEL.front], ['back', METHOD_LABEL.back]]} onChange={(method) => onDraft({ ...draft, method })} />
        <Options label={WORD.spike} value={draft.spike} options={(Object.keys(SPIKE_LABEL) as SpikeKind[]).map((kind) => [kind, SPIKE_LABEL[kind]] as const)} onChange={(spike) => onDraft({ ...draft, spike })} disabled={(kind) => same && mount.spike !== 'none' && kind !== mount.spike} />
      </>}
      <PrimaryCost state={state} grams action={{ type: 'mount', code: sample.code, choice: draft }} label={WORD.mount} onRun={onMount} onCost={onCost} />
    </>}
  </>;
}

function SupportSheet({ state, sample, tab, fit, limits, unsupported, refs, onTab, onLimit, onAct, onCost }: {
  readonly state: LabState;
  readonly sample: SampleState;
  readonly tab: SupportTab;
  readonly fit?: AnalysisResult;
  readonly limits: readonly Limitation[];
  readonly unsupported: readonly string[];
  readonly refs: ReactNode;
  readonly onTab: (tab: SupportTab) => void;
  readonly onLimit: (limit: Limitation) => void;
  readonly onAct: (action: Action) => boolean;
  readonly onCost: OnCost;
}) {
  const [open, setOpen] = useState<string>();
  return <>
    <Tabs value={tab} options={[['limits', WORD.limits], ['refs', WORD.refs], ['tests', WORD.tests]]} onChange={onTab} />
    {tab === 'limits' && <>
      {fit && limits.length === 0 && unsupported.length === 0 && <p className="xb-line xb-muted">{WORD.noFlags}</p>}
      <ul className="xb-list">
        {limits.map((limit) => <li key={limit}>
          <button type="button" className="xb-row" aria-expanded={open === limit} onClick={() => {
            setOpen(open === limit ? undefined : limit);
            onLimit(limit);
          }}>
            <b className="xb-warn">{LIMIT_COPY[limit].word}</b>
            {open === limit && <span>{LIMIT_COPY[limit].line}</span>}
          </button>
        </li>)}
        {unsupported.map((element) => <li key={element}>
          <button type="button" className="xb-row" aria-expanded={open === element} onClick={() => setOpen(open === element ? undefined : element)}>
            <b className="xb-warn">{element} {WORD.unsupported}</b>
            {open === element && <span>{unsupportedLine(element)}</span>}
          </button>
        </li>)}
      </ul>
    </>}
    {tab === 'refs' && refs}
    {tab === 'tests' && <TestsPanel state={state} sample={sample} onAct={onAct} onCost={onCost} />}
  </>;
}

function RefsPanel({ state, sample, library, evidence, set, active, runSpike, use, preview, onPreview, onAdd, onUse, onAct }: {
  readonly state: LabState;
  readonly sample: SampleState;
  readonly library: readonly string[];
  readonly evidence: readonly ElementEvidence[];
  readonly set: readonly string[];
  readonly active: SlotId;
  readonly runSpike?: SpikeKind;
  readonly use: Use;
  readonly preview?: string;
  readonly onPreview: (id: string) => void;
  readonly onAdd: (id: string) => void;
  readonly onUse: (flag: keyof Use) => void;
  readonly onAct: (action: Action) => boolean;
}) {
  const committed = Boolean(sample.call);
  const chips = library.filter((id) => id !== runSpike);
  const full = set.length >= MAX_CHIPS;
  const zero = state.zeroDeg !== undefined;
  return <>
    {/* Broadening is two-way and free in the core, so it shows no cost. */}
    <Options label={WORD.search} value={sample.broadened} options={[[false, WORD.record], [true, WORD.all]]} onChange={(on) => onAct({ type: 'broaden', code: sample.code, on })} disabled={() => committed} />
    <div className="xb-chips xb-refs" role="group" aria-label={ARIA.references}>
      {chips.map((id) => <button key={id} type="button" className="xb-chip" aria-pressed={preview === id} data-in={set.includes(id) || undefined} title={ARIA.showLines} onClick={() => onPreview(id)}>
        <i style={{ background: phaseColor(id) }} />{phaseLabel(id)}
        {!chemicalSupport(id, evidence).supported && <em className="xb-dot" title={ARIA.notOnRecord} />}
      </button>)}
    </div>
    {!committed && preview && chips.includes(preview) && !set.includes(preview) && <button type="button" className="xb-secondary" aria-label={ARIA.add(phaseLabel(preview))} disabled={full} onClick={() => onAdd(preview)}>
      {full ? `${MAX_CHIPS} ${WORD.max}` : `${WORD.addTo} ${active}`}
    </button>}
    {!committed && (runSpike || zero) && <div className="xb-seg" role="group" aria-label={ARIA.fitOptions}>
      {runSpike && <button type="button" aria-pressed={use.spike} onClick={() => onUse('spike')}>{WORD.useSpike}</button>}
      {zero && <button type="button" aria-pressed={use.zero} onClick={() => onUse('zero')}>{WORD.useZero}</button>}
    </div>}
  </>;
}

function Pips({ state, kind }: { readonly state: LabState; readonly kind: 'tga' | 'sem' }) {
  const left = slotsLeft(state, kind);
  return <span className="xb-pips" role="img" aria-label={ARIA.slotsLeft(left, CAPACITY[kind])}>
    {Array.from({ length: CAPACITY[kind] }, (_, index) => <i key={index} data-on={index < left || undefined} />)}
  </span>;
}

function TestStatus({ state, kind, code, status, onAct, onCost }: {
  readonly state: LabState;
  readonly kind: 'tga' | 'sem';
  readonly code: string;
  readonly status: FollowUp<unknown>;
  readonly onAct: (action: Action) => boolean;
  readonly onCost: OnCost;
}) {
  if (status.status === 'none') {
    const send: Action = { type: kind, code };
    return <PrimaryCost state={state} secondary grams action={send} label={WORD.send} onRun={() => onAct(send)} onCost={onCost} />;
  }
  if (status.status !== 'running') return null;
  const minutes = status.readyMinute - state.minute;
  const wait: Action = { type: 'wait', minutes };
  return <div className="xb-actions">
    <span className="xb-line xb-muted">{WORD.readyIn} {minutes} {WORD.min}</span>
    <PrimaryCost state={state} secondary action={wait} label={WORD.wait} onRun={() => onAct(wait)} onCost={onCost} />
  </div>;
}

function TestsPanel({ state, sample, onAct, onCost }: { readonly state: LabState; readonly sample: SampleState; readonly onAct: (action: Action) => boolean; readonly onCost: OnCost }) {
  const [particle, setParticle] = useState<number>();
  const tga = tgaStatus(state, sample.code);
  const sem = semStatus(state, sample.code);
  return <>
    <div className="xb-test">
      <div className="xb-test-head"><b>{TEST_LABEL.tga}</b><Pips state={state} kind="tga" /></div>
      <TestStatus state={state} kind="tga" code={sample.code} status={tga} onAct={onAct} onCost={onCost} />
      {tga.status === 'ready' && <ul className="xb-steps">
        {tga.result.steps.length === 0 && <li className="xb-muted">{WORD.noSteps}</li>}
        {tga.result.steps.map((step) => <li key={step.fromC}>{step.fromC}-{step.toC} °C · {step.lossPercent.toFixed(1)}%</li>)}
      </ul>}
    </div>
    <div className="xb-test">
      <div className="xb-test-head"><b>{TEST_LABEL.sem}</b><Pips state={state} kind="sem" /></div>
      <TestStatus state={state} kind="sem" code={sample.code} status={sem} onAct={onAct} onCost={onCost} />
      {sem.status === 'ready' && <>
        <div className="xb-pills">
          {sem.result.area.map((signal) => <span key={signal.element} className="xb-pill" data-dim={signal.artefact ? true : undefined}>{signal.element} {signal.artefact ? ARTEFACT_WORD[signal.artefact] : BAND_LABEL[signal.level]}</span>)}
          {sem.result.unresolved.map((item) => <span key={item.element} className="xb-pill xb-warn">{item.element} {WORD.hiddenBy} {item.hiddenBy}</span>)}
        </div>
        <div className="xb-particles" role="group" aria-label={ARIA.particles}>
          {sem.result.spots.map((_, index) => <button key={index} type="button" aria-pressed={particle === index} aria-label={ARIA.particle(index + 1)} onClick={() => setParticle(particle === index ? undefined : index)} />)}
          {particle !== undefined && <span>{sem.result.spots[particle].join(' · ') || WORD.noHeavy}</span>}
        </div>
      </>}
    </div>
  </>;
}

function AimSheet({ state, sample, onAct, onCost }: { readonly state: LabState; readonly sample: SampleState; readonly onAct: (action: Action) => boolean; readonly onCost: OnCost }) {
  const { record, cues } = sampleCase(sample.code);
  const evidence = evidenceFor(state, sample.code);
  const sources = new Map<string, string[]>();
  for (const item of evidence) sources.set(item.element, [...(sources.get(item.element) ?? []), SOURCE_WORD[item.source]]);
  return <>
    <h3 className="xb-title">{record.objective.label}</h3>
    <div className="xb-field">
      <span className="xb-label">{WORD.record}</span>
      <ul className="xb-facts">
        {record.facts.map((fact) => <li key={fact}>{fact}</li>)}
        {record.hypotheses.map((item) => <li key={item} className="xb-muted">{WORD.expected} · {item}</li>)}
        {record.missing.map((field) => <li key={field} className="xb-warn">{WORD.blank} · {field}</li>)}
      </ul>
    </div>
    <div className="xb-pills">
      {[...sources].map(([element, from]) => <span key={element} className="xb-pill">{element} {[...new Set(from)].join('+')}</span>)}
    </div>
    <ul className="xb-list">
      {cues.map((cue) => {
        const read = sample.revealed.includes(cue.id);
        const inspect: Action = { type: 'inspect', code: sample.code, cue: cue.id };
        return <li key={cue.id}>
          <div className="xb-row"><b>{cue.label}</b>{read && <span>{cue.text}</span>}</div>
          {!read && <PrimaryCost state={state} secondary action={inspect} label={WORD.read} onRun={() => onAct(inspect)} onCost={onCost} />}
        </li>;
      })}
    </ul>
  </>;
}

function DecideSheet({ state, sample, interpretations, active, run, draft, fits, pending, failed, onFocus, onDraft, onCommit }: {
  readonly state: LabState;
  readonly sample: SampleState;
  readonly interpretations: Readonly<Record<SlotId, Interpretation | undefined>>;
  readonly active: SlotId;
  readonly run?: RunRecord;
  readonly draft: CallDraft;
  readonly fits: Readonly<Record<SlotId, AnalysisResult | undefined>>;
  /** A slot's fit is still running. */
  readonly pending: boolean;
  /** A slot's fit failed. */
  readonly failed: boolean;
  readonly onFocus: (deg: number) => void;
  readonly onDraft: (draft: CallDraft) => void;
  readonly onCommit: (basisId: string, phases: readonly string[]) => void;
}) {
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const hold = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hold.current), []);
  // Only a finished fit can be a basis: its residual features are what the call is judged against.
  const fitted = (['A', 'B'] as const).filter((id) => interpretations[id] && fits[id]);
  const basisSlot = draft.basis && fitted.includes(draft.basis) ? draft.basis : fitted.includes(active) ? active : fitted[0];
  const basis = basisSlot ? interpretations[basisSlot] : undefined;
  const claimable = basis ? basis.candidates.filter((id) => id !== basis.internalStandard) : [];
  const phases = draft.phases.filter((id) => claimable.includes(id));
  const basisFit = basisSlot ? fits[basisSlot] : undefined;
  const left = basisFit ? basisFit.features.filter((feature) => feature.kind === 'unexplained') : [];
  const missingLines = Boolean(basisFit?.phases.some((phase) => phase.missing.length >= 2));
  const running = (['tga', 'sem'] as const).filter((kind) => {
    const request = sample[kind];
    return request !== undefined && state.minute < request.readyMinute;
  });
  const missing = !basis ? (pending ? WORD.fitting : failed ? WORD.fitFailed : WORD.fitBasis) : phases.length === 0 ? WORD.claimPhase : !draft.unexplained ? WORD.sayLeft : !draft.decision ? WORD.pickNext : undefined;
  const commit = () => {
    setHolding(false);
    setArmed(false);
    if (basis && !missing) onCommit(basis.id, phases);
  };
  const start = () => {
    if (missing) return;
    window.clearTimeout(hold.current);
    setHolding(true);
    hold.current = window.setTimeout(commit, HOLD_MS);
  };
  const release = () => {
    window.clearTimeout(hold.current);
    setHolding(false);
  };
  const holdKey = (event: KeyboardEvent<HTMLButtonElement>) => event.key === 'Enter' || event.key === ' ';
  return <>
    <div className="xb-field">
      <span className="xb-label">{WORD.basis}</span>
      <div className="xb-seg" role="group" aria-label={ARIA.basis}>
        {(!run || fitted.length === 0) && <span className="xb-line xb-muted">{WORD.noFit}</span>}
        {run && fitted.map((id) => <button key={id} type="button" aria-pressed={basisSlot === id} onClick={() => onDraft({ ...draft, basis: id })}>{id} · R{run.index}</button>)}
      </div>
    </div>
    {basisFit && <p className="xb-line">
      {left.length === 0 ? <span className="xb-muted">{WORD.noneLeft}</span> : <>{left.length} {WORD.left}{left.slice(0, 3).map((feature) => <button key={feature.centreDeg} type="button" className="xb-link" onClick={() => onFocus(feature.centreDeg)}>{degrees(feature.centreDeg, 1)}</button>)}</>}
      {missingLines && <span className="xb-warn"> · {LIMIT_COPY['missing-lines'].word}</span>}
    </p>}
    <div className="xb-field">
      <span className="xb-label">{WORD.claim}</span>
      <div className="xb-chips">
        {claimable.length === 0 && <span className="xb-muted">{WORD.fromBasis}</span>}
        {claimable.map((id) => <button key={id} type="button" className="xb-chip" aria-pressed={phases.includes(id)} onClick={() => onDraft({ ...draft, phases: phases.includes(id) ? phases.filter((item) => item !== id) : [...phases, id] })}>
          <i style={{ background: phaseColor(id) }} />{phaseLabel(id)}
        </button>)}
      </div>
    </div>
    <Options label={WORD.unexplained} value={draft.unexplained ?? ('' as Unexplained)} options={(Object.keys(UNEXPLAINED_LABEL) as Unexplained[]).map((item) => [item, UNEXPLAINED_LABEL[item]] as const)} onChange={(unexplained) => onDraft({ ...draft, unexplained })} />
    <div className="xb-field">
      <span className="xb-label">{WORD.next}</span>
      <div className="xb-decisions" role="group" aria-label={ARIA.next}>
        {DECISIONS.map((decision) => <button key={decision} type="button" aria-pressed={draft.decision === decision} onClick={() => onDraft({ ...draft, decision })}>{DECISION_LABELS[decision].toUpperCase()}</button>)}
      </div>
    </div>
    {running.length > 0 && <p className="xb-line xb-warn">{running.map((kind) => `${TEST_LABEL[kind]} ${WORD.running}`).join(' · ')}</p>}
    <button
      type="button"
      className="xb-primary xb-hold"
      data-holding={holding || undefined}
      disabled={Boolean(missing)}
      aria-keyshortcuts="Enter"
      onPointerDown={(event) => {
        if (event.button === 0) start();
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onKeyDown={(event) => {
        if (!holdKey(event)) return;
        event.preventDefault();
        if (!event.repeat) start();
      }}
      onKeyUp={(event) => {
        if (!holdKey(event)) return;
        event.preventDefault();
        release();
      }}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        // Assistive technology clicks without a pointer or key hold: press twice instead.
        if (event.detail !== 0) return;
        if (armed) commit();
        else setArmed(true);
      }}
      onBlur={() => {
        release();
        setArmed(false);
      }}
    >{missing ?? (armed ? WORD.pressAgain : WORD.hold)}</button>
  </>;
}

function GradeMark({ grade }: { readonly grade: Grade }) {
  return <svg className="xb-mark" data-grade={grade} viewBox="0 0 16 16" role="img" aria-label={GRADE_WORD[grade]}>
    <circle cx="8" cy="8" r={grade === 'good' ? 7 : 6.25} />
    {grade === 'good' && <path d="M4.6 8.3l2.3 2.3 4.5-4.7" />}
    {grade === 'mixed' && <path d="M8 1.75a6.25 6.25 0 0 0 0 12.5z" />}
    {grade === 'poor' && <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />}
  </svg>;
}

function DebriefView({ report, tried, hasNext, onNext, onNewShift, onClose }: {
  readonly report?: Debrief;
  readonly tried: number;
  readonly hasNext: boolean;
  readonly onNext: () => void;
  readonly onNewShift: () => void;
  readonly onClose: () => void;
}) {
  const [open, setOpen] = useState<string>();
  if (!report) return <p className="xb-line xb-muted" role="status">{WORD.reviewing}</p>;
  return <div className="xb-debrief">
    <h3 className="xb-title">{report.code} {WORD.committed}</h3>
    <p className="xb-line xb-muted">{debriefCounts(report, tried)}</p>
    <ul className="xb-list">
      {report.rows.map((row) => <li key={row.id}>
        <button type="button" className="xb-row" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? undefined : row.id)}>
          <b><GradeMark grade={row.grade} />{ROW_LABEL[row.id]}</b>
          {row.notes.slice(0, open === row.id ? 3 : 1).map((note) => <span key={note}>{note}</span>)}
        </button>
      </li>)}
    </ul>
    <span className="xb-label">{WORD.inPowder}</span>
    <ul className="xb-truth">
      {report.truth.map((phase) => <li key={phase.id} data-claimed={phase.claimed || undefined} data-noref={!phase.inLibrary || undefined}>
        <i style={{ background: phaseColor(phase.id) }} />
        <b>{phaseLabel(phase.id)}</b>
        <span>{BAND_LABEL[phase.band]}</span>
        {!phase.inLibrary && <span>{UNEXPLAINED_LABEL.reference}</span>}
        <span className="xb-hidden">{phase.claimed ? WORD.claimed : WORD.notClaimed}</span>
      </li>)}
    </ul>
    <p className="xb-line">{report.objectiveMet ? WORD.aimMet : WORD.aimMissed}</p>
    <p className="xb-line">{WORD.wouldWork} {report.fixes.length > 0 ? report.fixes.map((fix) => DECISION_LABELS[fix].toUpperCase()).join(' / ') : WORD.none}</p>
    <div className="xb-actions">
      {hasNext
        ? <button type="button" className="xb-primary" onClick={onNext}>{WORD.nextSample}</button>
        : <button type="button" className="xb-primary" onClick={onNewShift}>{WORD.newShift}</button>}
      <button type="button" className="xb-secondary" onClick={onClose}>{WORD.close}</button>
    </div>
  </div>;
}
