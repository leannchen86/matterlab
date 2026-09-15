// Runs analyses in a worker so a fit never freezes the bench; falls back to the main thread where workers are unavailable.
import { analyzePattern, type AnalysisOptions, type AnalysisResult } from './analysis.ts';
import type { AnalysisReply, AnalysisRequest } from './analysis.worker.ts';
import { cachedAnalysis, primeAnalysis } from './lab.ts';
import type { RunRecord } from './records.ts';

type Pending = { readonly resolve: (result: AnalysisResult) => void; readonly reject: (error: Error) => void };

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();
const inFlight = new Map<RunRecord, Map<string, Promise<AnalysisResult>>>();

function abandonWorker(reason: string) {
  worker?.terminate();
  worker = null;
  for (const [id, entry] of pending) {
    pending.delete(id);
    entry.reject(new Error(reason));
  }
}

function analysisWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined') return (worker = null);
  try {
    const created = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    created.addEventListener('message', (event: MessageEvent<AnalysisReply>) => {
      const entry = pending.get(event.data.id);
      if (!entry) return;
      pending.delete(event.data.id);
      if ('result' in event.data) entry.resolve(event.data.result);
      else entry.reject(new Error(event.data.error));
    });
    created.addEventListener('error', () => abandonWorker('Analysis worker failed'));
    worker = created;
  } catch {
    worker = null;
  }
  return worker;
}

function onMainThread(run: RunRecord, options: AnalysisOptions) {
  // Yield a frame first so the interface can show that a fit is running.
  return new Promise<AnalysisResult>((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(analyzePattern(run, options));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, 16);
  });
}

function inWorker(target: Worker, run: RunRecord, options: AnalysisOptions) {
  return new Promise<AnalysisResult>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    // Counts are copied, never transferred: the run must keep its own array.
    const request: AnalysisRequest = { id, observation: { grid: run.grid, counts: run.counts }, options };
    target.postMessage(request);
  });
}

/** Analysis of a run with the given references, computed once and stored where the lab selectors read it. */
export function ensureAnalysis(run: RunRecord, options: AnalysisOptions): Promise<AnalysisResult> {
  const cached = cachedAnalysis(run, options);
  if (cached) return Promise.resolve(cached);
  const key = JSON.stringify([[...options.candidates].sort(), options.internalStandard ?? '', options.zeroDeg ?? null]);
  const flights = inFlight.get(run) ?? new Map<string, Promise<AnalysisResult>>();
  inFlight.set(run, flights);
  const existing = flights.get(key);
  if (existing) return existing;
  const target = analysisWorker();
  const promise = (target ? inWorker(target, run, options).catch(() => onMainThread(run, options)) : onMainThread(run, options))
    .then((result) => {
      primeAnalysis(run, options, result);
      return result;
    })
    .finally(() => flights.delete(key));
  flights.set(key, promise);
  return promise;
}
