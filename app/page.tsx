'use client';

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { DebriefVisual } from './debrief-visual';
import { CampaignControlModal } from './campaign-control';
import { getCampaignStationId, useCampaignSnapshot, useCampaignStation } from './campaign-context';
import { evaluateCampaignMission, getCampaignIdentity, getCampaignMission, getCampaignOperations, getCampaignSpec } from './campaign-spec';
import { LabViewport } from './lab-viewport';
import { subscribeLabEvent } from './lab-events';
import { MissionLabHeading, MissionTelemetry, PhysicalEvidenceCue, useModalFocusTrap } from './mission-ui';
import { baseStations, initialLog, type Station } from './sim-data';
import { AlternateShift, PlannerPanel, ShiftDeckModal, type ScenarioId } from './scenario-shifts';
import { StationAccess } from './station-access';

const TgaShift = lazy(() => import('./tga-shift').then((module) => ({ default: module.TgaShift })));
const FacilityShift = lazy(() => import('./facility-shift').then((module) => ({ default: module.FacilityShift })));

type Modal = 'qc' | 'lineage' | 'evidence' | 'sem' | 'campaign' | 'campaign-inventory' | 'campaign-facility' | 'deck' | 'complete' | null;
type LogItem = { time: string; type: string; text: string };
type Scores = { safety: number; traceability: number; integrity: number; uptime: number };

const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const ledgerStorageKey = 'mattershift-event-ledger-v1';

export default function Home() {
  const [scenario, setScenario] = useState<ScenarioId>('xrd');
  const [runKey, setRunKey] = useState(0);
  const chooseScenario = (next: ScenarioId) => {
    setScenario(next);
    setRunKey((value) => value + 1);
  };

  if (scenario === 'tga') return <Suspense fallback={<ShiftBoot label="THERMAL ANALYSIS" />}><TgaShift key={`tga-${runKey}`} onSwitch={chooseScenario} /></Suspense>;
  if (scenario === 'facility') return <Suspense fallback={<ShiftBoot label="FACILITY OPERATIONS" />}><FacilityShift key={`facility-${runKey}`} onSwitch={chooseScenario} /></Suspense>;
  if (scenario !== 'xrd') return <AlternateShift key={`${scenario}-${runKey}`} scenarioId={scenario} onSwitch={chooseScenario} />;
  return <XrdShift key={`xrd-${runKey}`} onSwitch={chooseScenario} />;
}

function ShiftBoot({ label }: { label: string }) {
  return <main className="shift-boot" role="status" aria-label={`Loading ${label.toLowerCase()} scenario`}>
    <div className="shift-boot-mark">M<span>²</span></div>
    <div className="shift-boot-rails" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
    <div className="shift-boot-readout"><span /><div><b>LOADING SCENARIO</b><small>{label} · simulated challenge</small></div></div>
  </main>;
}

function XrdShift({ onSwitch }: { onSwitch: (scenario: ScenarioId) => void }) {
  const campaign = useCampaignSnapshot();
  const campaignSpec = getCampaignSpec(campaign.selected);
  const campaignObservedSpec = campaign.resultMeasured ? { ...campaignSpec, measured: campaign.resultMeasured } : campaignSpec;
  const campaignIdentity = getCampaignIdentity(campaign.runNumber);
  const campaignOperations = getCampaignOperations(campaign.runNumber, campaign.thermalBayLevel);
  const campaignMission = getCampaignMission(campaign.missionId);
  const campaignEvaluation = evaluateCampaignMission(campaignObservedSpec, campaign.missionId, campaign.stage >= 7 ? campaign.resultElapsed : undefined);
  const confirmationSpread = campaign.confirmationSource ? Math.abs(Number(campaign.resultMeasured) - Number(campaign.confirmationSource.measured)).toFixed(1) : '';
  const [campaignMode, setCampaignMode] = useState(false);
  const campaignActive = campaignMode && campaign.stage > 0;
  const [phase, setPhase] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedOverride, setSelectedId] = useState('');
  const selectedId = selectedOverride || (campaignActive ? getCampaignStationId(campaign.stage) : '') || 'XRD-03';
  const [minute, setMinute] = useState(8 * 60 + 16);
  const [log, setLog] = useState<LogItem[]>(initialLog);
  const [logOpen, setLogOpen] = useState(false);
  const [qcRan, setQcRan] = useState(false);
  const [labelsScanned, setLabelsScanned] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [scores, setScores] = useState<Scores>({ safety: 100, traceability: 100, integrity: 100, uptime: 100 });
  const [physicalInspections, setPhysicalInspections] = useState<Record<string, string[]>>({});

  useEffect(() => {
    return subscribeLabEvent('campaign-state', ({ stage }) => {
      const campaignStation = getCampaignStationId(stage);
      if (campaignStation) setSelectedId(campaignStation);
    });
  }, []);

  useEffect(() => {
    return subscribeLabEvent('open-campaign', ({ view }) => {
      setCampaignMode(true);
      setModal(view === 'facility' ? 'campaign-facility' : 'campaign');
    });
  }, []);

  useEffect(() => {
    return subscribeLabEvent('open-material-staging', () => {
      setSelectedId('PREP-01');
      setModal('campaign-inventory');
    });
  }, []);

  useEffect(() => {
    return subscribeLabEvent('station-event', ({ type, text }) => {
      setMinute((currentMinute) => {
        const nextMinute = currentMinute + 1;
        setLog((items) => [...items, { time: formatTime(nextMinute), type, text }]);
        return nextMinute;
      });
    });
  }, []);

  const stations = useMemo(() => baseStations.map((station): Station => {
    if (station.id === 'FURN-04' && campaign.thermalBayLevel >= 2) return {
      ...station,
      name: 'Dual-chamber furnace',
      state: 'A RUN / B READY',
      tone: 'ready',
      meta: `A ${campaignOperations.activeFurnaceRun} · B qualified`,
      technicianView: [
        `Chamber A: ${campaignOperations.activeFurnaceRun}`,
        'Chamber B: qualified',
        'Uniformity: 7.4 °C span',
        'Qualification: IQ / OQ retained',
      ],
      dataProducts: [...station.dataProducts, 'thermal uniformity record'],
    };
    if (station.id === 'XRD-03' && phase >= 1) return {
      ...station,
      state: phase === 4 ? 'RUN COMPLETE' : phase === 3 ? 'ANALYZING' : 'READY',
      tone: phase === 4 || phase === 3 ? 'run' : 'ready',
      meta: phase === 4 ? 'Pattern + fit available' : phase === 3 ? 'CA-TI-031 · diffraction scan active' : 'Silicon QC check · +0.02° 2θ',
      technicianView: phase === 4
        ? ['QC state: in control', 'Run: CA-TI-031', 'Target phase: 94.2%', 'Review: anomaly open']
        : phase === 3
          ? ['QC state: in control', 'Run: CA-TI-031', 'Scan range: 10–80° 2θ', 'Acquisition: in progress']
        : ['QC material: silicon reference', 'Fresh QC check: passed', 'Old sample results: recheck'],
    };
    if (station.id === 'ROBO-02' && phase >= 2) return {
      ...station,
      state: 'READY',
      tone: 'ready',
      meta: phase === 3 ? 'Verified samples delivered to XRD' : 'Carrier handshake complete',
      technicianView: phase === 3
        ? ['Safety zone: clear', 'Gripper: parked', 'Verified samples: delivered', 'Destination: XRD']
        : ['Safety zone: clear', 'Gripper: powder carrier', 'Carrier handshake: complete', 'Exceptions today: 1'],
    };
    if (station.id === 'FURN-04' && phase >= 4) return { ...station, state: 'READY', tone: 'ready', meta: 'Cycle complete · trace retained' };
    if (station.id === 'SEM-01' && phase >= 5) return {
      ...station,
      state: phase >= 6 ? 'FOLLOW-UP COMPLETE' : 'TRIAGE QUEUED',
      tone: phase >= 6 ? 'ready' : 'warn',
      meta: phase >= 6 ? 'Multi-field map linked · scientist review' : 'Inclusion follow-up',
      technicianView: phase >= 6
        ? ['Vacuum: stable', 'Fields acquired: 4', 'EDS map: linked', 'Review: scientist queue']
        : ['Vacuum: stable', 'Target: bright inclusion', 'Coverage: 1 field only'],
    };
    return station;
  }), [phase, campaign.thermalBayLevel, campaignOperations.activeFurnaceRun]);

  const selectedBase = stations.find((station) => station.id === selectedId) ?? stations[0];
  const campaignSelected = useCampaignStation(selectedBase);
  const selected = campaignActive ? campaignSelected : selectedBase;
  const selectedInspectionKey = campaignActive && getCampaignStationId(campaign.stage) === selected.id
    ? `${selected.id}:RUN-${campaign.runNumber}:${campaign.selected}`
    : selected.id;
  const completedTasks = phase === 0 ? 0 : phase === 1 ? 1 : phase === 2 ? 2 : phase <= 4 ? 3 : phase === 5 ? 4 : 5;
  const campaignCompletedTasks = campaign.stage >= 9 ? 7 : campaign.stage >= 8 ? 6 : campaign.stage >= 7 ? 5 : campaign.stage >= 6 ? 4 : campaign.stage >= 5 ? 3 : campaign.stage >= 4 ? 2 : campaign.stage >= 2 ? 1 : 0;
  const displayedCompletedTasks = campaignActive ? campaignCompletedTasks : completedTasks;
  const taskTotal = campaignActive ? 7 : 5;
  const progress = Math.round((displayedCompletedTasks / taskTotal) * 100);
  const labObjective = campaignActive
    ? `Continue ${campaignIdentity.runId}: ${campaignSpec.name}`
    : [
      'Measure the silicon QC material on XRD-03',
      'Find the mislabeled specimen',
      'Send five checked samples to the robot',
      'Complete the active test run',
      'Review the unexpected XRD peak',
      'Inspect four preplanned microscope locations',
      'Review the mission summary',
    ][phase] ?? 'Review the mission summary';
  const campaignTasks = [
    { number: '01', title: 'Prepare formulation', note: campaign.stage >= 2 ? `${campaignIdentity.prepSample} released` : `${campaignSpec.targetMass} · ${campaignSpec.formula}`, start: 1, complete: 2 },
    { number: '02', title: 'Run robot synthesis', note: campaign.stage === 2 ? campaignOperations.robotCondition === 'contamination' ? 'Cleanliness witness due' : campaignOperations.robotCondition === 'grip-force' ? 'Grip-force witness due' : 'Tool ID + handshake check' : campaign.stage >= 4 ? `${campaignIdentity.carrier} dosed` : '6 crucible positions', start: 2, complete: 4 },
    { number: '03', title: 'Clear furnace queue', note: campaign.stage >= 5 ? 'Capacity slot secured' : `Q01 · ${campaignOperations.queueMinutes} min`, start: 4, complete: 5 },
    { number: '04', title: 'Execute thermal profile', note: campaign.stage >= 6 ? `${campaignSpec.profile} retained` : campaign.stage === 5 && campaignOperations.furnaceConstraint ? campaignOperations.furnaceCondition === 'thermocouple-drift' ? 'TC offset recovery due' : 'Door-seal recovery due' : `${campaignSpec.temperature} · ${campaignSpec.dwell}`, start: 5, complete: 6 },
    { number: '05', title: 'Qualify XRD result', note: campaign.stage >= 7 ? `${campaignIdentity.pattern} qualified` : campaignOperations.referenceCondition === 'age-due' ? 'NIST SRM 640f QC check due' : campaignOperations.referenceCondition === 'trend-review' ? 'Silicon QC trend review' : 'Current silicon QC check', start: 6, complete: 7 },
    { number: '06', title: campaign.confirmationSource ? 'Judge reproducibility' : 'Judge mission result', note: campaign.stage >= 7 ? campaign.confirmationSource ? `${confirmationSpread} pp spread · ${campaignEvaluation.met ? 'boundary repeated' : 'not repeated'}` : `${campaignEvaluation.resultText} · ${campaignEvaluation.met ? 'pass' : 'miss'}` : campaignMission.target, start: 7, complete: 8 },
    { number: '07', title: 'Test mechanism', note: campaign.stage >= 9 ? 'Four-location map linked' : 'SEM / EDS diagnostic branch', start: 8, complete: 9 },
  ];
  const campaignLineage = campaign.stage <= 1
    ? { nodes: [campaignSpec.id, campaignIdentity.prepSample, campaignIdentity.carrier], note: `${campaignSpec.precursorLabel} are being weighed and bound to the campaign manifest.` }
    : campaign.stage <= 3
      ? { nodes: [campaignIdentity.prepSample, campaignIdentity.carrier, '6× CRUC'], note: campaign.stage === 2 ? campaignOperations.robotCondition === 'contamination' ? 'Material is held before dosing until the cleanliness witness passes.' : campaignOperations.robotCondition === 'grip-force' ? 'Material is held before dosing until the jaw-force witness passes.' : 'Material is staged while tool identity and the carrier handshake are proved.' : 'Six crucible positions are linked to the governed robot program.' }
      : campaign.stage <= 5
        ? { nodes: [campaignIdentity.carrier, campaignIdentity.thermalSample, campaignSpec.profile], note: campaign.stage === 4 ? campaign.thermalBayLevel >= 2 ? `Carrier custody is retained while ${campaignOperations.furnaceLane} start-readiness is proved.` : 'Carrier custody is retained while the single-capacity furnace clears.' : campaignOperations.furnaceConstraint ? 'The loaded specimen remains held while the furnace condition is recovered and independently proved.' : 'The loaded specimen remains held behind the furnace start-readiness proof.' }
        : campaign.stage <= 7
          ? { nodes: [campaignIdentity.thermalSample, campaignIdentity.xrdDataset, campaignIdentity.pattern], note: campaign.stage === 6 ? campaignOperations.referenceCondition === 'age-due' ? 'Sample testing is blocked until the silicon QC material passes.' : campaignOperations.referenceCondition === 'trend-review' ? 'The silicon QC position trend is being confirmed before the sample is measured.' : 'The current silicon QC check is being reviewed before the sample is measured.' : `${campaignIdentity.pattern} is qualified and linked to ${campaignObservedSpec.measured}% target phase.` }
          : { nodes: [campaignIdentity.thermalSample, `SEM-${campaignIdentity.suffix}`, `EDS-${campaignIdentity.suffix}`], note: campaign.stage === 8 ? 'Four preplanned, separated fields and one elemental map are in acquisition.' : 'Multi-location microscopy evidence is linked as a mechanism hypothesis.' };
  const appendLog = (type: string, text: string, addMinutes = 0) => {
    const nextMinute = minute + addMinutes;
    setMinute(nextMinute);
    setLog((items) => [...items, { time: formatTime(nextMinute), type, text }]);
  };

  const recordInspection = (stationId: string, checks: string[]) => {
    const wasComplete = (physicalInspections[stationId]?.length ?? 0) === 3;
    setPhysicalInspections((current) => ({ ...current, [stationId]: checks }));
    if (!wasComplete && checks.length === 3) appendLog('inspection', `${stationId} physical walkaround completed; ${checks.join(', ')} linked to the local-console evidence gate.`, 1);
  };

  const penalize = (key: keyof Scores, amount: number) => {
    setScores((current) => ({ ...current, [key]: Math.max(0, current[key] - amount) }));
  };

  const reward = (updates: Partial<Scores>) => {
    setScores((current) => ({
      safety: Math.min(current.safety, updates.safety ?? current.safety),
      traceability: Math.min(current.traceability, updates.traceability ?? current.traceability),
      integrity: Math.min(current.integrity, updates.integrity ?? current.integrity),
      uptime: Math.min(current.uptime, updates.uptime ?? current.uptime),
    }));
  };

  const openQc = () => { setFeedback(''); setModal('qc'); setSelectedId('XRD-03'); };

  const runReference = () => {
    setQcRan(true);
    setFeedback('Fresh silicon QC check passed.');
    appendLog('qc', 'A fresh silicon QC check passed on the XRD.', 8);
  };

  const dispositionQc = (correct: boolean) => {
    if (!correct) {
      setFeedback('The old results were recorded before the passing check. They cannot be released yet.');
      penalize('integrity', 18);
      appendLog('exception', 'Tried to use results acquired before the passing XRD check. The release was blocked.', 2);
      return;
    }
    setPhase(1);
    reward({ integrity: scores.integrity + 20, uptime: scores.uptime - 2 });
    setFeedback('Correct: the instrument is returned to service, while affected results remain held and are queued for reacquisition.');
    appendLog('decision', 'XRD-03 returned to service; affected campaign results invalidated and queued for reacquisition.', 3);
    window.setTimeout(() => setModal(null), 650);
  };

  const openLineage = () => { setFeedback(''); setModal('lineage'); setSelectedId('ROBO-02'); };

  const resolveLineage = (correct: boolean) => {
    if (!correct) {
      setFeedback('A manifest can be wrong. Reprinting it without checking the physical specimen would create an incorrect sample record.');
      penalize('traceability', 20);
      appendLog('exception', 'Label reprint requested before physical/material reconciliation; action blocked by simulation.', 2);
      return;
    }
    setPhase(2);
    reward({ traceability: scores.traceability + 18, integrity: scores.integrity + 4 });
    setFeedback('Correct: the mismatched sample is set aside until its preparation record is checked.');
    appendLog('lineage', 'The mismatched sample was set aside and its preparation record was checked.', 9);
    window.setTimeout(() => setModal(null), 750);
  };

  const releaseCarrier = () => {
    setPhase(3);
    setSelectedId('XRD-03');
    reward({ uptime: scores.uptime + 2 });
    appendLog('transfer', 'The robot delivered five verified samples to the XRD; the mismatched sample remains set aside.', 4);
  };

  const advanceRun = () => {
    setPhase(4);
    setSelectedId('XRD-03');
    appendLog('result', 'Thermal cycle and XRD reacquisition complete; native traces, method revisions, and reports linked.', 82);
    setModal('evidence');
    setFeedback('');
  };

  const decideEvidence = (correct: boolean) => {
    if (!correct) {
    setFeedback('The automated suggestion uses the reported phase result, but the diffraction pattern still contains an unresolved peak that needs review.');
      penalize('integrity', 15);
      appendLog('exception', 'Automated next-run suggestion accepted before the unresolved peak was reviewed. The decision was blocked.', 3);
      return;
    }
    setPhase(5);
    reward({ integrity: scores.integrity + 14, traceability: scores.traceability + 4 });
    appendLog('decision', 'Next synthesis held; unresolved XRD peak routed to SEM/EDS follow-up and scientist review.', 6);
    setSelectedId('SEM-01');
    setModal('sem');
    setFeedback('');
  };

  const decideSem = (correct: boolean) => {
    if (!correct) {
      setFeedback('A single high-contrast field can localize an inclusion, but it cannot establish that the feature represents the bulk specimen.');
      penalize('integrity', 12);
      appendLog('exception', 'Single SEM field offered as a bulk explanation; report blocked until all four preplanned locations are measured.', 4);
      return;
    }
    setPhase(6);
    reward({ integrity: scores.integrity + 9, traceability: scores.traceability + 3, uptime: scores.uptime - 2 });
    appendLog('result', 'Four microscope fields and one elemental map were linked; interpretation was routed for review.', 24);
    setModal('complete');
    setFeedback('');
  };

  const resetShift = () => {
    try { window.localStorage.removeItem(ledgerStorageKey); } catch { /* no-op */ }
    window.location.reload();
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand-name">MatterLab</h1>
        </div>
        <div className="header-actions">
          <button className="campaign-button" type="button" aria-label="Open optional expert campaign sandbox" onClick={() => { setCampaignMode(true); setModal('campaign'); }}>EXPERT SANDBOX</button>
          <button className="deck-button" type="button" onClick={() => setModal('deck')}>SCENARIOS <span>5</span></button>
          <button type="button" onClick={() => setLogOpen(true)}>EVIDENCE LOG</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-rail">
          <section className="rail-section shift-card">
            <p className="section-kicker">CURRENT MISSION</p>
            <h2>{campaignActive ? campaignSpec.name : 'Get the XRD station back on track'}</h2>
            <p>{campaignActive ? `Make ${campaignSpec.formula}, test it, and decide whether the result meets the goal.` : 'Check the instrument, fix one label problem, then review the result.'}</p>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <div className="progress-meta"><span>{displayedCompletedTasks} / {taskTotal} tasks</span><span>{progress}%</span></div>
            {!campaignActive && <MissionTelemetry blockedAttempts={log.filter((event) => event.type === 'exception').length} evidenceCount={Math.max(0, log.length - initialLog.length)} />}
          </section>

          <section className="rail-section">
            <p className="section-kicker">MISSION STEPS</p>
            <ol className="task-list">
              {campaignActive ? campaignTasks.map((task) => {
                const status = campaign.stage >= task.complete ? 'done' : campaign.stage >= task.start ? 'active' : 'pending';
                return <Task key={task.number} number={task.number} title={task.title} note={task.note} status={status} onClick={status === 'active' ? () => setModal('campaign') : undefined} />;
              }) : <>
                <Task number="01" title="Check the XRD" note={phase >= 1 ? 'Machine QC check passed' : 'Silicon QC peak is outside limit'} status={phase >= 1 ? 'done' : 'active'} onClick={phase < 1 ? openQc : undefined} />
                <Task number="02" title="Fix the sample label" note={phase >= 2 ? 'Mismatch safely resolved' : 'One label may be wrong'} status={phase >= 2 ? 'done' : phase === 1 ? 'active' : 'pending'} onClick={phase === 1 ? openLineage : undefined} />
                <Task number="03" title="Start the robot" note={phase >= 3 ? 'Five samples accepted' : phase === 2 ? 'Five samples ready' : 'Waiting for sample check'} status={phase >= 3 ? 'done' : phase === 2 ? 'active' : 'pending'} onClick={phase === 2 ? releaseCarrier : undefined} />
                <Task number="04" title={phase === 3 ? 'See the result' : 'Review the result'} note={phase >= 5 ? 'Unexpected peak flagged' : phase === 3 ? 'Test run is ready' : 'Look for unexplained evidence'} status={phase >= 5 ? 'done' : phase === 3 || phase === 4 ? 'active' : 'pending'} onClick={phase === 3 ? advanceRun : phase === 4 ? () => setModal('evidence') : undefined} />
                <Task number="05" title="Inspect with the microscope" note={phase >= 6 ? 'Four fields checked' : 'Check whether the feature repeats'} status={phase >= 6 ? 'done' : phase === 5 ? 'active' : 'pending'} onClick={phase === 5 ? () => { setSelectedId('SEM-01'); setModal('sem'); } : undefined} />
              </>}
            </ol>
          </section>
        </aside>

        <section className="lab-view">
          <MissionLabHeading objective={labObjective} stationId={selected.id} stationState={selected.state} stationTone={selected.tone} />

          <LabViewport stations={stations} selectedId={selectedId} phase={phase} campaignEnabled={campaignMode} inspectionState={physicalInspections} onInspectionChange={recordInspection} onSelect={setSelectedId} />

        </section>

        <aside className="right-rail">
          <ActionPanel phase={phase} campaignActive={campaignActive} onCampaign={() => setModal('campaign')} onQc={openQc} onLineage={openLineage} onRelease={releaseCarrier} onAdvance={advanceRun} onEvidence={() => setModal('evidence')} onSem={() => { setSelectedId('SEM-01'); setModal('sem'); }} onComplete={() => setModal('complete')} />

          {!campaignActive && <PhysicalEvidenceCue stationId={selected.id} checks={physicalInspections[selectedInspectionKey] ?? []} />}

          <section className="rail-section station-inspector">
            <div className="section-title-row"><p className="section-kicker">SELECTED EQUIPMENT</p><span className={selected.tone}>{selected.state}</span></div>
            <div className="station-identity"><b>{selected.id}</b><h2>{selected.name}</h2></div>
            <p>{selected.purpose}</p>
            <StationAccess station={selected} scenarioId="xrd" campaignEnabled={campaignMode} physicalChecks={physicalInspections[selectedInspectionKey] ?? []} />
          </section>

          {campaignActive && <PlannerPanel scenario="xrd" phase={phase} campaignActive />}

          <section className="rail-section lineage-card">
            <div className="section-title-row"><p className="section-kicker">SAMPLE LINEAGE</p><span>SIM</span></div>
            <div className="lineage-flow"><span>{campaignActive ? campaignLineage.nodes[0] : 'LOT-91'}</span><i>→</i><span>{campaignActive ? campaignLineage.nodes[1] : 'BC-184'}</span><i>→</i><span>{campaignActive ? campaignLineage.nodes[2] : phase >= 2 ? '5× ELIG' : '6× SPEC'}</span></div>
            <p>{campaignActive ? campaignLineage.note : phase >= 2 ? 'Five specimens cleared; specimen 06 is quarantined with a correction record.' : 'One physical label does not match the carrier manifest.'}</p>
          </section>
        </aside>
      </div>

      {modal === 'qc' && <QcModal ran={qcRan} physicalChecks={physicalInspections['XRD-03'] ?? []} feedback={feedback} onRun={runReference} onDisposition={dispositionQc} onClose={() => setModal(null)} />}
      {modal === 'lineage' && <LineageModal scanned={labelsScanned} onScan={() => { setLabelsScanned(true); setFeedback('Mismatch found: the list says A-06; the physical label says B-06.'); appendLog('lineage', 'The label scan found one identifier mismatch.', 3); }} feedback={feedback} onResolve={resolveLineage} onClose={() => setModal(null)} />}
      {modal === 'evidence' && <EvidenceModal feedback={feedback} onDecide={decideEvidence} onClose={() => setModal(null)} />}
      {modal === 'sem' && <SemEdsModal feedback={feedback} onDecide={decideSem} onClose={() => setModal(null)} />}
      {(modal === 'campaign' || modal === 'campaign-inventory' || modal === 'campaign-facility') && <CampaignControlModal autoOpenInventory={modal === 'campaign-inventory'} autoOpenFacility={modal === 'campaign-facility'} onClose={() => setModal(null)} />}
      {modal === 'deck' && <ShiftDeckModal active="xrd" onChoose={onSwitch} onExpert={() => { setCampaignMode(true); setModal('campaign'); }} onClose={() => setModal(null)} />}
      {modal === 'complete' && <CompleteModal scores={scores} elapsedMinutes={minute - (8 * 60 + 16)} logCount={Math.max(0, log.length - initialLog.length)} exceptionCount={log.filter((event) => event.type === 'exception').length} onReset={resetShift} onDeck={() => setModal('deck')} onClose={() => setModal(null)} />}
      {logOpen && <LedgerDrawer log={log} onClose={() => setLogOpen(false)} />}
    </main>
  );
}

function Task({ number, title, note, status, onClick }: { number: string; title: string; note: string; status: 'done' | 'active' | 'pending'; onClick?: () => void }) {
  const content = <><span>{status === 'done' ? '✓' : number}</span><div><b>{title}</b><small>{note}</small></div></>;
  return <li className={status}>{onClick ? <button type="button" onClick={onClick}>{content}</button> : content}</li>;
}

function ActionPanel({ phase, campaignActive, onCampaign, onQc, onLineage, onRelease, onAdvance, onEvidence, onSem, onComplete }: { phase: number; campaignActive: boolean; onCampaign: () => void; onQc: () => void; onLineage: () => void; onRelease: () => void; onAdvance: () => void; onEvidence: () => void; onSem: () => void; onComplete: () => void }) {
  const campaign = useCampaignSnapshot();
  if (campaignActive && campaign.stage > 0) {
    const spec = getCampaignSpec(campaign.selected);
    const observedSpec = campaign.resultMeasured ? { ...spec, measured: campaign.resultMeasured } : spec;
    const identity = getCampaignIdentity(campaign.runNumber);
    const operations = getCampaignOperations(campaign.runNumber, campaign.thermalBayLevel);
    const mission = getCampaignMission(campaign.missionId);
    const evaluation = evaluateCampaignMission(observedSpec, campaign.missionId, campaign.stage >= 7 ? campaign.resultElapsed : undefined);
    const campaignStates = {
      1: { tag: 'CAMPAIGN EXECUTION', title: `${identity.runId} powder preparation`, body: `${spec.formula} is released to PREP-01. Physical lot, mass, and enclosure checks own the next gate.`, metric: spec.targetMass, tone: 'run' },
      2: operations.robotCondition === 'contamination'
        ? { tag: 'ROBOT CELL HOLD', title: 'Gripper cleanliness fault', body: 'The robot stopped before dosing. A cleaned gripper and witness coupon are required before material behavior can be trusted.', metric: `${operations.robotRecoveryMinutes} min recovery`, tone: 'warn' }
        : operations.robotCondition === 'grip-force'
          ? { tag: 'ROBOT TOOLING CHECK', title: 'Grip-force drift detected', body: 'The pre-dose tool check is outside its nominal band. Inspect the jaw pads and retain a force witness before handling the carrier.', metric: `${operations.robotRecoveryMinutes} min verification`, tone: 'warn' }
          : { tag: 'ROBOT CELL READINESS', title: `${identity.runId} setup proof`, body: 'The robot is nominal. Confirm tool identity and the carrier handshake before enabling six-position dosing.', metric: `${operations.robotRecoveryMinutes} min setup`, tone: 'run' },
      3: { tag: 'ROBOT SYNTHESIS', title: `${identity.carrier} in dosing`, body: 'Six crucible positions are executing under the governed carrier handshake.', metric: '6 positions', tone: 'run' },
      4: { tag: campaign.thermalBayLevel >= 2 ? 'THERMAL LANE READINESS' : 'FURNACE BOTTLENECK', title: `${identity.runId} · ${operations.furnaceLane}`, body: campaign.thermalBayLevel >= 2 ? `Chamber A remains occupied by ${operations.activeFurnaceRun}. Qualified chamber B needs an independent readiness proof before load.` : `FURN-04 is capacity one. ${operations.activeFurnaceRun} must complete and the carrier hold location must be proven.`, metric: `${operations.furnaceLane} · ${operations.queueMinutes} min`, tone: 'warn' },
      5: operations.furnaceCondition === 'thermocouple-drift'
        ? { tag: 'FURNACE CONDITION HOLD', title: 'Witness thermocouple bias', body: `${operations.furnaceResult} must be corrected with a qualified controller offset and an independent overtemperature proof before ${spec.profile} can start.`, metric: `${operations.furnaceRecoveryMinutes} min recovery`, tone: 'warn' }
        : operations.furnaceCondition === 'door-seal'
          ? { tag: 'FURNACE CONDITION HOLD', title: 'Door-seal uniformity loss', body: `${operations.furnaceResult} requires gasket inspection, latch adjustment, and a stable door-chain proof before ${spec.profile} can start.`, metric: `${operations.furnaceRecoveryMinutes} min recovery`, tone: 'warn' }
          : { tag: 'THERMAL START READINESS', title: `${spec.profile} loaded`, body: `${identity.thermalSample} is loaded. The safety chain and controller agreement still own the start gate.`, metric: `${operations.furnaceRecoveryMinutes} min setup`, tone: 'run' },
      6: operations.referenceCondition === 'age-due'
        ? { tag: 'XRD QUALITY GATE', title: `${identity.runId} sample testing blocked`, body: 'A current NIST SRM 640f silicon QC check must pass before the campaign sample can be measured.', metric: `${operations.referenceAgeHours} h since QC`, tone: 'warn' }
        : operations.referenceCondition === 'trend-review'
          ? { tag: 'XRD TREND REVIEW', title: `${identity.runId} awaiting confirmation`, body: 'The silicon QC check is still current, but its position trend needs confirmation before the sample is measured.', metric: `${operations.referenceAgeHours} h QC check`, tone: 'run' }
          : { tag: 'XRD ACQUISITION', title: `${identity.runId} ready to measure`, body: 'The silicon QC check is current. Review it, prove the shutter chain, and acquire the sample pattern.', metric: `${operations.referenceAgeHours} h QC check`, tone: 'run' },
      7: campaign.confirmationSource
        ? { tag: evaluation.met ? 'BOUNDARY REPEATED' : 'REPEAT FAILURE', title: `${identity.runId} · ${spec.id} repeat`, body: `The unchanged recipe moved from ${campaign.confirmationSource.measured}% to ${campaign.resultMeasured}%. ${evaluation.met ? 'The mission boundary repeated; inspect the comparability audit before claiming robustness.' : 'The mission boundary did not repeat; return to design or acquire mechanism evidence.'}`, metric: `${Math.abs(Number(campaign.resultMeasured) - Number(campaign.confirmationSource.measured)).toFixed(1)} pp spread`, tone: 'ready' }
        : { tag: evaluation.met ? 'SCIENTIFIC MISSION MET' : 'VALID MISSION MISS', title: `${identity.runId} · ${mission.label}`, body: `The silicon QC check passed at ${operations.referenceResult}. ${evaluation.resultText}; ${evaluation.constraintText}. The qualified result remains useful evidence.`, metric: evaluation.gap, tone: 'ready' },
      8: { tag: 'SEM / EDS FOLLOW-UP', title: `${identity.runId} diagnostic branch`, body: 'Measure four preplanned, separated locations and one matching EDS map before suggesting a mechanism.', metric: '0 / 4 locations', tone: 'run' },
      9: { tag: 'DIAGNOSIS LINKED', title: `${identity.runId} mechanism hypothesis`, body: `${spec.id === 'D-08' ? 'Ti-rich cores' : 'Ca-rich secondary grains'} are retained as a follow-up hypothesis, not treated as bulk proof.`, metric: '4 / 4 fields', tone: 'ready' },
    } as const;
    const state = campaignStates[campaign.stage as keyof typeof campaignStates] ?? campaignStates[7];
    return <section className={`rail-section alert-card tone-${state.tone}`}><div className="alert-head"><span>{state.tag}</span><b>RUN-{identity.suffix}</b></div><h2>{state.title}</h2><div className="metric-row"><span>Current state</span><strong>{state.metric}</strong></div><p>{state.body}</p><button className="primary-action" type="button" onClick={onCampaign}>OPEN CAMPAIGN CONTROL<span>→</span></button></section>;
  }
  const states = [
    { tag: 'NEXT STEP', title: 'Check the XRD reading', body: 'The last silicon QC check failed. Run a fresh check before using sample results.', metric: 'QC check failed', action: 'CHECK THE XRD', fn: onQc, tone: 'warn' },
    { tag: 'NEXT STEP', title: 'One sample label does not match', body: 'Scan the carrier and find the sample that was labeled incorrectly.', metric: '6 samples', action: 'SCAN THE SAMPLES', fn: onLineage, tone: 'warn' },
    { tag: 'NEXT STEP', title: 'The samples are ready', body: 'The machine check passed and the mismatched sample is safely set aside.', metric: '5 ready', action: 'START ROBOT', fn: onRelease, tone: 'ready' },
    { tag: 'IN PROGRESS', title: 'The XRD test is underway', body: 'The robot delivered the carrier. Finish the scan to reveal the pattern.', metric: 'Running', action: 'COMPLETE RUN', fn: onAdvance, tone: 'run' },
    { tag: 'NEXT STEP', title: 'There is an unexpected peak', body: 'The main result looks good, but the chart contains one signal we cannot yet explain.', metric: '1 unknown peak', action: 'REVIEW THE RESULT', fn: onEvidence, tone: 'warn' },
    { tag: 'NEXT STEP', title: 'Take a closer look', body: 'Use the microscope to check whether the unusual feature appears across the sample.', metric: 'Microscope ready', action: 'CHECK FOUR AREAS', fn: onSem, tone: 'warn' },
    { tag: 'MISSION COMPLETE', title: 'Good work', body: 'You checked the machine, protected the sample record, and investigated the unexpected result.', metric: '5 / 5', action: 'VIEW SUMMARY', fn: onComplete, tone: 'ready' },
  ];
  const state = states[phase] ?? states[6];
  return <section className={`rail-section alert-card tone-${state.tone}`}><div className="alert-head"><span>{state.tag}</span><b>{phase >= 6 ? 'DONE' : 'ACTIVE'}</b></div><h2>{state.title}</h2><div className="metric-row"><span>Status</span><strong>{state.metric}</strong></div><p>{state.body}</p><button className="primary-action" type="button" onClick={state.fn}>{state.action}<span>→</span></button></section>;
}

function ModalShell({ title, kicker, children, onClose, wide = false }: { title: string; kicker: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const dialogRef = useModalFocusTrap();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation"><section ref={dialogRef} className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</section></div>;
}

function QcModal({ ran, physicalChecks, feedback, onRun, onDisposition, onClose }: { ran: boolean; physicalChecks: string[]; feedback: string; onRun: () => void; onDisposition: (correct: boolean) => void; onClose: () => void }) {
  const items = [
    { key: 'holder' as const, hotspot: 'HOLDER', title: 'Sample holder' },
    { key: 'display' as const, hotspot: 'HMI', title: 'QC status screen' },
    { key: 'interlock' as const, hotspot: 'SHUTTER', title: 'Safety cover' },
  ];
  return <ModalShell title="Check the XRD" kicker="STEP 1 · MACHINE CHECK" onClose={onClose} wide>
    <div className="modal-grid qc-grid"><div><p className="modal-intro">The previous QC check failed. A service note says the repair is complete. Verify that claim with a fresh measurement.</p><div className="evidence-brief">{items.map((item) => { const observed = physicalChecks.includes(item.hotspot); return <article key={item.key} className={observed ? 'observed' : ''} aria-label={`${item.title}; ${observed ? 'observed in the 3D walkaround' : 'not yet observed in the 3D walkaround'}`}><i>{observed ? '✓' : '•'}</i><div><b>{item.title}</b><small>{observed ? 'Observed in 3D' : 'Not inspected'}</small></div></article>; })}</div><button className="modal-run" type="button" disabled={ran} onClick={onRun}>{ran ? 'FRESH QC CHECK PASSED' : 'RUN A FRESH QC CHECK'}</button>{!ran && <button className="blank-release-shortcut" type="button" onClick={() => onDisposition(false)}>Trust the service note without testing</button>}</div><div className="control-card"><p className="mini-label">QC STATUS</p><div className="result-box"><span>PREVIOUS CHECK</span><b>FAILED</b><span>FRESH CHECK</span><b>{ran ? 'PASSED' : 'NOT RUN'}</b></div>{ran && <div className="decision-stack"><p className="mini-label">WHAT HAPPENS TO RESULTS MADE BEFORE THE PASS?</p><button type="button" onClick={() => onDisposition(true)}>Keep them blocked and measure again</button><button type="button" className="secondary" onClick={() => onDisposition(false)}>Use them because the machine passes now</button></div>}</div></div>{feedback && <p className={`feedback ${feedback.startsWith('The old results') ? 'bad' : ''}`}>{feedback}</p>}
  </ModalShell>;
}

function LineageModal({ scanned, onScan, feedback, onResolve, onClose }: { scanned: boolean; onScan: () => void; feedback: string; onResolve: (correct: boolean) => void; onClose: () => void }) {
  const samples = ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', scanned ? 'B-06' : 'A-06'];
  return <ModalShell title="Find the mismatched label" kicker="STEP 2 · SAMPLE CHECK" onClose={onClose} wide><p className="modal-intro">Compare the six physical labels with the sample list. One may not belong.</p><div className="sample-tray">{samples.map((id, index) => <div key={index} className={scanned && index === 5 ? 'mismatch' : ''}><i>{index + 1}</i><b>{id}</b><small>{scanned && index === 5 ? 'LIST SAYS A-06' : 'matches list'}</small></div>)}</div>{!scanned ? <button className="modal-run" type="button" onClick={onScan}>SCAN LABELS</button> : <div className="decision-stack horizontal"><button type="button" onClick={() => onResolve(true)}>Set it aside and investigate</button><button type="button" className="secondary" onClick={() => onResolve(false)}>Relabel it without checking</button></div>}{feedback && <p className={`feedback ${feedback.includes('can be wrong') ? 'bad' : ''}`}>{feedback}</p>}</ModalShell>;
}

function EvidenceModal({ feedback, onDecide, onClose }: { feedback: string; onDecide: (correct: boolean) => void; onClose: () => void }) {
  return <ModalShell title="Review the XRD result" kicker="STEP 4 · RESULT CHECK" onClose={onClose} wide><div className="decision-question"><span>DECISION</span><b>The goal was met, but one peak is unexplained. What should you trust?</b></div><div className="evidence-grid"><div className="trace-panel"><div className="panel-heading"><span>FULL XRD PATTERN</span><b>ONE UNKNOWN PEAK</b></div><div className="xrd-chart" aria-label="Simulated XRD pattern with one unresolved peak"><i style={{ left: '9%', height: '16%' }} /><i style={{ left: '19%', height: '40%' }} /><i style={{ left: '31%', height: '84%' }} /><i style={{ left: '44%', height: '35%' }} /><i className="unknown" style={{ left: '54%', height: '52%' }} /><i style={{ left: '67%', height: '29%' }} /><i style={{ left: '78%', height: '63%' }} /><i style={{ left: '91%', height: '22%' }} /><span>UNEXPLAINED</span></div><div className="axis"><span>LOW ANGLE</span><b>DIFFRACTION ANGLE</b><span>HIGH ANGLE</span></div></div><div className="report-panel"><div className="panel-heading"><span>SUMMARY</span><b>GOAL MET</b></div><div className="report-metric"><span>Target phase</span><b>94%</b></div><div className="report-metric"><span>Goal</span><b>90%</b></div><div className="report-status">PASS</div><p>The summary does not explain the highlighted peak.</p></div></div><div className="ai-proposal"><div><span>NEXT-RUN SUGGESTION</span><h3>Increase heating time</h3><p>Based only on the passing summary.</p></div></div><div className="decision-stack horizontal evidence-actions"><button type="button" onClick={() => onDecide(true)}>Investigate the unknown peak first</button><button type="button" className="secondary" onClick={() => onDecide(false)}>Follow the summary suggestion</button></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function SemEdsModal({ feedback, onDecide, onClose }: { feedback: string; onDecide: (correct: boolean) => void; onClose: () => void }) {
  const grains = [[8, 15, 34, 27], [34, 9, 29, 36], [61, 12, 34, 25], [18, 41, 37, 30], [51, 38, 25, 26], [73, 39, 29, 33], [4, 70, 33, 24], [36, 67, 31, 28], [64, 72, 35, 22]];
  const peaks: [string, number, number][] = [['O', 24, 43], ['Si', 38, 72], ['Ca', 57, 88], ['Ti', 76, 64], ['Ti', 86, 31]];
  return <ModalShell title="Check the unexpected feature" kicker="STEP 5 · MICROSCOPE CHECK" onClose={onClose} wide>
    <div className="decision-question"><span>DECISION</span><b>What evidence would connect this local feature to the bulk pattern?</b></div>
    <p className="modal-intro">Field 01 contains a bright Si-rich inclusion. The other fields have not been measured.</p>
    <div className="sem-evidence-grid"><div className="micrograph-panel"><div className="panel-heading"><span>MICROSCOPE IMAGE · FIELD 01</span><b>ONE LOCATION</b></div><div className="micrograph" aria-label="Simulated SEM micrograph with a bright inclusion">{grains.map(([left, top, width, height], index) => <i key={index} style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }} />)}<span className="bright-inclusion" /><b className="feature-tag">TEST AREA 01</b><em className="scale-bar">20 µm</em><i className="scan-line" /></div><div className="field-strip"><span className="active"><i />F01<b>measured</b></span><span><i />F02<b>not measured</b></span><span><i />F03<b>not measured</b></span><span><i />F04<b>not measured</b></span></div></div><div className="eds-panel"><div className="panel-heading"><span>LOCAL ELEMENT SIGNAL</span><b>AREA 01</b></div><div className="eds-spectrum" aria-label="Simulated local EDS counts from zero to ten kiloelectronvolts"><span className="spectrum-y">COUNTS</span>{peaks.map(([label, left, height], index) => <i key={`${label}-${index}`} className={label === 'Si' ? 'flagged' : ''} style={{ left: `${left}%`, height: `${height}%` }}><b>{label}</b></i>)}</div><div className="spectrum-axis"><span>0</span><b>ENERGY</b><span>10</span></div><div className="report-metric"><span>Main material</span><b>Ca · Ti · O</b></div><div className="report-metric flagged-metric"><span>Bright feature</span><b>More Si</b></div><div className="report-status warn-status">ONE FIELD ONLY</div></div></div>
    <div className="ai-proposal"><div><span>POSSIBLE EXPLANATION</span><h3>The unknown XRD peak comes from this inclusion</h3><p>Based on one small location.</p></div></div>
    <div className="decision-stack horizontal evidence-actions"><button type="button" onClick={() => onDecide(true)}>Check four separated locations</button><button type="button" className="secondary" onClick={() => onDecide(false)}>Conclude from this one location</button></div>
    {feedback && <p className="feedback bad">{feedback}</p>}
  </ModalShell>;
}

function CompleteModal({ scores, elapsedMinutes, logCount, exceptionCount, onReset, onDeck, onClose }: { scores: Scores; elapsedMinutes: number; logCount: number; exceptionCount: number; onReset: () => void; onDeck: () => void; onClose: () => void }) {
  return <ModalShell title="Mission debrief" kicker="MISSION COMPLETE" onClose={onClose}><p className="modal-intro">You checked the instrument, protected the sample record, and investigated evidence that did not fit.</p><DebriefVisual scenario="xrd" scores={scores} elapsedMinutes={elapsedMinutes} logCount={logCount} exceptionCount={exceptionCount} /><div className="lesson-card"><b>What changed in the lab</b><p>Five samples moved forward. One mislabeled sample was blocked from testing. The unexplained peak remains visible, with four-location microscopy evidence attached.</p></div><div className="debrief-actions"><button type="button" onClick={onDeck}>NEXT SCENARIO</button><button type="button" onClick={onReset}>REPLAY</button></div></ModalShell>;
}

function LedgerDrawer({ log, onClose }: { log: LogItem[]; onClose: () => void }) {
  return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="ledger-drawer" role="dialog" aria-modal="true" aria-label="Evidence log" onClick={(event) => event.stopPropagation()}><header><div><p className="section-kicker">EVIDENCE</p><h2>What you observed</h2></div><button type="button" onClick={onClose} aria-label="Close evidence log">×</button></header><p className="drawer-intro">{log.length ? 'Checks, findings, and blocked guesses from this run.' : 'Nothing recorded yet.'}</p><ol>{[...log].reverse().map((item, index) => <li key={`${item.time}-${index}`}><time>{item.time}</time><i className={item.type}>{item.type}</i><p>{item.text}</p></li>)}</ol></aside></div>;
}
