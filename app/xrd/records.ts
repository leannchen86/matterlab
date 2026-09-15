// Immutable measurement records and separate interpretations. A run never changes after acquisition; an interpretation is
// a set of analysis inputs over one run, so trying other references adds interpretations without touching the data.
import { ANALYSIS_VERSION, type AnalysisOptions } from './analysis.ts';
import { ENGINE_VERSION, PROGRAMS, type Acquisition, type MountRecord, type ProgramId } from './measure.ts';
import type { Grid } from './pattern.ts';

export const ARCHIVE_VERSION = 1;

export type RunRecord = {
  readonly id: string;
  readonly sampleCode: string;
  /** 1-based scan number within the sample. */
  readonly index: number;
  readonly mount: MountRecord;
  readonly acquisition: Acquisition;
  readonly engine: string;
  /** Shift minute at which acquisition started. */
  readonly startedMinute: number;
  readonly grid: Grid;
  readonly counts: Uint32Array;
};

export type Interpretation = {
  readonly id: string;
  readonly runId: string;
  readonly candidates: readonly string[];
  readonly internalStandard?: string;
  /** Goniometer zero from a standard check, which fixes zero instead of refining it. */
  readonly zeroDeg?: number;
  readonly analysis: string;
  readonly createdMinute: number;
};

export function runId(sampleCode: string, index: number) {
  return `${sampleCode}-R${index}`;
}

export function createRun(sampleCode: string, index: number, mount: MountRecord, acquisition: Acquisition, startedMinute: number, grid: Grid, counts: Uint32Array): RunRecord {
  return { id: runId(sampleCode, index), sampleCode, index, mount, acquisition, engine: ENGINE_VERSION, startedMinute, grid, counts: Uint32Array.from(counts) };
}

export function createInterpretation(run: RunRecord, index: number, options: AnalysisOptions, createdMinute: number): Interpretation {
  return {
    id: `${run.id}-I${index}`,
    runId: run.id,
    candidates: [...new Set(options.candidates)].sort(),
    ...(options.internalStandard ? { internalStandard: options.internalStandard } : {}),
    ...(options.zeroDeg === undefined ? {} : { zeroDeg: options.zeroDeg }),
    analysis: ANALYSIS_VERSION,
    createdMinute,
  };
}

export function interpretationOptions(interpretation: Interpretation): AnalysisOptions {
  return { candidates: interpretation.candidates, internalStandard: interpretation.internalStandard, zeroDeg: interpretation.zeroDeg };
}

/** Same analysis inputs, regardless of the order candidates were picked in. */
export function sameInterpretation(a: Pick<Interpretation, 'runId' | 'candidates' | 'internalStandard' | 'zeroDeg'>, b: Pick<Interpretation, 'runId' | 'candidates' | 'internalStandard' | 'zeroDeg'>) {
  const key = (item: typeof a) => JSON.stringify([item.runId, [...item.candidates].sort(), item.internalStandard ?? '', item.zeroDeg ?? null]);
  return key(a) === key(b);
}

export type Archive = { readonly version: number; readonly runs: readonly RunRecord[]; readonly interpretations: readonly Interpretation[] };

export function encodeCounts(counts: Uint32Array): string {
  const bytes = new Uint8Array(counts.length * 4);
  const view = new DataView(bytes.buffer);
  counts.forEach((value, index) => view.setUint32(index * 4, value, true));
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export function decodeCounts(text: string, count: number): Uint32Array | undefined {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return undefined;
  }
  if (binary.length !== count * 4) return undefined;
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) view.setUint8(index, binary.charCodeAt(index));
  const counts = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) counts[index] = view.getUint32(index * 4, true);
  return counts;
}

export function serializeArchive(archive: Archive): string {
  return JSON.stringify({
    version: ARCHIVE_VERSION,
    runs: archive.runs.map((run) => ({ ...run, counts: encodeCounts(run.counts) })),
    interpretations: archive.interpretations,
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function parseRun(value: unknown): RunRecord | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.sampleCode !== 'string' || !isFiniteNumber(value.index) || !isFiniteNumber(value.startedMinute)) return undefined;
  const { grid, acquisition, mount } = value;
  if (!isRecord(grid) || !isFiniteNumber(grid.startDeg) || !isFiniteNumber(grid.stepDeg) || !isFiniteNumber(grid.count) || grid.count <= 0) return undefined;
  if (!isRecord(acquisition) || typeof acquisition.program !== 'string' || !(acquisition.program in PROGRAMS)) return undefined;
  if (!isRecord(mount) || !isFiniteNumber(mount.index)) return undefined;
  if (typeof value.counts !== 'string') return undefined;
  const counts = decodeCounts(value.counts, grid.count);
  if (!counts) return undefined;
  return {
    id: value.id,
    sampleCode: value.sampleCode,
    index: value.index,
    mount: mount as MountRecord,
    acquisition: { ...(acquisition as Acquisition), program: acquisition.program as ProgramId },
    engine: typeof value.engine === 'string' ? value.engine : 'unknown',
    startedMinute: value.startedMinute,
    grid: { startDeg: grid.startDeg, stepDeg: grid.stepDeg, count: grid.count },
    counts,
  };
}

function parseInterpretation(value: unknown): Interpretation | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.runId !== 'string' || !Array.isArray(value.candidates) || !value.candidates.every((item) => typeof item === 'string')) return undefined;
  return {
    id: value.id,
    runId: value.runId,
    candidates: value.candidates as string[],
    ...(typeof value.internalStandard === 'string' ? { internalStandard: value.internalStandard } : {}),
    ...(isFiniteNumber(value.zeroDeg) ? { zeroDeg: value.zeroDeg } : {}),
    analysis: typeof value.analysis === 'string' ? value.analysis : 'unknown',
    createdMinute: isFiniteNumber(value.createdMinute) ? value.createdMinute : 0,
  };
}

/** Restores an archive; malformed entries are dropped and interpretations of dropped runs go with them. */
export function parseArchive(text: string): Archive | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw) || raw.version !== ARCHIVE_VERSION || !Array.isArray(raw.runs) || !Array.isArray(raw.interpretations)) return undefined;
  const runs = raw.runs.map(parseRun).filter((run): run is RunRecord => Boolean(run));
  const ids = new Set(runs.map((run) => run.id));
  const interpretations = raw.interpretations.map(parseInterpretation).filter((item): item is Interpretation => Boolean(item) && ids.has((item as Interpretation).runId));
  return { version: ARCHIVE_VERSION, runs, interpretations };
}
