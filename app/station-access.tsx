'use client';

import { useEffect, useState } from 'react';
import { emitLabEvent, subscribeLabEvent } from './lab-events';
import type { Station } from './sim-data';

type ConsoleSession = { completed: boolean; hmiOperations: string[] };

const emptyConsoleSession = (): ConsoleSession => ({ completed: false, hmiOperations: [] });

const CONTROLLERS: Record<string, string> = {
  'PREP-01': 'BAL-01 / LEV-01',
  'ROBO-02': 'RC-02 / SAFE-PLC',
  'FURN-04': 'TC-04 / OT-04',
  'XRD-03': 'XRD-03 / RAD-PLC',
  'SEM-01': 'SEM-01 / VAC-1',
  'BET-02': 'BET-02 / VAC-MFD',
  'TGA-01': 'TGA-01 / GAS-3',
};

const HMI_OPERATIONS: Record<string, string[]> = {
  'PREP-01': ['Prove enclosure flow', 'Close balance draft shield', 'Zero analytical balance', 'Confirm antistatic state'],
  'ROBO-02': ['Close access gate', 'Reset safeguarded stop', 'Home transfer axes', 'Prove gripper state', 'Execute transfer'],
  'FURN-04': ['Read overtemperature relay', 'Verify door chain', 'Confirm chamber occupancy'],
  'XRD-03': ['Home specimen stage', 'Close radiation enclosure', 'Prove shutter feedback', 'Read silicon QC position'],
  'SEM-01': ['Verify beam blanked', 'Verify stage clearance', 'Establish chamber vacuum', 'Arm BSE / EDS detectors'],
  'BET-02': ['Isolate analysis ports', 'Run manifold leak check', 'Prove N₂ supply state', 'Position 77 K Dewar'],
  'TGA-01': ['Confirm furnace at start temperature', 'Tare balance channel', 'Prove purge path', 'Home autosampler carousel'],
};

export function StationAccess({ station, physicalChecks = [] }: { station: Station; physicalChecks?: string[] }) {
  const [open, setOpen] = useState(false);
  const [enteredFromLab, setEnteredFromLab] = useState(false);
  const [sessions, setSessions] = useState<Record<string, ConsoleSession>>({});
  const session = sessions[station.id] ?? emptyConsoleSession();
  const completed = session.completed;
  const hmiOperations = session.hmiOperations;
  const controller = CONTROLLERS[station.id] ?? CONTROLLERS['XRD-03'];
  const finish = () => {
    setSessions((current) => {
      const active = current[station.id] ?? emptyConsoleSession();
      return { ...current, [station.id]: { ...active, completed: true } };
    });
  };
  const commitHmiOperation = (operation: string) => {
    if (hmiOperations.includes(operation)) return;
    setSessions((current) => {
      const active = current[station.id] ?? emptyConsoleSession();
      return { ...current, [station.id]: { ...active, hmiOperations: [...active.hmiOperations, operation] } };
    });
    emitLabEvent('station-event', { stationId: station.id, action: operation });
  };

  useEffect(() => {
    return subscribeLabEvent('open-console', ({ stationId }) => {
      if (stationId === station.id) {
        setEnteredFromLab(true);
        setOpen(true);
      }
    });
  }, [station.id]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      setEnteredFromLab(false);
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [open]);

  const closeConsole = () => {
    setOpen(false);
    setEnteredFromLab(false);
  };
  const returnToAsset = () => {
    setOpen(false);
    setEnteredFromLab(false);
    emitLabEvent('return-to-lab', { stationId: station.id });
  };
  const openStationAccess = () => {
    setEnteredFromLab(false);
    setOpen(true);
  };

  return <>
    <button className="station-access-button" type="button" onClick={openStationAccess}><span>⌁</span><b>OPERATE MACHINE</b><i>{Math.min(physicalChecks.length, 3)}/3 INSPECTED</i><em>→</em></button>
    {open && <div className="modal-backdrop station-console-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeConsole(); }}>
      <section className="modal-card wide station-console" role="dialog" aria-modal="true" aria-label={`${station.name} local station console`}>
        <header><div><p className="section-kicker">INSTRUMENT CONTROL · {controller}</p><h2>{station.name}</h2></div><div className="console-header-actions">{enteredFromLab && <button type="button" className="return-asset" onClick={returnToAsset}>← BACK TO MACHINE</button>}<button type="button" onClick={closeConsole} aria-label="Close">×</button></div></header>
        <div className="console-main compact-console-main">
          <HmiView station={station} physicalChecks={physicalChecks} operations={hmiOperations} onOperation={commitHmiOperation} complete={completed} onComplete={finish} />
        </div>
      </section>
    </div>}
  </>;
}

function HmiView({ station, physicalChecks, operations, onOperation, complete, onComplete }: { station: Station; physicalChecks: string[]; operations: string[]; onOperation: (operation: string) => void; complete: boolean; onComplete: () => void }) {
  const releaseBlocked = station.tone === 'warn' || station.tone === 'off' || station.tone === 'hold';
  const walkaroundComplete = physicalChecks.length === 3;
  const operationSteps = HMI_OPERATIONS[station.id] ?? HMI_OPERATIONS['XRD-03'];
  const completedOperations = operationSteps.filter((operation) => operations.includes(operation)).length;
  const operationsComplete = operationSteps.every((operation) => operations.includes(operation));
  return <div className="console-view hmi-view compact-hmi-view">
    <div className="console-view-head compact-console-head"><div><p className="section-kicker">{station.id} · MACHINE CONTROL</p><h3>{station.state}</h3></div></div>
    <div className="compact-readouts">{station.technicianView.slice(0, 3).map((item) => { const [key, value = 'N/A'] = item.split(': '); return <div key={item}><span>{key}</span><b>{value}</b></div>; })}</div>
    <div className="hmi-operations">
      <div><p className="mini-label">OPERATING STEPS</p><span>{completedOperations} of {operationSteps.length}</span></div>
      {operationSteps.map((operation, index) => { const done = operations.includes(operation); const priorComplete = operationSteps.slice(0, index).every((prior) => operations.includes(prior)); const qualityBlocked = releaseBlocked && /^Execute\b/.test(operation); const active = walkaroundComplete && priorComplete && !done && !qualityBlocked; return <button key={operation} type="button" className={done ? 'done' : qualityBlocked && priorComplete ? 'quality-blocked' : active ? 'active' : ''} disabled={!walkaroundComplete || !priorComplete || done || qualityBlocked} onClick={() => onOperation(operation)}><i>{done ? '✓' : qualityBlocked && priorComplete ? '!' : `0${index + 1}`}</i><b>{operation}</b><small>{done ? 'Done' : qualityBlocked && priorComplete ? 'On hold' : active ? 'Ready' : 'Waiting'}</small></button>; })}
    </div>
    <ConsoleAction complete={complete} disabled={!walkaroundComplete || !operationsComplete} idle={!walkaroundComplete ? 'INSPECTION REQUIRED' : operationsComplete ? 'FINISH MACHINE CHECK' : 'COMPLETE THE STEPS'} done="CHECK COMPLETE" onClick={onComplete} />
  </div>;
}

function ConsoleAction({ complete, disabled = false, idle, done, onClick }: { complete: boolean; disabled?: boolean; idle: string; done: string; onClick: () => void }) {
  return <footer className="console-action"><i className={complete ? 'online' : ''} /><button type="button" disabled={disabled} className={complete ? 'complete' : ''} onClick={onClick}>{complete ? '✓ ' : ''}{complete ? done : idle}</button></footer>;
}
