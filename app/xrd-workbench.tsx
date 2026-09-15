'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useModalFocusTrap } from './mission-ui';
import { BAND_LABEL, COMPARISON_WORD, DATA_LIMITS, ERROR_WORD, FEATURE_WORD, GRIND_LABEL, LIMIT_COPY, PROGRAM_LABEL, PROGRAM_ORDER, ROW_LABEL, SPIKE_LABEL, STATUS_WORD, SWEEP_MS, UNEXPLAINED_LABEL, formatCounts, mountLabel, phaseLabel } from './xrd-bench/copy';
import { dispatch, newShift, useAnalysesReady, useAnalysis, useLab } from './xrd-bench/session';
import { PatternPlot, phaseColor, type PlotRange } from './xrd-plot';
import { compareExplanations, type AnalysisResult, type Comparison } from './xrd/analysis';
import { CASE_CODES, sampleCase } from './xrd/cases';
import { chemicalSupport } from './xrd/context';
import {
  DECISIONS,
  DECISION_LABELS,
  SHIFT_MINUTES,
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
  type Grade,
  type LabState,
  type Limitation,
  type MountChoice,
  type SampleState,
  type Unexplained,
} from './xrd/lab';
import type { Grind, ProgramId, SpikeKind } from './xrd/measure';
import { linesNear, referenceLines } from './xrd/probe';
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
  readonly unexplained: Unexplained;
  readonly grades: readonly Grade[];
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

const MAX_CHIPS = 4;
const EMPTY_CALL: CallDraft = { phases: [] };
const HOLD_MS = 700;

/** What the bench remembers between openings. */
const memory = { code: CASE_CODES[0], slots: new Map<string, Slots>(), reported: new Set<string>() };

const degrees = (value: number, digits = 2) => `${value.toFixed(digits)}°`;
const flagWord = (words: readonly string[]) => (words.length === 0 ? 'NO FLAGS' : words.length === 1 ? words[0] : `${words.length} FLAGS`);

function initialSlots(sample: SampleState): Slots {
  const latest = sample.runs[sample.runs.length - 1];
  const fits = latest ? sample.interpretations.filter((item) => item.runId === latest.id) : [];
  const own = (item?: Interpretation) => (item ? item.candidates.filter((id) => id !== item.internalStandard) : []);
  return { A: own(fits[0]), B: own(fits[1]) };
}

function mountDraft(sample: SampleState): MountChoice {
  const mount = currentMount(sample);
  return { aliquot: 'same', method: mount.method, grind: mount.grind, spike: mount.spike, spin: mount.spin };
}

function slotDraft(state: LabState, run: RunRecord, set: readonly string[]) {
  const spike = run.mount.spike === 'none' ? undefined : run.mount.spike;
  const candidates = [...new Set([...set, ...(spike ? [spike] : [])])].sort();
  return { runId: run.id, candidates, internalStandard: spike, zeroDeg: state.zeroDeg };
}

function runContext(sample: SampleState, run?: RunRecord): XrdRunContext {
  return {
    sampleId: sample.code,
    sampleName: sampleCase(sample.code).record.title,
    prep: mountLabel(run?.mount ?? currentMount(sample)),
    scan: run ? PROGRAM_LABEL[run.acquisition.program] : 'SURVEY',
    scanMinutes: run?.acquisition.minutes ?? 0,
    runNumber: run?.index ?? 0,
  };
}

function runName(run: RunRecord) {
  const { acquisition } = run;
  return acquisition.program === 'targeted' ? `R${run.index} ${degrees((acquisition.range.startDeg + acquisition.range.endDeg) / 2, 1)}` : `R${run.index} ${PROGRAM_LABEL[acquisition.program]}`;
}

function sampleStatus(state: LabState, sample: SampleState) {
  if (sample.call) return 'COMMITTED';
  if (tgaStatus(state, sample.code).status === 'ready' || semStatus(state, sample.code).status === 'ready') return 'TEST READY';
  return sample.runs.length > 0 || sample.revealed.length > 0 || sample.mounts.length > 1 ? 'OPEN' : 'NEW';
}

/** Residual significance over one peak width around an angle. */
function residualAt(run: RunRecord, fit: AnalysisResult, deg: number) {
  const index = Math.round((deg - run.grid.startDeg) / run.grid.stepDeg);
  const half = Math.max(1, Math.round(fit.pointsPerFwhm / 2));
  let difference = 0;
  let calculated = 0;
  for (let i = Math.max(0, index - half); i <= Math.min(run.grid.count - 1, index + half); i += 1) {
    difference += run.counts[i] - fit.calculated[i];
    calculated += fit.calculated[i];
  }
  return difference / Math.sqrt(Math.max(calculated, 1));
}

function costText(state: LabState, action: Action, label: string) {
  const cost = costOf(state, action);
  if (typeof cost === 'string') return { label: ERROR_WORD[cost], disabled: true };
  const parts = [label];
  if (cost.minutes > 0) parts.push(`${cost.minutes} MIN`);
  if (cost.powderG > 0) parts.push(`${Number(cost.powderG.toFixed(3))} G`);
  return { label: parts.join(' · '), disabled: false };
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function XrdWorkbench({ stage, result, onStage, onResult, onClose }: {
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
  const [slots, setSlots] = useState<Slots>(() => memory.slots.get(code) ?? initialSlots(sample));
  const [active, setActive] = useState<SlotId>('A');
  const [chip, setChip] = useState<string>();
  const [picker, setPicker] = useState(false);
  const [probeDeg, setProbeDeg] = useState<number>();
  const [sheet, setSheet] = useState<Sheet>(sample.call ? 'decide' : sample.runs.length > 0 ? 'support' : 'data');
  const [draft, setDraft] = useState<MountChoice>(() => mountDraft(sample));
  const [callDraft, setCallDraft] = useState<CallDraft>(EMPTY_CALL);
  const [focus, setFocus] = useState<PlotRange & { key: number }>();
  const [notice, setNotice] = useState<string>();
  const [sweep, setSweep] = useState<Sweep>();
  const [revealDeg, setRevealDeg] = useState<number>();
  const timers = useRef<number[]>([]);
  /** The stage a running door or scan sequence ends on, emitted once if the sequence is cut short. */
  const pending = useRef<{ readonly stage: XrdBenchStage; readonly context: XrdRunContext } | undefined>(undefined);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((id) => window.clearTimeout(id));
  }, []);
  const later = (ms: number, task: () => void) => {
    timers.current.push(window.setTimeout(task, ms));
  };
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const settle = () => {
    clearTimers();
    const final = pending.current;
    pending.current = undefined;
    if (final) onStage(final.stage, final.context);
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
  const spike = run && run.mount.spike !== 'none' ? run.mount.spike : undefined;

  const interpretationFor = (set: readonly string[]) => (run && set.length > 0 ? sample.interpretations.find((item) => sameInterpretation(item, slotDraft(state, run, set))) : undefined);
  const interpA = interpretationFor(slots.A);
  const interpB = interpretationFor(slots.B);
  const fitA = useAnalysis(run, interpA && interpretationOptions(interpA));
  const fitB = useAnalysis(run, interpB && interpretationOptions(interpB));
  const fits = { A: fitA, B: fitB };
  const activeFit = fits[active].result;
  const otherFit = fits[active === 'A' ? 'B' : 'A'].result;
  const activeSet = slots[active];
  const fitting = (id: SlotId) => slots[id].length > 0 && Boolean(run) && !fits[id].result && !fits[id].failed && !sample.call;

  // Chip changes fit after a pause, recording an interpretation that costs no bench time.
  useEffect(() => {
    if (!run || sample.call) return;
    const ids: number[] = [];
    for (const id of ['A', 'B'] as const) {
      const set = slots[id];
      if (set.length === 0) continue;
      const request = slotDraft(state, run, set);
      if (sample.interpretations.some((item) => sameInterpretation(item, request))) continue;
      ids.push(window.setTimeout(() => {
        const outcome = dispatch({ type: 'interpret', code: sample.code, runId: run.id, candidates: request.candidates, standard: request.internalStandard !== undefined, zero: request.zeroDeg !== undefined });
        if (!outcome.ok) setNotice(ERROR_WORD[outcome.error]);
      }, 500));
    }
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [run, sample, slots, state]);

  const comparison: Comparison | undefined = useMemo(() => {
    if (!fitA.result || !fitB.result) return undefined;
    try {
      return compareExplanations(fitA.result, fitB.result);
    } catch {
      return undefined;
    }
  }, [fitA.result, fitB.result]);

  const tickKey = [...activeSet, ...(spike ? [spike] : [])].join(',');
  const ticks = useMemo(() => (tickKey ? tickKey.split(',').map((id) => ({ id, lines: referenceLines(id) })) : []), [tickKey]);

  const limits = activeFit ? limitations(activeFit) : [];
  const unsupported = [...new Set(activeSet.flatMap((id) => chemicalSupport(id, evidence).unsupported))];
  const debriefJobs = useMemo(() => (sample.call ? debriefAnalyses(state, sample.code) : []), [state, sample.call, sample.code]);
  const debriefReady = useAnalysesReady(debriefJobs);
  const report = useMemo(() => (sample.call && debriefReady ? debrief(state, sample.code) : undefined), [state, sample.call, sample.code, debriefReady]);

  useEffect(() => {
    const call = sample.call;
    if (!report || !call) return;
    const key = `${state.seed}/${sample.code}`;
    if (memory.reported.has(key) || (result?.sampleId === sample.code && stage === 'complete')) return;
    memory.reported.add(key);
    const basis = sample.interpretations.find((item) => item.id === call.basis);
    const basisRun = sample.runs.find((item) => item.id === basis?.runId);
    const phases = call.phases.map(phaseLabel);
    onResult({
      ...runContext(sample, basisRun),
      phases,
      decision: DECISION_LABELS[call.decision],
      unexplained: call.unexplained,
      grades: report.rows.map((row) => row.grade),
      supported: report.rows.find((row) => row.id === 'support')?.grade !== 'poor',
      uncertain: call.unexplained !== 'none' || call.decision === 'hold-reference',
      summary: `${phases.join(' + ')} · ${DECISION_LABELS[call.decision].toUpperCase()}`,
    });
  }, [report, sample, state.seed, result, stage, onResult]);

  const resetUi = (next: SampleState) => {
    settle();
    memory.code = next.code;
    setCode(next.code);
    setRunChoice(undefined);
    setSlots(memory.slots.get(next.code) ?? initialSlots(next));
    setActive('A');
    setChip(undefined);
    setPicker(false);
    setProbeDeg(undefined);
    setDraft(mountDraft(next));
    setCallDraft(EMPTY_CALL);
    setFocus(undefined);
    setSweep(undefined);
    setRevealDeg(undefined);
    setSheet(next.call ? 'decide' : next.runs.length > 0 ? 'support' : 'data');
  };

  const chooseSample = (next: string) => {
    const nextSample = sampleState(state, next);
    if (nextSample) resetUi(nextSample);
  };

  const updateSlot = (id: SlotId, set: readonly string[]) => {
    const next = { ...slots, [id]: set };
    memory.slots.set(sample.code, next);
    setSlots(next);
  };

  const addPhase = (id: string) => {
    if (id === spike || activeSet.includes(id)) return;
    if (activeSet.length >= MAX_CHIPS) return setNotice('4 MAX');
    updateSlot(active, [...activeSet, id]);
  };

  const togglePhase = (id: string) => {
    if (activeSet.includes(id)) {
      updateSlot(active, activeSet.filter((item) => item !== id));
      if (chip === id) setChip(undefined);
    } else addPhase(id);
  };

  const finishSweep = (context: XrdRunContext) => {
    pending.current = undefined;
    clearTimers();
    setSweep(undefined);
    setRevealDeg(undefined);
    onStage('review', context);
  };

  const scan = (program: ProgramId, centreDeg?: number) => {
    const outcome = dispatch({ type: 'scan', code: sample.code, program, ...(program === 'targeted' ? { centreDeg } : {}) });
    if (!outcome.ok) return setNotice(ERROR_WORD[outcome.error]);
    const next = sampleState(outcome.state, sample.code);
    const fresh = next?.runs[next.runs.length - 1];
    if (!next || !fresh) return;
    settle();
    setRunChoice(undefined);
    setChip(undefined);
    setFocus(undefined);
    if (program !== 'targeted') setProbeDeg(undefined);
    const context = runContext(next, fresh);
    const doorShut = stage === 'closed' || stage === 'scanning' || stage === 'review' || stage === 'complete';
    const delay = doorShut ? 0 : 1400;
    const ms = reducedMotion() ? 0 : SWEEP_MS[program];
    const end = fresh.grid.startDeg + (fresh.grid.count - 1) * fresh.grid.stepDeg;
    setRevealDeg(fresh.grid.startDeg);
    setSweep({ runId: fresh.id, start: performance.now() + delay, ms, startDeg: fresh.grid.startDeg, endDeg: end });
    if (!doorShut) {
      onStage('loaded', context);
      later(700, () => onStage('closed', context));
      later(delay, () => onStage('scanning', context));
    } else onStage('scanning', context);
    later(delay + ms, () => finishSweep(context));
    pending.current = { stage: 'review', context };
  };

  const mount = () => {
    const outcome = dispatch({ type: 'mount', code: sample.code, choice: draft });
    if (!outcome.ok) return setNotice(ERROR_WORD[outcome.error]);
    const next = sampleState(outcome.state, sample.code);
    if (!next) return;
    setDraft(mountDraft(next));
    const context = runContext(next);
    settle();
    onStage('open', context);
    later(700, () => onStage('loaded', context));
    later(1400, () => {
      pending.current = undefined;
      onStage('closed', context);
    });
    pending.current = { stage: 'closed', context };
  };

  const act = (action: Action) => {
    const outcome = dispatch(action);
    if (!outcome.ok) setNotice(ERROR_WORD[outcome.error]);
    return outcome.ok;
  };

  const probe = (deg: number) => {
    if (sweep && run?.id === sweep.runId) return finishSweep(runContext(sample, run));
    setProbeDeg(deg);
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

  const close = () => {
    settle();
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (picker) setPicker(false);
    else if (chip) setChip(undefined);
    else close();
  };

  const minutesLeft = Math.max(0, SHIFT_MINUTES - state.minute);
  const committed = Boolean(sample.call);
  const dataWords = limits.filter((item) => DATA_LIMITS.includes(item)).map((item) => LIMIT_COPY[item].word);
  const supportWords = [...limits.filter((item) => !DATA_LIMITS.includes(item)).map((item) => LIMIT_COPY[item].word), ...unsupported.map((element) => `${element} UNSUPPORTED`)];
  const aimTarget = `${source.record.objective.targets.map(phaseLabel).join(' + ')}${source.record.objective.zrMolPercent ? ` Zr${source.record.objective.zrMolPercent}` : ''}`;
  const dock: { readonly id: Sheet; readonly label: string; readonly value: string; readonly flag?: boolean }[] = [
    { id: 'data', label: 'DATA', value: !run ? 'NO RUN' : activeFit ? flagWord(dataWords) : runName(run), flag: dataWords.length > 0 },
    { id: 'support', label: 'SUPPORT', value: !activeFit ? (fitting(active) ? 'FITTING' : 'NO FIT') : flagWord(supportWords), flag: supportWords.length > 0 },
    { id: 'aim', label: 'AIM', value: aimTarget, flag: source.cues.some((cue) => !sample.revealed.includes(cue.id)) },
    { id: 'decide', label: 'DECIDE', value: committed ? 'COMMITTED' : callDraft.decision ? DECISION_LABELS[callDraft.decision].toUpperCase() : 'UNSET' },
  ];
  const selectedFit = chip && activeFit?.phases.find((item) => item.id === chip);

  return <div className="xb-backdrop">
    <section ref={dialogRef} className="xb" role="dialog" aria-modal="true" aria-label="XRD bench" onKeyDown={onKeyDown}>
      <header className="xb-top">
        <label className="xb-sample">
          <span className="xb-hidden">Sample</span>
          <select value={sample.code} onChange={(event) => chooseSample(event.target.value)}>
            {state.samples.map((item) => <option key={item.code} value={item.code}>{item.code} · {sampleCase(item.code).record.title} · {sampleStatus(state, item)}</option>)}
          </select>
        </label>
        <div className="xb-clock" data-tone={minutesLeft === 0 ? 'over' : minutesLeft < 60 ? 'low' : undefined}>
          {minutesLeft === 0 ? <b>SHIFT OVER</b> : <><b>{minutesLeft}</b> MIN LEFT</>}
          <i style={{ width: `${(100 * minutesLeft) / SHIFT_MINUTES}%` }} />
        </div>
        <button type="button" className="xb-icon" aria-label="Close bench" onClick={close}>✕</button>
      </header>

      <div className="xb-body">
        <section className="xb-work" aria-label="Pattern">
          <div className="xb-runbar">
            <div className="xb-runs" role="tablist" aria-label="Runs">
              {sample.runs.length === 0 && <span className="xb-muted">NO RUN</span>}
              {sample.runs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === run?.id} onClick={() => { setRunChoice(item.id); setChip(undefined); }}>{runName(item)}</button>)}
            </div>
            {run && sweep?.runId === run.id ? <button type="button" className="xb-link" onClick={() => finishSweep(runContext(sample, run))}>SKIP</button>
              : activeFit && <span className="xb-muted" title="Strongest net peak">{formatCounts(activeFit.peakCounts)}</span>}
          </div>

          <div className="xb-plot">
            {run ? <PatternPlot
              key={run.id}
              grid={run.grid}
              counts={run.counts}
              fit={sweep?.runId === run.id ? undefined : activeFit}
              other={sweep?.runId === run.id ? undefined : otherFit}
              highlight={chip}
              ticks={ticks}
              probeDeg={probeDeg}
              onProbe={probe}
              revealDeg={sweep?.runId === run.id ? revealDeg : undefined}
              focus={focus}
              label={`${runName(run)} pattern of ${sample.code}. Tap to probe an angle; drag to pan; pinch or scroll to zoom.`}
            /> : <div className="xb-empty">
              <span>NO RUN</span>
              <PrimaryCost state={state} action={{ type: 'scan', code: sample.code, program: 'survey' }} label="SCAN" onRun={() => scan('survey')} />
            </div>}
            {fitting(active) && !sweep && <div className="xb-fitting" role="status">FITTING</div>}
            {notice && <div className="xb-notice" role="status">{notice}</div>}
          </div>

          {run && probeDeg !== undefined && <ProbeCard
            state={state}
            sample={sample}
            run={run}
            deg={probeDeg}
            fit={activeFit}
            library={library}
            slot={active}
            set={activeSet}
            spike={spike}
            committed={committed}
            onAdd={addPhase}
            onTarget={() => scan('targeted', probeDeg)}
            onClose={() => setProbeDeg(undefined)}
          />}

          {run && <div className="xb-slots">
            {(['A', 'B'] as const).map((id) => <div key={id} className="xb-slot" data-slot={id} data-active={id === active || undefined}>
              <button type="button" className="xb-slot-name" aria-pressed={id === active} onClick={() => { setActive(id); setChip(undefined); }}>{id}</button>
              <div className="xb-chips">
                {slots[id].map((phase) => {
                  const fit = fits[id].result?.phases.find((item) => item.id === phase);
                  return <button key={phase} type="button" className="xb-chip" data-status={fit?.status} aria-pressed={id === active && chip === phase} onClick={() => { setActive(id); setChip(id === active && chip === phase ? undefined : phase); setPicker(false); }}>
                    <i style={{ background: phaseColor(phase) }} />{phaseLabel(phase)}
                  </button>;
                })}
                {spike && slots[id].length > 0 && <span className="xb-chip" data-locked title="Internal standard">{SPIKE_LABEL[spike]} STD</span>}
                {!committed && slots[id].length < MAX_CHIPS && <button type="button" className="xb-add" aria-label={`Add reference to ${id}`} aria-expanded={picker && id === active} onClick={() => { setActive(id); setChip(undefined); setPicker(!(picker && id === active)); }}>+</button>}
              </div>
              {id === 'A' && <CompareWord comparison={comparison} pending={fitting('A') || fitting('B')} />}
            </div>)}
          </div>}

          {picker && run && <div className="xb-picker">
            <div className="xb-seg" role="group" aria-label="Search">
              <button type="button" aria-pressed={!sample.broadened} onClick={() => act({ type: 'broaden', code: sample.code, on: false })}>RECORD</button>
              <button type="button" aria-pressed={sample.broadened} onClick={() => act({ type: 'broaden', code: sample.code, on: true })}>ALL</button>
            </div>
            <div className="xb-chips">
              {library.filter((id) => id !== spike).map((id) => <button key={id} type="button" className="xb-chip" aria-pressed={activeSet.includes(id)} onClick={() => togglePhase(id)}>
                <i style={{ background: phaseColor(id) }} />{phaseLabel(id)}{!chemicalSupport(id, evidence).supported && <em className="xb-dot" title="Elements not on record" />}
              </button>)}
            </div>
          </div>}

          {chip && !picker && <div className="xb-detail">
            <b style={{ color: phaseColor(chip) }}>{phaseLabel(chip)}</b>
            {selectedFit ? <>
              <span>{STATUS_WORD[selectedFit.status]}</span>
              <span>{selectedFit.detected.length} SEEN · {selectedFit.missing.length} ABSENT</span>
              {selectedFit.indistinguishableFrom.length > 0 && <span className="xb-warn">LOOKS LIKE {selectedFit.indistinguishableFrom.map(phaseLabel).join(', ')}</span>}
            </> : <span className="xb-muted">FITTING</span>}
            {chemicalSupport(chip, evidence).unsupported.map((element) => <span key={element} className="xb-warn">{element} UNSUPPORTED</span>)}
            {!committed && <button type="button" className="xb-link" onClick={() => togglePhase(chip)}>REMOVE</button>}
          </div>}
        </section>

        <nav className="xb-tabs" role="tablist" aria-label="Bench">
          {dock.map((cell) => <button key={cell.id} type="button" role="tab" aria-selected={sheet === cell.id} onClick={() => setSheet(cell.id)}>
            <b>{cell.label}{cell.flag && <em className="xb-dot" />}</b>
            <span>{cell.value}</span>
          </button>)}
        </nav>

        <section className="xb-sheet" role="tabpanel" aria-label={dock.find((cell) => cell.id === sheet)?.label}>
          {sheet === 'data' && <DataSheet state={state} sample={sample} run={run} probeDeg={probeDeg} draft={draft} onDraft={setDraft} onScan={scan} onMount={mount} onAct={act} onView={(id) => { setRunChoice(id); setChip(undefined); }} />}
          {sheet === 'support' && <SupportSheet state={state} sample={sample} fit={activeFit} pending={fitting(active)} limits={limits} unsupported={unsupported} onLimit={focusLimit} onAct={act} />}
          {sheet === 'aim' && <AimSheet state={state} sample={sample} onAct={act} />}
          {sheet === 'decide' && (committed
            ? <DebriefView report={report} tried={sample.interpretations.length} onNext={() => {
              const next = state.samples.find((item) => !item.call && item.code !== sample.code);
              if (next) resetUi(next);
            }} onNewShift={() => {
              memory.slots.clear();
              memory.reported.clear();
              const fresh = newShift();
              resetUi(fresh.samples[0]);
            }} />
            : <DecideSheet
              slots={slots}
              interpretations={{ A: interpA, B: interpB }}
              run={run}
              draft={callDraft}
              fits={{ A: fitA.result, B: fitB.result }}
              onFocus={(deg) => focusOn(deg)}
              onDraft={setCallDraft}
              onCommit={(basis) => {
                const { phases, unexplained, decision } = callDraft;
                if (!unexplained || !decision) return;
                act({ type: 'call', code: sample.code, phases, unexplained, decision, basis });
              }}
            />)}
        </section>
      </div>
    </section>
  </div>;
}

function PrimaryCost({ state, action, label, onRun, secondary = false }: { readonly state: LabState; readonly action: Action; readonly label: string; readonly onRun: () => void; readonly secondary?: boolean }) {
  const cost = costText(state, action, label);
  return <button type="button" className={secondary ? 'xb-secondary' : 'xb-primary'} disabled={cost.disabled} onClick={onRun}>{cost.label}</button>;
}

function CompareWord({ comparison, pending }: { readonly comparison?: Comparison; readonly pending: boolean }) {
  const [open, setOpen] = useState(false);
  if (pending) return <span className="xb-compare xb-muted">FITTING</span>;
  if (!comparison) return <span className="xb-compare xb-muted">A · B</span>;
  return <button type="button" className="xb-compare" data-tone={comparison} aria-expanded={open} onClick={() => setOpen(!open)}>
    {COMPARISON_WORD[comparison]}
    {open && <small>Fit comparison, not proof</small>}
  </button>;
}

function ProbeCard({ state, sample, run, deg, fit, library, slot, set, spike, committed, onAdd, onTarget, onClose }: {
  readonly state: LabState;
  readonly sample: SampleState;
  readonly run: RunRecord;
  readonly deg: number;
  readonly fit?: AnalysisResult;
  readonly library: readonly string[];
  readonly slot: SlotId;
  readonly set: readonly string[];
  readonly spike?: SpikeKind;
  readonly committed: boolean;
  readonly onAdd: (id: string) => void;
  readonly onTarget: () => void;
  readonly onClose: () => void;
}) {
  const hits = new Map<string, number>();
  for (const hit of linesNear(deg, library)) if (hit.phaseId !== spike) hits.set(hit.phaseId, Math.max(hits.get(hit.phaseId) ?? 0, hit.relative));
  // Catalogue order, never strength order, so the list does not rank the answers.
  const grouped = library.filter((id) => hits.has(id)).map((id) => [id, hits.get(id) ?? 0] as const);
  const z = fit ? residualAt(run, fit, deg) : undefined;
  const step = run.grid.stepDeg;
  const feature = fit?.features.find((item) => deg >= item.startDeg - step && deg <= item.endDeg + step);
  return <div className="xb-probe">
    <div className="xb-probe-head">
      <b>{degrees(deg)}</b>
      {z !== undefined && <span className={Math.abs(z) >= 4 ? 'xb-warn' : 'xb-muted'}>z {z >= 0 ? '+' : '−'}{Math.abs(z).toFixed(1)}</span>}
      {feature && <span className="xb-warn">{FEATURE_WORD[feature.kind]}</span>}
      <button type="button" className="xb-icon xb-icon-small" aria-label="Clear probe" onClick={onClose}>✕</button>
    </div>
    <div className="xb-chips">
      {grouped.length === 0 && <span className="xb-muted">NO LIBRARY LINES{sample.broadened ? '' : ' IN RECORD SEARCH'}</span>}
      {grouped.slice(0, MAX_CHIPS).map(([id, relative]) => <button key={id} type="button" className="xb-chip" aria-pressed={set.includes(id)} disabled={committed || set.includes(id)} onClick={() => onAdd(id)} title={`Add to ${slot}`}>
        <i style={{ background: phaseColor(id) }} />{phaseLabel(id)}<span className="xb-strength" aria-label={relative >= 0.5 ? 'strong line' : relative >= 0.15 ? 'medium line' : 'weak line'}>{relative >= 0.5 ? '▮▮▮' : relative >= 0.15 ? '▮▮' : '▮'}</span>
      </button>)}
      {grouped.length > MAX_CHIPS && <span className="xb-muted">+{grouped.length - MAX_CHIPS}</span>}
    </div>
    {!committed && run.acquisition.program !== 'targeted' && <PrimaryCost state={state} secondary action={{ type: 'scan', code: sample.code, program: 'targeted', centreDeg: deg }} label="SCAN HERE" onRun={onTarget} />}
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

function DataSheet({ state, sample, run, probeDeg, draft, onDraft, onScan, onMount, onAct, onView }: {
  readonly state: LabState;
  readonly sample: SampleState;
  readonly run?: RunRecord;
  readonly probeDeg?: number;
  readonly draft: MountChoice;
  readonly onDraft: (draft: MountChoice) => void;
  readonly onScan: (program: ProgramId, centreDeg?: number) => void;
  readonly onMount: () => void;
  readonly onAct: (action: Action) => boolean;
  readonly onView: (runId: string) => void;
}) {
  const [tab, setTab] = useState<'scan' | 'prep'>('scan');
  const [program, setProgram] = useState<ProgramId>('survey');
  const mount = currentMount(sample);
  const centre = program === 'targeted' ? probeDeg : undefined;
  const scanAction: Action = { type: 'scan', code: sample.code, program, ...(centre === undefined ? {} : { centreDeg: centre }) };
  const grindRank: Readonly<Record<Grind, number>> = { 'as-received': 0, hand: 1, extended: 2 };
  const same = draft.aliquot === 'same';
  return <>
    <Tabs value={tab} options={[['scan', 'SCAN'], ['prep', 'PREP']]} onChange={setTab} />
    {tab === 'scan' ? <>
      <p className="xb-line">ON M{mount.index} · {mountLabel(mount)}</p>
      <div className="xb-programs" role="group" aria-label="Program">
        {PROGRAM_ORDER.map((id) => {
          const cost = costOf(state, { type: 'scan', code: sample.code, program: id, centreDeg: probeDeg ?? 33 });
          return <button key={id} type="button" aria-pressed={program === id} onClick={() => setProgram(id)}>
            <b>{PROGRAM_LABEL[id]}</b><span>{typeof cost === 'string' ? ERROR_WORD[cost] : `${cost.minutes} MIN`}</span>
          </button>;
        })}
      </div>
      {program === 'targeted' && probeDeg === undefined
        ? <p className="xb-line xb-muted">TAP THE PLOT FOR A CENTRE</p>
        : <PrimaryCost state={state} action={scanAction} label={program === 'targeted' && centre !== undefined ? `SCAN ${degrees(centre, 1)}` : 'SCAN'} onRun={() => onScan(program, centre)} />}
      <div className="xb-field">
        <span className="xb-label">ZERO {state.zeroDeg === undefined ? 'UNCHECKED' : degrees(state.zeroDeg, 3)}</span>
        <PrimaryCost state={state} secondary action={{ type: 'standard' }} label="ZERO CHECK" onRun={() => onAct({ type: 'standard' })} />
      </div>
      {sample.runs.length > 0 && <ul className="xb-list" aria-label="Runs">
        {[...sample.runs].reverse().map((item) => <li key={item.id} data-active={item.id === run?.id || undefined}>
          <button type="button" className="xb-row" onClick={() => onView(item.id)}><b>{runName(item)}</b><span>M{item.mount.index} · {mountLabel(item.mount)}</span></button>
          {!sample.call && <button type="button" className="xb-link" onClick={() => { setProgram(item.acquisition.program); if (item.acquisition.program !== 'targeted') onScan(item.acquisition.program); else onScan('targeted', (item.acquisition.range.startDeg + item.acquisition.range.endDeg) / 2); }}>RERUN</button>}
        </li>)}
      </ul>}
    </> : <>
      <p className="xb-line">JAR {powderLeftG(state, sample.code).toFixed(2)} G · M{mount.index} {mountLabel(mount)}</p>
      <Options label="ALIQUOT" value={draft.aliquot} options={[['same', 'SAME'], ['new', 'NEW']]} onChange={(aliquot) => onDraft(aliquot === 'new' ? { ...draft, aliquot } : { ...draft, aliquot, grind: grindRank[draft.grind] < grindRank[mount.grind] ? mount.grind : draft.grind, spike: mount.spike === 'none' ? draft.spike : mount.spike })} />
      <Options label="GRIND" value={draft.grind} options={(Object.keys(GRIND_LABEL) as Grind[]).map((grind) => [grind, GRIND_LABEL[grind]] as const)} onChange={(grind) => onDraft({ ...draft, grind })} disabled={(grind) => same && grindRank[grind] < grindRank[mount.grind]} />
      <Options label="SPIN" value={draft.spin} options={[[false, 'OFF'], [true, 'ON']]} onChange={(spin) => onDraft({ ...draft, spin })} />
      <Options label="LOAD" value={draft.method} options={[['front', 'FRONT'], ['back', 'BACK']]} onChange={(method) => onDraft({ ...draft, method })} />
      <Options label="SPIKE" value={draft.spike} options={(Object.keys(SPIKE_LABEL) as SpikeKind[]).map((kind) => [kind, SPIKE_LABEL[kind]] as const)} onChange={(spike) => onDraft({ ...draft, spike })} disabled={(kind) => same && mount.spike !== 'none' && kind !== mount.spike} />
      <PrimaryCost state={state} action={{ type: 'mount', code: sample.code, choice: draft }} label="MOUNT" onRun={() => { onMount(); setTab('scan'); }} />
    </>}
  </>;
}

function SupportSheet({ state, sample, fit, pending, limits, unsupported, onLimit, onAct }: {
  readonly state: LabState;
  readonly sample: SampleState;
  readonly fit?: AnalysisResult;
  readonly pending: boolean;
  readonly limits: readonly Limitation[];
  readonly unsupported: readonly string[];
  readonly onLimit: (limit: Limitation) => void;
  readonly onAct: (action: Action) => boolean;
}) {
  const [tab, setTab] = useState<'limits' | 'tests'>('limits');
  const tga = tgaStatus(state, sample.code);
  const sem = semStatus(state, sample.code);
  const [particle, setParticle] = useState<number>();
  const running = [tga, sem].filter((item) => item.status === 'running').map((item) => (item.status === 'running' ? item.readyMinute : 0));
  const waitMinutes = running.length > 0 ? Math.min(...running) - state.minute : 0;
  return <>
    <Tabs value={tab} options={[['limits', 'LIMITS'], ['tests', 'TESTS']]} onChange={setTab} />
    {tab === 'limits' ? <>
      {!fit && <p className="xb-line xb-muted">{pending ? 'FITTING' : 'ADD A REFERENCE TO A OR B'}</p>}
      {fit && limits.length === 0 && unsupported.length === 0 && <p className="xb-line xb-muted">NO FLAGS</p>}
      <ul className="xb-list">
        {limits.map((limit) => <li key={limit}>
          <button type="button" className="xb-row" onClick={() => onLimit(limit)}><b className="xb-warn">{LIMIT_COPY[limit].word}</b><span>{LIMIT_COPY[limit].line}</span></button>
        </li>)}
        {unsupported.map((element) => <li key={element}>
          <div className="xb-row"><b className="xb-warn">{element} UNSUPPORTED</b><span>No record, note or EDS for {element}</span></div>
        </li>)}
      </ul>
    </> : <>
      <p className="xb-line xb-muted">TGA {slotsLeft(state, 'tga')} · SEM {slotsLeft(state, 'sem')} SLOTS LEFT FOR THE SHIFT</p>
      <div className="xb-test">
        <div className="xb-test-head"><b>TGA</b><span>Mass loss to 1000 °C</span></div>
        {tga.status === 'none' && <PrimaryCost state={state} secondary action={{ type: 'tga', code: sample.code }} label="SEND TGA" onRun={() => onAct({ type: 'tga', code: sample.code })} />}
        {tga.status === 'running' && <p className="xb-line xb-muted">READY IN {tga.readyMinute - state.minute} MIN</p>}
        {tga.status === 'ready' && <ul className="xb-steps">
          {tga.result.steps.length === 0 && <li className="xb-muted">NO STEP ABOVE {tga.result.detectionPercent}%</li>}
          {tga.result.steps.map((step) => <li key={step.fromC}><span>{step.fromC}–{step.toC} °C</span><b>{step.lossPercent.toFixed(1)}%</b></li>)}
        </ul>}
      </div>
      <div className="xb-test">
        <div className="xb-test-head"><b>SEM/EDS</b><span>Elements over 8 particles</span></div>
        {sem.status === 'none' && <PrimaryCost state={state} secondary action={{ type: 'sem', code: sample.code }} label="SEND SEM/EDS" onRun={() => onAct({ type: 'sem', code: sample.code })} />}
        {sem.status === 'running' && <p className="xb-line xb-muted">READY IN {sem.readyMinute - state.minute} MIN</p>}
        {sem.status === 'ready' && <>
          <div className="xb-pills">
            {sem.result.area.map((signal) => <span key={signal.element} className="xb-pill" data-dim={signal.artefact ? true : undefined}>{signal.element} {signal.artefact ? signal.artefact.toUpperCase() : signal.level.toUpperCase()}</span>)}
            {sem.result.unresolved.map((item) => <span key={item.element} className="xb-pill xb-warn">{item.element} HIDDEN BY {item.hiddenBy}</span>)}
          </div>
          <div className="xb-particles" aria-label="Particles">
            {sem.result.spots.map((_, index) => <button key={index} type="button" aria-pressed={particle === index} aria-label={`Particle ${index + 1}`} onClick={() => setParticle(particle === index ? undefined : index)} />)}
            {particle !== undefined && <span>{sem.result.spots[particle].join(' · ') || 'NO HEAVY ELEMENTS'}</span>}
          </div>
        </>}
      </div>
      {waitMinutes > 0 && <PrimaryCost state={state} secondary action={{ type: 'wait', minutes: waitMinutes }} label="WAIT" onRun={() => onAct({ type: 'wait', minutes: waitMinutes })} />}
    </>}
  </>;
}

function AimSheet({ state, sample, onAct }: { readonly state: LabState; readonly sample: SampleState; readonly onAct: (action: Action) => boolean }) {
  const { record, cues } = sampleCase(sample.code);
  const evidence = evidenceFor(state, sample.code);
  const sources = new Map<string, string[]>();
  for (const item of evidence) sources.set(item.element, [...(sources.get(item.element) ?? []), item.source === 'notebook' ? 'NOTE' : item.source.toUpperCase()]);
  return <>
    <h3 className="xb-title">{record.objective.label}</h3>
    <ul className="xb-facts">
      {record.facts.map((fact) => <li key={fact}>{fact}</li>)}
      {record.hypotheses.map((item) => <li key={item} className="xb-muted">EXPECTED · {item}</li>)}
      {record.missing.map((field) => <li key={field} className="xb-warn">BLANK · {field}</li>)}
    </ul>
    <div className="xb-pills">
      {[...sources].map(([element, from]) => <span key={element} className="xb-pill">{element} {[...new Set(from)].join('+')}</span>)}
    </div>
    <ul className="xb-list">
      {cues.map((cue) => <li key={cue.id}>
        <div className="xb-row"><b>{cue.label}</b>{sample.revealed.includes(cue.id) && <span>{cue.text}</span>}</div>
        {!sample.revealed.includes(cue.id) && <PrimaryCost state={state} secondary action={{ type: 'inspect', code: sample.code, cue: cue.id }} label="INSPECT" onRun={() => onAct({ type: 'inspect', code: sample.code, cue: cue.id })} />}
      </li>)}
    </ul>
  </>;
}

function DecideSheet({ slots, interpretations, run, draft, fits, onFocus, onDraft, onCommit }: {
  readonly slots: Slots;
  readonly interpretations: Readonly<Record<SlotId, Interpretation | undefined>>;
  readonly run?: RunRecord;
  readonly draft: CallDraft;
  readonly fits: Readonly<Record<SlotId, AnalysisResult | undefined>>;
  readonly onFocus: (deg: number) => void;
  readonly onDraft: (draft: CallDraft) => void;
  readonly onCommit: (basisId: string) => void;
}) {
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const hold = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hold.current), []);
  const basis = draft.basis && interpretations[draft.basis];
  const claimable = basis ? basis.candidates.filter((id) => id !== basis.internalStandard) : [];
  const basisFit = draft.basis ? fits[draft.basis] : undefined;
  const left = basisFit ? basisFit.features.filter((feature) => feature.kind === 'unexplained') : [];
  const missingLines = Boolean(basisFit?.phases.some((phase) => phase.missing.length >= 2));
  const missing = !basis ? 'FIT A BASIS' : draft.phases.length === 0 ? 'CLAIM A PHASE' : !draft.unexplained ? 'SAY WHAT IS LEFT' : !draft.decision ? 'PICK NEXT' : undefined;
  const commit = () => {
    setHolding(false);
    setArmed(false);
    if (basis && !missing) onCommit(basis.id);
  };
  const release = () => {
    window.clearTimeout(hold.current);
    setHolding(false);
  };
  const chooseBasis = (id: SlotId) => {
    const next = interpretations[id];
    onDraft({ ...draft, basis: id, phases: draft.phases.filter((phase) => next?.candidates.includes(phase)) });
  };
  return <>
    <div className="xb-field">
      <span className="xb-label">BASIS</span>
      <div className="xb-seg" role="group" aria-label="Basis">
        {(['A', 'B'] as const).map((id) => <button key={id} type="button" aria-pressed={draft.basis === id} disabled={!interpretations[id]} onClick={() => chooseBasis(id)}>{id}{run && interpretations[id] ? ` · R${run.index}` : slots[id].length > 0 ? ' · FITTING' : ' · EMPTY'}</button>)}
      </div>
    </div>
    {basisFit && <p className="xb-line">
      {left.length === 0 ? <span className="xb-muted">NONE LEFT</span> : <>{left.length} LEFT{left.slice(0, 3).map((feature) => <button key={feature.centreDeg} type="button" className="xb-link" onClick={() => onFocus(feature.centreDeg)}>{degrees(feature.centreDeg, 1)}</button>)}</>}
      {missingLines && <span className="xb-warn"> · MISSING LINES</span>}
    </p>}
    <div className="xb-field">
      <span className="xb-label">CLAIM</span>
      <div className="xb-chips">
        {claimable.length === 0 && <span className="xb-muted">FROM THE BASIS</span>}
        {claimable.map((id) => <button key={id} type="button" className="xb-chip" aria-pressed={draft.phases.includes(id)} onClick={() => onDraft({ ...draft, phases: draft.phases.includes(id) ? draft.phases.filter((item) => item !== id) : [...draft.phases, id] })}>
          <i style={{ background: phaseColor(id) }} />{phaseLabel(id)}
        </button>)}
      </div>
    </div>
    <Options label="UNEXPLAINED" value={draft.unexplained ?? ('' as Unexplained)} options={(Object.keys(UNEXPLAINED_LABEL) as Unexplained[]).map((item) => [item, UNEXPLAINED_LABEL[item]] as const)} onChange={(unexplained) => onDraft({ ...draft, unexplained })} />
    <div className="xb-field">
      <span className="xb-label">NEXT</span>
      <div className="xb-decisions" role="group" aria-label="Next">
        {DECISIONS.map((decision) => <button key={decision} type="button" aria-pressed={draft.decision === decision} onClick={() => onDraft({ ...draft, decision })}>{DECISION_LABELS[decision].toUpperCase()}</button>)}
      </div>
    </div>
    <button
      type="button"
      className="xb-primary xb-hold"
      data-holding={holding || undefined}
      disabled={Boolean(missing)}
      onPointerDown={(event) => {
        if (event.button !== 0 || missing) return;
        setHolding(true);
        hold.current = window.setTimeout(commit, HOLD_MS);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (event.detail !== 0) return;
        if (armed) commit();
        else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
    >{missing ?? (armed ? 'PRESS AGAIN TO COMMIT' : 'HOLD TO COMMIT')}</button>
  </>;
}

function GradeMark({ grade }: { readonly grade: Grade }) {
  return <svg className="xb-mark" data-grade={grade} viewBox="0 0 16 16" aria-label={grade === 'good' ? 'good' : grade === 'mixed' ? 'mixed' : 'poor'} role="img">
    {grade === 'good' && <path d="M3 8.5l3 3 7-7" />}
    {grade === 'mixed' && <path d="M8 2.5l6 11H2z" />}
    {grade === 'poor' && <path d="M4 4l8 8M12 4l-8 8" />}
  </svg>;
}

function DebriefView({ report, tried, onNext, onNewShift }: { readonly report?: Debrief; readonly tried: number; readonly onNext: () => void; readonly onNewShift: () => void }) {
  const [open, setOpen] = useState<string>();
  if (!report) return <p className="xb-line xb-muted" role="status">REVIEWING</p>;
  return <div className="xb-debrief">
    <h3 className="xb-title">{report.code} COMMITTED</h3>
    <p className="xb-line xb-muted">{report.minutes} MIN · {report.scans} {report.scans === 1 ? 'SCAN' : 'SCANS'} · {report.followUps} {report.followUps === 1 ? 'TEST' : 'TESTS'} · {tried} {tried === 1 ? 'EXPLANATION' : 'EXPLANATIONS'} TRIED</p>
    <ul className="xb-list">
      {report.rows.map((row) => <li key={row.id}>
        <button type="button" className="xb-row" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? undefined : row.id)}>
          <b><GradeMark grade={row.grade} />{ROW_LABEL[row.id]}</b>
          {(open === row.id ? row.notes : row.notes.slice(0, 1)).map((note) => <span key={note}>{note}</span>)}
        </button>
      </li>)}
    </ul>
    <span className="xb-label">IN THE POWDER</span>
    <ul className="xb-truth">
      {report.truth.map((phase) => <li key={phase.id}>
        <b style={{ color: phaseColor(phase.id) }}>{phaseLabel(phase.id)}</b>
        <span>{BAND_LABEL[phase.band]}</span>
        <span className={phase.claimed ? undefined : 'xb-warn'}>{phase.claimed ? 'CLAIMED' : 'MISSED'}</span>
        {!phase.inLibrary && <span className="xb-muted">NO REFERENCE</span>}
      </li>)}
    </ul>
    <p className="xb-line">{report.objectiveMet ? 'AIM MET' : 'AIM MISSED'} · WOULD WORK {report.fixes.length > 0 ? report.fixes.map((fix) => DECISION_LABELS[fix].toUpperCase()).join(' / ') : 'NONE'}</p>
    <div className="xb-actions">
      <button type="button" className="xb-primary" onClick={onNext}>NEXT SAMPLE</button>
      <button type="button" className="xb-link" onClick={onNewShift}>NEW SHIFT</button>
    </div>
  </div>;
}
