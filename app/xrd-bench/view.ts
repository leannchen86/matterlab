// Pure view helpers for the bench: run tags, overlay scaling, probe groups, probe significance and sample status. Node tests
// import this module, so its imports carry .ts extensions like the core.
import type { AnalysisResult } from '../xrd/analysis.ts';
import type { LabState, Request, SampleState } from '../xrd/lab.ts';
import { exposure, type Acquisition } from '../xrd/measure.ts';
import { linesNear } from '../xrd/probe.ts';
import type { RunRecord } from '../xrd/records.ts';
import { PROGRAM_LABEL, RUN_WORD, type SampleStatus } from './copy.ts';

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
