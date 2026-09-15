'use client';

// The bench session: a seed plus the actions taken, replayed through the lab core. It survives closing the bench and,
// where storage allows, a reload. Analyses are computed off the main thread and read back from the core's cache.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AnalysisOptions, AnalysisResult } from '../xrd/analysis';
import { ensureAnalysis } from '../xrd/analysis-client';
import { CASE_CODES } from '../xrd/cases';
import { apply, cachedAnalysis, createLab, replay, type Action, type LabState, type Outcome } from '../xrd/lab';
import type { RunRecord } from '../xrd/records';

const STORAGE_KEY = 'matterlab-xrd-bench-v1';

type Session = { readonly seed: string; readonly actions: readonly Action[]; readonly state: LabState };

let session: Session | undefined;
const listeners = new Set<() => void>();

function freshSeed() {
  return Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
}

function restore(): Session {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as { seed?: unknown; actions?: unknown } | null;
    if (saved && typeof saved.seed === 'string' && Array.isArray(saved.actions)) {
      const actions = saved.actions as Action[];
      return { seed: saved.seed, actions, state: replay(saved.seed, CASE_CODES, actions) };
    }
  } catch {
    // Unreadable or blocked storage starts a new shift.
  }
  const seed = freshSeed();
  return { seed, actions: [], state: createLab(seed, CASE_CODES) };
}

function persist(next: Session) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ seed: next.seed, actions: next.actions }));
  } catch {
    // The shift still runs; it just will not survive a reload.
  }
}

function current(): Session {
  if (!session) session = restore();
  return session;
}

function publish(next: Session) {
  session = next;
  persist(next);
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const serverState = createLab('server', CASE_CODES);

export function useLab(): LabState {
  return useSyncExternalStore(subscribe, () => current().state, () => serverState);
}

/** Applies an action to the shift; failed actions change nothing and report why. */
export function dispatch(action: Action): Outcome {
  const before = current();
  const outcome = apply(before.state, action);
  if (outcome.ok && outcome.state !== before.state) publish({ seed: before.seed, actions: [...before.actions, action], state: outcome.state });
  return outcome;
}

/** Starts a new shift with a new seed and returns its state. */
export function newShift(): LabState {
  const seed = freshSeed();
  const state = createLab(seed, CASE_CODES);
  publish({ seed, actions: [], state });
  return state;
}

/** The analysis of a run with these references: returned at once when cached, otherwise fitted in the background. */
export function useAnalysis(run: RunRecord | undefined, options: AnalysisOptions | undefined): { readonly result?: AnalysisResult; readonly pending: boolean; readonly failed: boolean } {
  const cached = run && options ? cachedAnalysis(run, options) : undefined;
  const key = run && options ? `${run.id}|${JSON.stringify([[...options.candidates].sort(), options.internalStandard ?? '', options.zeroDeg ?? null])}` : '';
  const [settled, setSettled] = useState<{ key: string; failed: boolean }>({ key: '', failed: false });
  useEffect(() => {
    if (!run || !options || cached) return;
    let live = true;
    ensureAnalysis(run, options).then(
      () => live && setSettled({ key, failed: false }),
      () => live && setSettled({ key, failed: true }),
    );
    return () => {
      live = false;
    };
    // The key captures run and options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cached]);
  const result = run && options ? cachedAnalysis(run, options) : undefined;
  return { result, pending: Boolean(run && options && !result && !(settled.key === key && settled.failed)), failed: settled.key === key && settled.failed };
}

/** Fits every analysis in the list in the background and reports whether all of them are ready. */
export function useAnalysesReady(jobs: readonly { readonly run: RunRecord; readonly options: AnalysisOptions }[]): boolean {
  const ready = jobs.every((job) => cachedAnalysis(job.run, job.options));
  const key = jobs.map((job) => `${job.run.id}|${JSON.stringify(job.options)}`).join(';');
  const [, setTick] = useState(0);
  useEffect(() => {
    if (ready) return;
    let live = true;
    Promise.all(jobs.map((job) => ensureAnalysis(job.run, job.options))).then(
      () => live && setTick((tick) => tick + 1),
      () => live && setTick((tick) => tick + 1),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);
  return ready;
}
