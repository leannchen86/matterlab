'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureAnalysis } from '../xrd/analysis-client';
import { completeLatestCall, latestPresentation, type XrdBenchStage, type XrdRunContext, type XrdRunResult } from './presentation';
import { getLabSnapshot, useLab } from './session';

type Presentation = {
  readonly stage: XrdBenchStage;
  readonly context: XrdRunContext | null;
  readonly result: XrdRunResult | null;
};

const IDLE: Presentation = { stage: 'idle', context: null, result: null };

/** Page-owned presentation survives closing the bench; only live stage callbacks animate scans and mounts. */
export function useXrdPresentation() {
  const state = useLab();
  const target = useMemo(() => latestPresentation(state), [state]);
  const [presentation, setPresentation] = useState<Presentation>(IDLE);
  const revision = useRef(0);
  const publishedCall = useRef<string | undefined>(undefined);

  const updateStage = useCallback((stage: XrdBenchStage, context: XrdRunContext) => {
    revision.current += 1;
    setPresentation({ stage, context, result: null });
  }, []);

  // Restore only once: subsequent mount/scan state changes already have their own live animation callbacks.
  useEffect(() => {
    let live = true;
    const initial = latestPresentation(getLabSnapshot());
    const before = revision.current;
    if (!initial || initial.stage === 'complete') return;
    void Promise.resolve().then(() => {
      if (live && revision.current === before && latestPresentation(getLabSnapshot())?.key === initial.key) {
        setPresentation({ stage: initial.stage, context: initial.context, result: null });
      }
    });
    return () => { live = false; };
  }, []);

  // The persisted call, not the debrief component's lifetime, owns completion. Analyses are worker-backed and deduplicated.
  useEffect(() => {
    if (target?.stage !== 'complete' || publishedCall.current === target.key) return;
    let live = true;
    void completeLatestCall(state, getLabSnapshot, ensureAnalysis).then((completed) => {
      if (!live || !completed || latestPresentation(getLabSnapshot())?.key !== completed.key) return;
      publishedCall.current = completed.key;
      revision.current += 1;
      setPresentation({ stage: 'complete', context: completed.result, result: completed.result });
    }).catch(() => {
      // The bench retains the saved call and can surface the analysis failure; do not invent a support grade.
    });
    return () => { live = false; };
  }, [state, target]);

  const phase = presentation.stage === 'idle' ? 0
    : presentation.stage === 'open' ? 1
      : presentation.stage === 'loaded' || presentation.stage === 'closed' ? 2
        : presentation.stage === 'scanning' ? 3
          : presentation.stage === 'review' ? 4 : 5;
  return { ...presentation, phase, updateStage };
}
