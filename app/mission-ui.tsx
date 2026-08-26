'use client';

import { useEffect, useRef } from 'react';

export function useModalFocusTrap() {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', keepFocusInside);
    return () => {
      dialog.removeEventListener('keydown', keepFocusInside);
      previous?.focus();
    };
  }, []);

  return dialogRef;
}

export function MissionTelemetry({ blockedAttempts, evidenceCount }: { blockedAttempts: number; evidenceCount: number }) {
  const evidenceLabel = `${evidenceCount} ${evidenceCount === 1 ? 'piece' : 'pieces'} of evidence recorded`;
  return <div className="mission-telemetry" role="status" aria-label={`${evidenceLabel}${blockedAttempts ? `, ${blockedAttempts} guess attempts blocked` : ''}`}>
    <span>EVIDENCE<b>{evidenceCount}</b></span>
    {blockedAttempts > 0 && <span className="attention">GUESSES BLOCKED<b>{blockedAttempts}</b></span>}
  </div>;
}

export function PhysicalEvidenceCue({ stationId, checks, total = 3 }: { stationId: string; checks: string[]; total?: number }) {
  const count = Math.min(checks.length, total);
  const complete = count >= total;
  return <section className={`rail-section physical-evidence-cue${complete ? ' complete' : ''}`} aria-label={`${count} of ${total} physical observations recorded for ${stationId}`}>
    <div><span>WALKAROUND · {stationId}</span><b>{count}/{total}</b></div>
    <small>{complete ? 'Walkaround complete' : `Open focused view · inspect ${total - count} marked ${total - count === 1 ? 'part' : 'parts'}`}</small>
  </section>;
}

export function MissionLabHeading({ objective, stationId, stationState, stationTone }: { objective: string; stationId: string; stationState: string; stationTone: string }) {
  return <div className="lab-heading mission-lab-heading">
    <div><p className="section-kicker">CURRENT OBJECTIVE</p><h2>{objective}</h2></div>
    <div className={`lab-selection-chip ${stationTone}`}><span>SELECTED</span><b>{stationId}</b><small>{stationState}</small></div>
  </div>;
}
