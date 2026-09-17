'use client';

import { useMemo, useState } from 'react';
import { LabViewport } from './lab-viewport';
import { baseStations, type Station } from './sim-data';
import { StationAccess } from './station-access';
import { XrdWorkbench } from './xrd-workbench';
import { useXrdPresentation } from './xrd-bench/use-presentation';

export default function Home() {
  const { phase, context: xrdRunContext, result: xrdRunResult, updateStage: updateXrdBenchStage } = useXrdPresentation();
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('XRD-03');
  const [physicalInspections, setPhysicalInspections] = useState<Record<string, string[]>>({});

  const stations = useMemo(() => baseStations.map((station): Station => {
    if (station.id === 'XRD-03') return {
      ...station,
      state: phase >= 5 ? xrdRunResult?.held ? 'RUN HELD' : xrdRunResult?.supported ? 'CALL SAVED' : 'REVIEW' : phase === 4 ? 'INTERPRET' : phase === 3 ? 'SCANNING' : phase >= 1 ? 'LOCAL CONTROL' : 'FREE LAB READY',
      tone: phase >= 5 ? xrdRunResult?.held || !xrdRunResult?.supported ? 'warn' : 'ready' : phase >= 3 ? 'run' : 'ready',
      meta: phase >= 5 ? `${xrdRunResult?.sampleId ?? 'sample'} · ${xrdRunResult?.decision ?? '-'}` : phase === 4 ? `${xrdRunContext?.sampleId ?? 'sample'} · choose references` : phase === 3 ? `${xrdRunContext?.sampleId ?? 'sample'} · ${xrdRunContext?.scan ?? 'scan'}` : 'Choose sample · preparation · scan',
      technicianView: phase >= 5
        ? [`Sample: ${xrdRunResult?.sampleId ?? '-'}`, `Claim: ${xrdRunResult?.phases.join(' + ') ?? '-'}`, `Decision: ${xrdRunResult?.decision ?? '-'}`, `Support: ${xrdRunResult?.supported ? 'adequate' : 'weak'}`]
        : phase === 4
          ? [`Sample: ${xrdRunContext?.sampleId ?? '-'}`, 'Pattern: complete', `Preparation: ${xrdRunContext?.prep ?? '-'}`, 'Reference library: open']
          : phase === 3
            ? [`Sample: ${xrdRunContext?.sampleId ?? '-'}`, `Method: ${xrdRunContext?.scan ?? '-'}`, 'Acquisition: in progress']
            : ['Samples: 7 in queue', 'Mounts: front · back · spin · spike', 'Scan programs: 5', 'Reruns: enabled'],
    };
    return station;
  }), [phase, xrdRunContext, xrdRunResult]);

  const selected = stations.find((station) => station.id === selectedId) ?? stations[0];

  const recordInspection = (stationId: string, checks: string[]) => {
    setPhysicalInspections((current) => ({ ...current, [stationId]: checks }));
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand-name">MatterLab</h1>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-rail">
          <section className="rail-section shift-card">
            <p className="section-kicker">CURRENT MISSION</p>
            <h2>Explore the XRD</h2>
            <p>Choose a sample, change the setup, and compare what each run reveals.</p>
          </section>

          <section className="rail-section">
            <p className="section-kicker">MISSION STEPS</p>
            <ol className="task-list">
              <Task number="01" title="Build a run" note={phase >= 2 ? `${xrdRunContext?.sampleId ?? 'Sample'} · ${xrdRunContext?.prep ?? 'prepared'}` : 'Sample · mount · scan'} status={phase >= 2 ? 'done' : 'active'} onClick={() => setWorkbenchOpen(true)} />
              <Task number="02" title="Operate XRD-03" note={phase >= 4 ? 'Pattern retained' : phase === 3 ? `${xrdRunContext?.scan ?? 'Scan'} running` : 'Open · load · close · start'} status={phase >= 4 ? 'done' : phase >= 2 ? 'active' : 'pending'} onClick={() => setWorkbenchOpen(true)} />
              <Task number="03" title="Test a hypothesis" note={phase >= 5 ? xrdRunResult?.summary ?? 'Run saved' : 'References · rerun · hold'} status={phase >= 5 ? 'done' : phase >= 4 ? 'active' : 'pending'} onClick={() => setWorkbenchOpen(true)} />
            </ol>
          </section>
        </aside>

        <section className="lab-view">
          <LabViewport stations={stations} selectedId={selectedId} phase={phase} inspectionState={physicalInspections} onInspectionChange={recordInspection} onSelect={setSelectedId} />
        </section>

        <aside className="right-rail">
          <ActionPanel onOpen={() => setWorkbenchOpen(true)} />

          <section className="rail-section station-inspector">
            <div className="station-identity"><b>{selected.id}</b><h2 title={selected.purpose}>{selected.name}</h2></div>
            <StationAccess station={selected} physicalChecks={physicalInspections[selected.id] ?? []} />
          </section>
        </aside>
      </div>

      {workbenchOpen && <XrdWorkbench onStage={updateXrdBenchStage} onClose={() => setWorkbenchOpen(false)} />}
    </main>
  );
}

function Task({ number, title, note, status, onClick }: { number: string; title: string; note: string; status: 'done' | 'active' | 'pending'; onClick?: () => void }) {
  const content = <><span>{status === 'done' ? '✓' : number}</span><div><b>{title}</b><small>{note}</small></div></>;
  return <li className={status}>{onClick ? <button type="button" onClick={onClick}>{content}</button> : content}</li>;
}

function ActionPanel({ onOpen }: { onOpen: () => void }) {
  return <section className="rail-section alert-card tone-ready"><button className="primary-action" type="button" onClick={onOpen}>OPEN XRD<span>→</span></button></section>;
}
