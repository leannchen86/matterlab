// Pure view helpers for the bench: run tags, overlay scaling, probe groups, probe significance, sample status, fit readouts
// and the debrief summary. Node tests import this module, so its imports carry .ts extensions like the core.
import type { AnalysisResult, PhaseFit } from '../xrd/analysis.ts';
import type { Objective } from '../xrd/cases.ts';
import { DECISION_LABELS, REPORTABLE, ZR_LATTICE_PER_MOL_PERCENT, type Debrief, type Decision, type LabState, type Request, type SampleState, type TruthBand, type TruthPhase } from '../xrd/lab.ts';
import { exposure, type Acquisition } from '../xrd/measure.ts';
import { linesNear } from '../xrd/probe.ts';
import type { RunRecord } from '../xrd/records.ts';
import { PROGRAM_LABEL, RUN_WORD, WORD, phaseLabel, type SampleStatus } from './copy.ts';

/** Centre of a run's angular range; for a targeted run, the angle it checked. */
export function runCentre(run: Pick<RunRecord, 'acquisition'>) {
  return (run.acquisition.range.startDeg + run.acquisition.range.endDeg) / 2;
}

/**
 * `R1 SURVEY` on the queue mount, `R2 STANDARD · RESCAN` when an earlier run used the same mount, `R3 SURVEY · NEW MOUNT`
 * for the first run on a new mount from an earlier aliquot, `R4 SURVEY · NEW ALIQUOT` for the first run on fresh powder,
 * and `R5 TARGET 27.5°` for targeted runs.
 */
export function runTag(sample: Pick<SampleState, 'runs' | 'mounts'>, run: RunRecord) {
  const head = `R${run.index} ${PROGRAM_LABEL[run.acquisition.program]}`;
  if (run.acquisition.program === 'targeted') return `${head} ${runCentre(run).toFixed(1)}°`;
  if (sample.runs.some((item) => item.index < run.index && item.mount.index === run.mount.index)) return `${head} · ${RUN_WORD.rescan}`;
  if (run.mount.preparedBy === 'queue') return head;
  const earlierAliquot = sample.mounts.some((mount) => mount.index < run.mount.index && mount.aliquot === run.mount.aliquot);
  return `${head} · ${earlierAliquot ? RUN_WORD.mount : RUN_WORD.aliquot}`;
}

/**
 * Factor that puts an overlay run's counts on the displayed run's scale. Expected counts per bin are the intensity
 * integrated over the bin times `exposure()`, so for peaks wider than a step they follow exposure × step.
 */
export function overlayScale(displayed: Acquisition, overlay: Acquisition) {
  const from = exposure(overlay) * overlay.stepDeg;
  return from > 0 ? (exposure(displayed) * displayed.stepDeg) / from : 1;
}

/** Library phases with a line near an angle, strongest line per phase, in catalogue order and never strength order. */
export function probeGroups(deg: number, library: readonly string[], exclude?: string) {
  const hits = new Map<string, number>();
  for (const hit of linesNear(deg, library)) if (hit.phaseId !== exclude) hits.set(hit.phaseId, Math.max(hits.get(hit.phaseId) ?? 0, hit.relative));
  return library.filter((id) => hits.has(id)).map((id) => ({ id, relative: hits.get(id) ?? 0 }));
}

/** Whether a run measured an angle: its nearest bin lies on the run's grid. */
export function runCovers(run: Pick<RunRecord, 'grid'>, deg: number) {
  const index = Math.round((deg - run.grid.startDeg) / run.grid.stepDeg);
  return index >= 0 && index < run.grid.count;
}

/**
 * Residual significance around an angle: Σ(obs − calc) / √Σmax(calc, 1) over ±pointsPerFwhm bins. Undefined at an angle the
 * run never measured, so an unmeasured angle never reads as a clean fit.
 */
export function probeZ(run: Pick<RunRecord, 'grid' | 'counts'>, fit: Pick<AnalysisResult, 'calculated' | 'pointsPerFwhm'>, deg: number): number | undefined {
  if (!runCovers(run, deg)) return undefined;
  const index = Math.round((deg - run.grid.startDeg) / run.grid.stepDeg);
  const half = Math.max(1, Math.round(fit.pointsPerFwhm));
  let difference = 0;
  let calculated = 0;
  for (let i = Math.max(0, index - half); i <= Math.min(run.grid.count - 1, index + half); i += 1) {
    difference += run.counts[i] - fit.calculated[i];
    calculated += Math.max(fit.calculated[i], 1);
  }
  return calculated > 0 ? difference / Math.sqrt(calculated) : undefined;
}

/**
 * A TGA or SEM/EDS result for the sample has come back: the lab clock has reached its ready minute. This is the same test
 * `tgaStatus` and `semStatus` use, without computing the result itself.
 */
export function resultReady(state: Pick<LabState, 'minute'>, sample: Pick<SampleState, 'tga' | 'sem'>) {
  const back = (request?: Request) => request !== undefined && state.minute >= request.readyMinute;
  return back(sample.tga) || back(sample.sem);
}

/** The sample menu's status, never a grade: committed, a returned test result, anything already spent on it, or new. */
export function sampleStatus(state: Pick<LabState, 'minute'>, sample: SampleState): SampleStatus {
  if (sample.call) return 'committed';
  if (resultReady(state, sample)) return 'ready';
  return sample.runs.length > 0 || sample.revealed.length > 0 || sample.mounts.length > 1 || Boolean(sample.tga || sample.sem) ? 'started' : 'new';
}

/** What this scan could have shown of a phase the fit did not need. Never a limit of detection for the powder. */
export type DetectionReach = 'small' | 'large' | 'none';

/**
 * For a phase the fit did not need: `small` when a line of its own would reach the Currie detection limit at a reportable
 * share of the fitted crystalline phases, `large` when only a larger share would, and `none` when it has no line of its own
 * in this scan. Scale ratios approximate weight shares among the fitted phases; the spike (`exclude`) is left out. Undefined
 * for a phase the fit needs or never fitted.
 */
export function detectionReach(phases: readonly Pick<PhaseFit, 'id' | 'scale' | 'status' | 'detectionScale'>[], id: string, exclude?: string): DetectionReach | undefined {
  const phase = phases.find((item) => item.id === id);
  if (!phase || (phase.status !== 'not-detected' && phase.status !== 'not-required')) return undefined;
  if (!Number.isFinite(phase.detectionScale)) return 'none';
  let fitted = 0;
  for (const item of phases) if (item.id !== id && item.id !== exclude && item.scale > 0) fitted += item.scale;
  return phase.detectionScale / (fitted + phase.detectionScale) <= REPORTABLE ? 'small' : 'large';
}

export type SpacingReading = { readonly kind: 'zr'; readonly value: number } | { readonly kind: 'check-zero' };

/**
 * Zr mol% read from the host cell of a sample aiming at a solid solution, with the sim's illustrative linear expansion. A
 * refined zero trades against the cell, so without a checked zero or a spike it asks for a zero check instead.
 */
export function spacingReading(
  fit: Pick<AnalysisResult, 'zeroRefined'> & { readonly phases: readonly Pick<PhaseFit, 'id' | 'scale' | 'latticeScale'>[] },
  phaseId: string,
  objective: Pick<Objective, 'targets' | 'zrMolPercent'>,
  internalStandard?: string,
): SpacingReading | undefined {
  if (objective.zrMolPercent === undefined || phaseId !== objective.targets[0]) return undefined;
  const phase = fit.phases.find((item) => item.id === phaseId);
  if (!phase || !(phase.scale > 0)) return undefined;
  if (fit.zeroRefined && !internalStandard) return { kind: 'check-zero' };
  return { kind: 'zr', value: Math.max(0, Math.round((phase.latticeScale - 1) / ZR_LATTICE_PER_MOL_PERCENT)) };
}

/** `2 SEEN · 1 SHARED · 0 ABSENT` */
export function lineCountsText(fit: Pick<PhaseFit, 'detected' | 'shared' | 'missing'>) {
  return `${fit.detected.length} ${WORD.seen} · ${fit.shared} ${WORD.shared} · ${fit.missing.length} ${WORD.absent}`;
}

const BAND_PHRASE: Readonly<Record<TruthBand, string>> = { major: 'mostly', minor: 'a small amount of', trace: 'a trace of' };

/** `A`, `A and B`, `A, B and C` */
function listed(items: readonly string[]) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What the powder held, heaviest band first; phases of one band that share a qualifier are named together. */
function powderSentence(truth: readonly TruthPhase[]) {
  const groups: { readonly band: TruthBand; readonly note: string; readonly labels: string[] }[] = [];
  for (const phase of truth) {
    const note = !phase.inLibrary ? ' with no reference in the library' : phase.claimed ? '' : ' that you did not claim';
    const group = groups.find((item) => item.band === phase.band && item.note === note);
    if (group) group.labels.push(phaseLabel(phase.id));
    else groups.push({ band: phase.band, note, labels: [phaseLabel(phase.id)] });
  }
  const named = (group: (typeof groups)[number]) => `${listed(group.labels)}${group.note}`;
  const major = groups.filter((group) => group.band === 'major');
  const rest = listed(groups.filter((group) => group.band !== 'major').map((group) => `${BAND_PHRASE[group.band]} ${named(group)}`));
  if (major.length === 0) return rest ? `The powder held ${rest}.` : undefined;
  const head = `${BAND_PHRASE.major} ${listed(major.map(named))}`;
  if (!rest) return `The powder was ${head}.`;
  return `The powder was ${head}${major.some((group) => group.note) ? ',' : ''} with ${rest}.`;
}

function decisionSentence(report: Pick<Debrief, 'truth' | 'objectiveMet' | 'fixes'>, decision: Decision) {
  const cheapest = report.fixes[0];
  if (decision === 'hold-reference') {
    const noReference = report.truth.some((phase) => !phase.inLibrary);
    if (report.objectiveMet) return noReference ? 'The batch already met the aim.' : 'Nothing needed a new reference; the batch already met the aim.';
    if (!cheapest) return noReference ? 'No decision meets the aim, even once identified.' : 'Nothing needed a new reference, and no decision meets the aim.';
    return noReference ? `Once identified, ${DECISION_LABELS[cheapest]} meets the aim.` : `Nothing needed a new reference; ${DECISION_LABELS[cheapest]} meets the aim.`;
  }
  const label = DECISION_LABELS[decision];
  if (!report.fixes.includes(decision)) return cheapest ? `${label} missed the aim; ${DECISION_LABELS[cheapest]} meets it.` : `${label} missed the aim, and no decision meets it.`;
  if (cheapest === decision) return `${label} met the aim.`;
  return report.objectiveMet ? `${label} met the aim, but the batch already met it as made.` : `${label} met the aim; ${DECISION_LABELS[cheapest]} also meets it.`;
}

/**
 * The debrief in one or two plain sentences: what the powder was, in bands, and whether the committed decision met the aim,
 * naming the cheapest fix when it differs. Built only from the revealed bands, the aim, the fixes and the decision, so it
 * carries no percentage and no grade.
 */
export function debriefSummary(report: Pick<Debrief, 'truth' | 'objectiveMet' | 'fixes'>, decision: Decision) {
  return [powderSentence(report.truth), decisionSentence(report, decision)].filter(Boolean).join(' ');
}
