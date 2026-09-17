import { sampleCase } from '../xrd/cases.ts';
import { currentMount, debrief, debriefAnalyses, DECISION_LABELS, type Debrief, type LabState, type SampleState } from '../xrd/lab.ts';
import type { AnalysisOptions, AnalysisResult } from '../xrd/analysis.ts';
import type { RunRecord } from '../xrd/records.ts';
import { mountTag, phaseLabel, PROGRAM_LABEL } from './copy.ts';

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
  readonly supported: boolean;
  readonly uncertain: boolean;
  readonly held: boolean;
  readonly summary: string;
};

export function runContext(sample: SampleState, run?: RunRecord): XrdRunContext {
  return {
    sampleId: sample.code,
    sampleName: sampleCase(sample.code).record.title,
    prep: mountTag(run?.mount ?? currentMount(sample)),
    scan: PROGRAM_LABEL[run?.acquisition.program ?? 'survey'],
    scanMinutes: run?.acquisition.minutes ?? 0,
    runNumber: run?.index ?? 0,
  };
}

export function callResult(sample: SampleState, report: Debrief): XrdRunResult | undefined {
  const call = sample.call;
  const basis = sample.interpretations.find((item) => item.id === call?.basis);
  const run = sample.runs.find((item) => item.id === basis?.runId);
  if (!call || !run) return undefined;
  const phases = call.phases.map(phaseLabel);
  const decision = DECISION_LABELS[call.decision];
  return {
    ...runContext(sample, run), phases, decision,
    supported: report.rows.find((row) => row.id === 'support')?.grade !== 'poor',
    held: call.decision === 'hold-reference',
    uncertain: call.unexplained !== 'none' || call.decision === 'hold-reference',
    summary: `${phases.join(' + ')} · ${decision.toUpperCase()}`,
  };
}

/** The latest instrument/call operation, ignoring unrelated follow-ups. A zero check leaves the sample holder clear. */
export function latestPresentation(state: LabState): {
  readonly key: string;
  readonly stage: 'closed' | 'review' | 'complete';
  readonly sample: SampleState;
  readonly context: XrdRunContext;
} | undefined {
  const index = state.log.findLastIndex((item) => ['mount', 'scan', 'call', 'standard'].includes(item.kind));
  const event = state.log[index];
  if (!event || event.kind === 'standard') return undefined;
  const sample = state.samples.find((item) => item.code === event.code);
  if (!sample) return undefined;
  const key = JSON.stringify([state.seed, index, event.kind, event.code]);
  if (event.kind === 'mount') return { key, stage: 'closed', sample, context: runContext(sample) };
  if (event.kind === 'call') {
    const basis = sample.interpretations.find((item) => item.id === sample.call?.basis);
    const run = sample.runs.find((item) => item.id === basis?.runId);
    return run ? { key, stage: 'complete', sample, context: runContext(sample, run) } : undefined;
  }
  const run = sample.runs.at(-1);
  return run ? { key, stage: 'review', sample, context: runContext(sample, run) } : undefined;
}

/** Finishes a call independently of the bench's mounted state, and rejects results superseded while fitting. */
export async function completeLatestCall(
  state: LabState,
  readCurrent: () => LabState,
  analyze: (run: RunRecord, options: AnalysisOptions) => Promise<AnalysisResult>,
): Promise<{ readonly key: string; readonly result: XrdRunResult } | undefined> {
  const target = latestPresentation(state);
  if (target?.stage !== 'complete') return undefined;
  await Promise.all(debriefAnalyses(state, target.sample.code).map((job) => analyze(job.run, job.options)));
  if (latestPresentation(readCurrent())?.key !== target.key) return undefined;
  const report = debrief(state, target.sample.code);
  const result = report && callResult(target.sample, report);
  return result ? { key: target.key, result } : undefined;
}
