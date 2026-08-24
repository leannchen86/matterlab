'use client';

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { DebriefVisual } from './debrief-visual';
import { CampaignControlModal } from './campaign-control';
import { getCampaignStationId, useCampaignSnapshot, useCampaignStation } from './campaign-context';
import { evaluateCampaignMission, getCampaignIdentity, getCampaignMission, getCampaignOperations, getCampaignSpec } from './campaign-spec';
import { FieldGuideModal } from './field-guide';
import { LabViewport } from './lab-viewport';
import { baseStations, initialLog, type Station } from './sim-data';
import { AlternateShift, PlannerPanel, ShiftDeckModal, type ScenarioId } from './scenario-shifts';
import { StationAccess } from './station-access';

const TgaShift = lazy(() => import('./tga-shift').then((module) => ({ default: module.TgaShift })));
const FacilityShift = lazy(() => import('./facility-shift').then((module) => ({ default: module.FacilityShift })));

type Modal = 'qc' | 'lineage' | 'evidence' | 'sem' | 'guide' | 'campaign' | 'campaign-inventory' | 'deck' | 'complete' | null;
type LogItem = { time: string; type: string; text: string };
type Scores = { safety: number; traceability: number; integrity: number; uptime: number };

const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

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
  return <main className="shift-boot" role="status" aria-label={`Loading ${label.toLowerCase()} work order`}>
    <div className="shift-boot-mark">M<span>²</span></div>
    <div className="shift-boot-rails" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
    <div className="shift-boot-readout"><span /><div><b>CONFIGURING WORK ORDER</b><small>{label} · controlled state handoff</small></div></div>
  </main>;
}

function XrdShift({ onSwitch }: { onSwitch: (scenario: ScenarioId) => void }) {
  const campaign = useCampaignSnapshot();
  const campaignSpec = getCampaignSpec(campaign.selected);
  const campaignIdentity = getCampaignIdentity(campaign.runNumber);
  const campaignOperations = getCampaignOperations(campaign.runNumber, campaign.thermalBayLevel);
  const campaignMission = getCampaignMission(campaign.missionId);
  const campaignEvaluation = evaluateCampaignMission(campaignSpec, campaign.missionId);
  const campaignActive = campaign.stage > 0;
  const [phase, setPhase] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedOverride, setSelectedId] = useState('');
  const selectedId = selectedOverride || getCampaignStationId(campaign.stage) || 'XRD-03';
  const [minute, setMinute] = useState(8 * 60 + 16);
  const [log, setLog] = useState<LogItem[]>(initialLog);
  const [logOpen, setLogOpen] = useState(false);
  const [qcChecks, setQcChecks] = useState({ holder: false, standard: false, interlock: false });
  const [qcRan, setQcRan] = useState(false);
  const [labelsScanned, setLabelsScanned] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [scores, setScores] = useState<Scores>({ safety: 100, traceability: 82, integrity: 68, uptime: 91 });
  const [physicalInspections, setPhysicalInspections] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const followCampaignStation = (event: Event) => {
      const stage = Number((event as CustomEvent<{ stage?: number }>).detail?.stage ?? 0);
      const campaignStation = getCampaignStationId(stage);
      if (campaignStation) setSelectedId(campaignStation);
    };
    window.addEventListener('mattershift:campaign-state', followCampaignStation);
    return () => window.removeEventListener('mattershift:campaign-state', followCampaignStation);
  }, []);

  useEffect(() => {
    const openCampaign = () => setModal('campaign');
    window.addEventListener('mattershift:open-campaign', openCampaign);
    return () => window.removeEventListener('mattershift:open-campaign', openCampaign);
  }, []);

  useEffect(() => {
    const openMaterialStaging = () => {
      setSelectedId('PREP-01');
      setModal('campaign-inventory');
    };
    window.addEventListener('mattershift:open-material-staging', openMaterialStaging);
    return () => window.removeEventListener('mattershift:open-material-staging', openMaterialStaging);
  }, []);

  useEffect(() => {
    const retainStationEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; text?: string }>).detail;
      const text = detail?.text;
      if (!text) return;
      const nextMinute = minute + 1;
      setMinute(nextMinute);
      setLog((items) => [...items, { time: formatTime(nextMinute), type: detail.type ?? 'control', text }]);
    };
    window.addEventListener('mattershift:station-event', retainStationEvent);
    return () => window.removeEventListener('mattershift:station-event', retainStationEvent);
  }, [minute]);

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
      state: phase === 4 ? 'RUN COMPLETE' : 'READY',
      tone: phase === 4 ? 'run' : 'ready',
      meta: phase === 4 ? 'Pattern + fit available' : 'Reference check · +0.02° 2θ',
      technicianView: phase === 4
        ? ['QC state: in control', 'Run: CA-TI-031', 'Target phase: 94.2%', 'Review: anomaly open']
        : ['Reference: NIST Si', 'Current check: +0.02° 2θ', 'Limit: ±0.05° 2θ', 'Campaign: reacquisition'],
    };
    if (station.id === 'ROBO-02' && phase >= 2) return {
      ...station,
      state: phase === 3 ? 'TRANSFERRING' : 'READY',
      tone: phase === 3 ? 'run' : 'ready',
      meta: phase === 3 ? 'Carrier BC-184 in motion' : 'Carrier handshake complete',
      technicianView: phase === 3
        ? ['Safety zone: clear', 'Gripper: powder carrier', 'Carrier: BC-184', 'Route step: heating transfer']
        : ['Safety zone: clear', 'Gripper: powder carrier', 'Carrier handshake: complete', 'Exceptions today: 1'],
    };
    if (station.id === 'FURN-04' && phase >= 4) return { ...station, state: 'READY', tone: 'ready', meta: 'Cycle complete · trace retained' };
    if (station.id === 'SEM-01' && phase >= 5) return {
      ...station,
      state: phase >= 6 ? 'FOLLOW-UP COMPLETE' : 'TRIAGE QUEUED',
      tone: phase >= 6 ? 'ready' : 'warn',
      meta: phase >= 6 ? 'Multi-field map linked · scientist review' : 'SPEC-184-03 · inclusion follow-up',
      technicianView: phase >= 6
        ? ['Vacuum: stable', 'Fields acquired: 4', 'EDS map: linked', 'Review: scientist queue']
        : ['Vacuum: stable', 'Specimen: SPEC-184-03', 'Target: bright inclusion', 'Coverage: 1 field only'],
    };
    return station;
  }), [phase, campaign.thermalBayLevel, campaignOperations.activeFurnaceRun]);

  const selectedBase = stations.find((station) => station.id === selectedId) ?? stations[0];
  const selected = useCampaignStation(selectedBase);
  const completedTasks = phase === 0 ? 2 : phase === 1 ? 3 : phase === 2 ? 4 : phase === 3 ? 5 : phase === 4 ? 5 : phase === 5 ? 6 : 7;
  const campaignCompletedTasks = campaign.stage >= 9 ? 7 : campaign.stage >= 8 ? 6 : campaign.stage >= 7 ? 5 : campaign.stage >= 6 ? 4 : campaign.stage >= 5 ? 3 : campaign.stage >= 4 ? 2 : campaign.stage >= 2 ? 1 : 0;
  const displayedCompletedTasks = campaignActive ? campaignCompletedTasks : completedTasks;
  const progress = Math.round((displayedCompletedTasks / 7) * 100);
  const campaignTasks = [
    { number: '01', title: 'Prepare formulation', note: campaign.stage >= 2 ? `${campaignIdentity.prepSample} released` : `${campaignSpec.targetMass} · ${campaignSpec.formula}`, start: 1, complete: 2 },
    { number: '02', title: 'Run robot synthesis', note: campaign.stage === 2 ? campaignOperations.robotCondition === 'contamination' ? 'Cleanliness witness due' : campaignOperations.robotCondition === 'grip-force' ? 'Grip-force witness due' : 'Tool ID + handshake check' : campaign.stage >= 4 ? `${campaignIdentity.carrier} dosed` : '6 crucible positions', start: 2, complete: 4 },
    { number: '03', title: 'Clear furnace queue', note: campaign.stage >= 5 ? 'Capacity slot secured' : `Q01 · ${campaignOperations.queueMinutes} min`, start: 4, complete: 5 },
    { number: '04', title: 'Execute thermal profile', note: campaign.stage >= 6 ? `${campaignSpec.profile} retained` : campaign.stage === 5 && campaignOperations.furnaceConstraint ? campaignOperations.furnaceCondition === 'thermocouple-drift' ? 'TC offset recovery due' : 'Door-seal recovery due' : `${campaignSpec.temperature} · ${campaignSpec.dwell}`, start: 5, complete: 6 },
    { number: '05', title: 'Qualify XRD result', note: campaign.stage >= 7 ? `${campaignIdentity.pattern} qualified` : campaignOperations.referenceCondition === 'age-due' ? 'NIST Si reference due' : campaignOperations.referenceCondition === 'trend-review' ? 'Si control trend review' : 'Current Si control', start: 6, complete: 7 },
    { number: '06', title: 'Judge mission result', note: campaign.stage >= 7 ? `${campaignEvaluation.resultText} · ${campaignEvaluation.met ? 'pass' : 'miss'}` : campaignMission.target, start: 7, complete: 8 },
    { number: '07', title: 'Test mechanism', note: campaign.stage >= 9 ? 'Representative map linked' : 'SEM / EDS diagnostic branch', start: 8, complete: 9 },
  ];
  const campaignLineage = campaign.stage <= 1
    ? { nodes: [campaignSpec.id, campaignIdentity.prepSample, campaignIdentity.carrier], note: `${campaignSpec.precursorLabel} are being weighed and bound to the campaign manifest.` }
    : campaign.stage <= 3
      ? { nodes: [campaignIdentity.prepSample, campaignIdentity.carrier, '6× CRUC'], note: campaign.stage === 2 ? campaignOperations.robotCondition === 'contamination' ? 'Material is held before dosing until the cleanliness witness passes.' : campaignOperations.robotCondition === 'grip-force' ? 'Material is held before dosing until the jaw-force witness passes.' : 'Material is staged while tool identity and the carrier handshake are proved.' : 'Six crucible positions are linked to the governed robot program.' }
      : campaign.stage <= 5
        ? { nodes: [campaignIdentity.carrier, campaignIdentity.thermalSample, campaignSpec.profile], note: campaign.stage === 4 ? 'Carrier custody is retained while the single-capacity furnace clears.' : campaignOperations.furnaceConstraint ? 'The loaded specimen remains held while the furnace condition is recovered and independently proved.' : 'The loaded specimen remains held behind the furnace start-readiness proof.' }
        : campaign.stage <= 7
          ? { nodes: [campaignIdentity.thermalSample, campaignIdentity.xrdDataset, campaignIdentity.pattern], note: campaign.stage === 6 ? campaignOperations.referenceCondition === 'age-due' ? 'Diffraction release is held behind the due silicon-reference gate.' : campaignOperations.referenceCondition === 'trend-review' ? 'The silicon-control trend is being confirmed before specimen acquisition.' : 'The current silicon control is being reviewed before specimen acquisition.' : `${campaignIdentity.pattern} is qualified and linked to ${campaignSpec.measured}% target phase.` }
          : { nodes: [campaignIdentity.thermalSample, `SEM-${campaignIdentity.suffix}`, `EDS-${campaignIdentity.suffix}`], note: campaign.stage === 8 ? 'Four representative fields and a correlated elemental map are in acquisition.' : 'Representative microscopy evidence is linked as a mechanism hypothesis.' };
  const allQcChecks = Object.values(qcChecks).every(Boolean);

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
      safety: Math.min(100, updates.safety ?? current.safety),
      traceability: Math.min(100, updates.traceability ?? current.traceability),
      integrity: Math.min(100, updates.integrity ?? current.integrity),
      uptime: Math.min(100, updates.uptime ?? current.uptime),
    }));
  };

  const openQc = () => { setFeedback(''); setModal('qc'); setSelectedId('XRD-03'); };

  const runReference = () => {
    if (!allQcChecks) return;
    setQcRan(true);
    setFeedback('Reference scan complete. Peak-position error is now inside the control limit.');
    appendLog('qc', 'XRD-03 Si reference completed: +0.02° 2θ; control limit ±0.05°.', 14);
  };

  const dispositionQc = (correct: boolean) => {
    if (!correct) {
      setFeedback('Unsafe disposition: the earlier campaign results remain exposed to the out-of-control measurement state.');
      penalize('integrity', 18);
      appendLog('exception', 'Attempted release of results acquired while XRD-03 was outside its control limit.', 2);
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
    setFeedback('Correct: specimen 06 is quarantined, its preparation record is checked, and the corrected label is linked to both identifiers.');
    appendLog('lineage', 'SPEC-184-06 quarantined; preparation record reconciled; controlled label correction recorded.', 9);
    window.setTimeout(() => setModal(null), 750);
  };

  const releaseCarrier = () => {
    setPhase(3);
    reward({ uptime: scores.uptime + 2 });
    appendLog('transfer', 'BC-184 released to ROBO-02 with five eligible specimens; quarantined specimen excluded.', 4);
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
    setFeedback('The AI plan uses the reported phase result, but the diffraction pattern still contains an unresolved peak that needs review.');
      penalize('integrity', 15);
      appendLog('exception', 'AI next-run plan accepted without resolving evidence collision; decision held by simulation.', 3);
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
      appendLog('exception', 'Single SEM field offered as bulk explanation; report held pending representative coverage.', 4);
      return;
    }
    setPhase(6);
    reward({ integrity: scores.integrity + 9, traceability: scores.traceability + 3, uptime: scores.uptime - 2 });
    appendLog('result', 'Four SEM fields and an EDS inclusion map linked to SPEC-184-03; interpretation routed to scientist review.', 24);
    setModal('complete');
    setFeedback('');
  };

  const resetShift = () => window.location.reload();

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">M<span>²</span></span>
          <div>
            <p className="eyebrow">Materials operations simulator</p>
            <h1>SHIFT CONSOLE <span>{'// LAB 04'}</span></h1>
          </div>
        </div>
        <div className="shift-readout">
          <span className="live-dot" />
          <div><b>DAY SHIFT</b><small>{formatTime(minute)} · MENLO PARK SIM</small></div>
        </div>
        <div className="header-actions">
          <button className="campaign-button" type="button" onClick={() => setModal('campaign')}>CAMPAIGN LAB</button>
          <button className="deck-button" type="button" onClick={() => setModal('deck')}>SHIFT DECK <span>5</span></button>
          <button type="button" onClick={() => setModal('guide')}>FIELD GUIDE</button>
          <button type="button" onClick={() => setLogOpen(true)}>EVENT LEDGER <span>{log.length}</span></button>
          <div className="operator-chip"><span>LC</span><b>TECH-07</b></div>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-rail">
          <section className="rail-section shift-card">
            <p className="section-kicker">ACTIVE WORK ORDER</p>
            <div className="wo-title"><span>{campaignActive ? campaignIdentity.runId : 'WO-2841'}</span><em>{campaignActive ? campaign.stage >= 9 ? 'DIAG READY' : 'ACTIVE' : phase >= 6 ? 'CLOSED' : 'PRIORITY 1'}</em></div>
            <h2>{campaignActive ? campaignSpec.name : 'Phase-purity recovery'}</h2>
            <p>{campaignActive ? `${campaignSpec.formula} · ${campaignMission.label}: ${campaignMission.target}. Preserve one traceable material history from lots to evidence.` : 'Restore the Ca–Ti oxide campaign after an XRD reference check exceeded its control limit.'}</p>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <div className="progress-meta"><span>{displayedCompletedTasks} / 7 tasks</span><span>{progress}%</span></div>
          </section>

          <section className="rail-section">
            <p className="section-kicker">SHIFT CHECKLIST</p>
            <ol className="task-list">
              {campaignActive ? campaignTasks.map((task) => {
                const status = campaign.stage >= task.complete ? 'done' : campaign.stage >= task.start ? 'active' : 'pending';
                return <Task key={task.number} number={task.number} title={task.title} note={task.note} status={status} onClick={status === 'active' ? () => setModal('campaign') : undefined} />;
              }) : <>
                <Task number="01" title="Read handoff" note="2 notes acknowledged" status="done" />
                <Task number="02" title="Verify balance" note="Check mass within limit" status="done" />
                <Task number="03" title="Resolve XRD QC" note={phase >= 1 ? 'Returned to service' : 'Reference peak shifted'} status={phase >= 1 ? 'done' : 'active'} onClick={phase < 1 ? openQc : undefined} />
                <Task number="04" title="Reconcile carrier" note={phase >= 2 ? '5 eligible · 1 quarantined' : 'BC-184 · 6 crucibles'} status={phase >= 2 ? 'done' : phase === 1 ? 'active' : 'pending'} onClick={phase === 1 ? openLineage : undefined} />
                <Task number="05" title="Release workcell" note={phase >= 3 ? 'Carrier accepted' : 'Awaiting identity gate'} status={phase >= 3 ? 'done' : phase === 2 ? 'active' : 'pending'} onClick={phase === 2 ? releaseCarrier : undefined} />
                <Task number="06" title="Review XRD result" note={phase >= 5 ? 'Follow-up assigned' : 'Pattern + phase analysis'} status={phase >= 5 ? 'done' : phase === 4 ? 'active' : 'pending'} onClick={phase === 4 ? () => setModal('evidence') : undefined} />
                <Task number="07" title="Triage with SEM / EDS" note={phase >= 6 ? '4 fields + map linked' : 'Inclusion follow-up'} status={phase >= 6 ? 'done' : phase === 5 ? 'active' : 'pending'} onClick={phase === 5 ? () => { setSelectedId('SEM-01'); setModal('sem'); } : undefined} />
              </>}
            </ol>
          </section>

          <section className="rail-section handoff-note">
            <div className="section-title-row"><p className="section-kicker">SHIFT HANDOFF</p><span>2 NOTES</span></div>
            <div className="handoff-grid">
              <div><span>HOLD</span><b>1</b><small>XRD campaign</small></div>
              <div><span>SERVICE</span><b>11:00</b><small>BET vendor</small></div>
              <div><span>SUPPLIES</span><b>83%</b><small>prep bay</small></div>
            </div>
          </section>

          <section className="rail-section system-boundary">
            <p className="section-kicker">CONTROL BOUNDARY</p>
            <div><span>SCADA</span><i>equipment state + alarms</i></div>
            <div><span>LES</span><i>method steps + attestations</i></div>
            <div><span>LIMS</span><i>sample identity + results</i></div>
          </section>
        </aside>

        <section className="lab-view">
          <div className="lab-heading">
            <div><p className="section-kicker">LIVE FACILITY MAP</p><h2>High-throughput materials bay</h2></div>
            <div className="legend"><span><i className="ready" />ready</span><span><i className="run" />active</span><span><i className="warn" />attention</span></div>
          </div>

          <LabViewport stations={stations} selectedId={selectedId} phase={phase} inspectionState={physicalInspections} onInspectionChange={recordInspection} onSelect={setSelectedId} />

          <footer className="facility-footer">
            <div><span>ENV</span><b>22.1 °C</b><small>41% RH</small></div>
            <div><span>EXHAUST</span><b>NORMAL</b><small>−12 Pa</small></div>
            <div><span>GAS DETECTION</span><b>NORMAL</b><small>6 / 6 online</small></div>
            <div><span>OPEN WORK</span><b>{phase >= 4 ? '10' : '12'}</b><small>{phase >= 1 ? '2' : '3'} waiting QC</small></div>
          </footer>
        </section>

        <aside className="right-rail">
          <ActionPanel phase={phase} onCampaign={() => setModal('campaign')} onQc={openQc} onLineage={openLineage} onRelease={releaseCarrier} onAdvance={advanceRun} onEvidence={() => setModal('evidence')} onSem={() => { setSelectedId('SEM-01'); setModal('sem'); }} onComplete={() => setModal('complete')} />

          <section className="rail-section station-inspector">
            <div className="section-title-row"><p className="section-kicker">STATION INSPECTOR</p><span className={selected.tone}>{selected.state}</span></div>
            <div className="station-identity"><b>{selected.id}</b><h2>{selected.name}</h2></div>
            <div className="readout-list">
              {selected.technicianView.map((item) => { const [key, value] = item.split(': '); return <div key={item}><span>{key}</span><b>{value}</b></div>; })}
            </div>
            <p className="mini-label">OUTPUTS</p>
            <div className="tag-list">{selected.dataProducts.map((item) => <span key={item}>{item}</span>)}</div>
            <StationAccess station={selected} scenarioId="xrd" physicalChecks={physicalInspections[selected.id] ?? []} />
          </section>

          <PlannerPanel scenario="xrd" phase={phase} />

          <section className="rail-section score-panel">
            <div className="section-title-row"><p className="section-kicker">SHIFT HEALTH</p><span>LIVE</span></div>
            <Score label="Safety" value={scores.safety} />
            <Score label="Traceability" value={scores.traceability} />
            <Score label="Data integrity" value={scores.integrity} />
            <Score label="Lab uptime" value={scores.uptime} />
          </section>

          <section className="rail-section lineage-card">
            <div className="section-title-row"><p className="section-kicker">SAMPLE LINEAGE</p><span>LIVE</span></div>
            <div className="lineage-flow"><span>{campaignActive ? campaignLineage.nodes[0] : 'LOT-91'}</span><i>→</i><span>{campaignActive ? campaignLineage.nodes[1] : 'BC-184'}</span><i>→</i><span>{campaignActive ? campaignLineage.nodes[2] : phase >= 2 ? '5× ELIG' : '6× SPEC'}</span></div>
            <p>{campaignActive ? campaignLineage.note : phase >= 2 ? 'Five specimens cleared; specimen 06 is quarantined with a correction record.' : 'One physical label does not match the carrier manifest.'}</p>
          </section>
        </aside>
      </div>

      {modal === 'qc' && <QcModal checks={qcChecks} setChecks={setQcChecks} allChecked={allQcChecks} ran={qcRan} feedback={feedback} onRun={runReference} onDisposition={dispositionQc} onClose={() => setModal(null)} />}
      {modal === 'lineage' && <LineageModal scanned={labelsScanned} onScan={() => { setLabelsScanned(true); setFeedback('Mismatch found: manifest SPEC-184-06; physical label SPEC-148-06.'); appendLog('lineage', 'Carrier BC-184 scan found one identifier mismatch.', 3); }} feedback={feedback} onResolve={resolveLineage} onClose={() => setModal(null)} />}
      {modal === 'evidence' && <EvidenceModal feedback={feedback} onDecide={decideEvidence} onClose={() => setModal(null)} />}
      {modal === 'sem' && <SemEdsModal feedback={feedback} onDecide={decideSem} onClose={() => setModal(null)} />}
      {modal === 'guide' && <FieldGuideModal onClose={() => setModal(null)} />}
      {(modal === 'campaign' || modal === 'campaign-inventory') && <CampaignControlModal autoOpenInventory={modal === 'campaign-inventory'} onClose={() => setModal(null)} />}
      {modal === 'deck' && <ShiftDeckModal active="xrd" onChoose={onSwitch} onClose={() => setModal(null)} />}
      {modal === 'complete' && <CompleteModal scores={scores} logCount={log.length} exceptionCount={log.filter((event) => event.type === 'exception').length} onReset={resetShift} onClose={() => setModal(null)} />}
      {logOpen && <LedgerDrawer log={log} onClose={() => setLogOpen(false)} />}
    </main>
  );
}

function Task({ number, title, note, status, onClick }: { number: string; title: string; note: string; status: 'done' | 'active' | 'pending'; onClick?: () => void }) {
  const content = <><span>{status === 'done' ? '✓' : number}</span><div><b>{title}</b><small>{note}</small></div></>;
  return <li className={status}>{onClick ? <button type="button" onClick={onClick}>{content}</button> : content}</li>;
}

function Score({ label, value }: { label: string; value: number }) {
  return <div className="score-row"><div><span>{label}</span><b>{value}</b></div><div className="score-track"><i style={{ width: `${value}%` }} /></div></div>;
}

function ActionPanel({ phase, onCampaign, onQc, onLineage, onRelease, onAdvance, onEvidence, onSem, onComplete }: { phase: number; onCampaign: () => void; onQc: () => void; onLineage: () => void; onRelease: () => void; onAdvance: () => void; onEvidence: () => void; onSem: () => void; onComplete: () => void }) {
  const campaign = useCampaignSnapshot();
  if (campaign.stage > 0) {
    const spec = getCampaignSpec(campaign.selected);
    const identity = getCampaignIdentity(campaign.runNumber);
    const operations = getCampaignOperations(campaign.runNumber, campaign.thermalBayLevel);
    const mission = getCampaignMission(campaign.missionId);
    const evaluation = evaluateCampaignMission(spec, campaign.missionId);
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
        ? { tag: 'XRD QUALITY GATE', title: `${identity.runId} specimen held`, body: 'A current NIST Si reference must pass before the campaign diffraction pattern can be acquired.', metric: `${operations.referenceAgeHours} h since QC`, tone: 'warn' }
        : operations.referenceCondition === 'trend-review'
          ? { tag: 'XRD TREND REVIEW', title: `${identity.runId} awaiting confirmation`, body: 'The Si control remains within its age window, but its position trend needs a confirmatory acquisition before the specimen.', metric: `${operations.referenceAgeHours} h control`, tone: 'run' }
          : { tag: 'XRD ACQUISITION', title: `${identity.runId} ready to measure`, body: 'The Si control is current. Review its governed result, prove the shutter chain, and acquire the specimen pattern.', metric: `${operations.referenceAgeHours} h control`, tone: 'run' },
      7: { tag: evaluation.met ? 'SCIENTIFIC MISSION MET' : 'VALID MISSION MISS', title: `${identity.runId} · ${mission.label}`, body: `The Si control passed at ${operations.referenceResult}. ${evaluation.resultText}; ${evaluation.constraintText}. The qualified result remains useful evidence.`, metric: evaluation.gap, tone: 'ready' },
      8: { tag: 'SEM / EDS FOLLOW-UP', title: `${identity.runId} diagnostic branch`, body: 'Four representative BSE fields and a correlated EDS map are required before assigning a mechanism to the valid negative.', metric: '0 / 4 fields', tone: 'run' },
      9: { tag: 'DIAGNOSIS LINKED', title: `${identity.runId} mechanism hypothesis`, body: `${spec.id === 'D-08' ? 'Ti-rich cores' : 'Ca-rich secondary grains'} are retained as a follow-up hypothesis, not treated as bulk proof.`, metric: '4 / 4 fields', tone: 'ready' },
    } as const;
    const state = campaignStates[campaign.stage as keyof typeof campaignStates] ?? campaignStates[7];
    return <section className={`rail-section alert-card tone-${state.tone}`}><div className="alert-head"><span>{state.tag}</span><b>RUN-{identity.suffix}</b></div><h2>{state.title}</h2><div className="metric-row"><span>Current state</span><strong>{state.metric}</strong></div><p>{state.body}</p><button className="primary-action" type="button" onClick={onCampaign}>OPEN CAMPAIGN CONTROL<span>→</span></button></section>;
  }
  const states = [
    { tag: 'QC EXCURSION', title: 'XRD-03 position drift', body: 'Campaign results may be biased. Run the reference material check before releasing held samples.', metric: '+0.17° 2θ', action: 'OPEN QC WORKFLOW', fn: onQc, tone: 'warn' },
    { tag: 'IDENTITY GATE', title: 'Carrier BC-184 on hold', body: 'Robot handshake is blocked until all six physical labels reconcile to the work-order manifest.', metric: '6 specimens', action: 'SCAN CARRIER', fn: onLineage, tone: 'warn' },
    { tag: 'READY TO RELEASE', title: 'Workcell gates satisfied', body: 'Instrument QC, material eligibility, and carrier custody are clear. One quarantined specimen is excluded.', metric: '5 eligible', action: 'RELEASE CARRIER', fn: onRelease, tone: 'ready' },
    { tag: 'AUTOMATED RUN', title: 'BC-184 in execution', body: 'The robot is moving the eligible set through heating, cool-down, and XRD reacquisition.', metric: '82 sim min', action: 'ADVANCE TO RESULTS', fn: onAdvance, tone: 'run' },
    { tag: 'RESULT REVIEW', title: 'Unexpected XRD peak', body: 'The phase result passes the target threshold, but the diffraction pattern contains an unresolved peak.', metric: '1 anomaly', action: 'REVIEW RESULTS', fn: onEvidence, tone: 'warn' },
    { tag: 'FOLLOW-UP QUEUE', title: 'SEM / EDS triage requested', body: 'The unresolved diffraction peak now needs local morphology and elemental evidence without overgeneralizing one field of view.', metric: 'SPEC-184-03', action: 'OPEN SEM / EDS', fn: onSem, tone: 'warn' },
    { tag: 'SHIFT COMPLETE', title: 'Campaign safely advanced', body: 'Equipment, samples, automation, and characterization evidence are ready for the next scientific decision.', metric: '7 / 7', action: 'VIEW DEBRIEF', fn: onComplete, tone: 'ready' },
  ];
  const state = states[phase] ?? states[6];
  return <section className={`rail-section alert-card tone-${state.tone}`}><div className="alert-head"><span>{state.tag}</span><b>{phase === 0 ? 'ACKNOWLEDGED' : 'ACTIVE'}</b></div><h2>{state.title}</h2><div className="metric-row"><span>Current state</span><strong>{state.metric}</strong></div><p>{state.body}</p><button className="primary-action" type="button" onClick={state.fn}>{state.action}<span>→</span></button></section>;
}

function ModalShell({ title, kicker, children, onClose, wide = false }: { title: string; kicker: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation"><section className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</section></div>;
}

function QcModal({ checks, setChecks, allChecked, ran, feedback, onRun, onDisposition, onClose }: { checks: { holder: boolean; standard: boolean; interlock: boolean }; setChecks: React.Dispatch<React.SetStateAction<{ holder: boolean; standard: boolean; interlock: boolean }>>; allChecked: boolean; ran: boolean; feedback: string; onRun: () => void; onDisposition: (correct: boolean) => void; onClose: () => void }) {
  const items = [
    { key: 'holder' as const, title: 'Inspect and clean holder', note: 'Avoid a specimen-preparation artifact masquerading as instrument drift.' },
    { key: 'standard' as const, title: 'Verify reference identity', note: 'Use the governed silicon reference linked to this QC method.' },
    { key: 'interlock' as const, title: 'Confirm enclosure interlock', note: 'Instrument readiness is separate from scientific readiness.' },
  ];
  return <ModalShell title="XRD position verification" kicker="QC WORKFLOW · XRD-03" onClose={onClose} wide>
    <div className="modal-grid qc-grid"><div><p className="modal-intro">The last reference result was outside the ±0.05° 2θ control limit. Complete the pre-run checks, measure the governed reference, then disposition both the instrument and affected results.</p><div className="check-stack">{items.map((item) => <label key={item.key} className={checks[item.key] ? 'checked' : ''}><input type="checkbox" checked={checks[item.key]} onChange={() => setChecks((current) => ({ ...current, [item.key]: !current[item.key] }))} /><span>{checks[item.key] ? '✓' : ''}</span><div><b>{item.title}</b><small>{item.note}</small></div></label>)}</div><button className="modal-run" type="button" disabled={!allChecked || ran} onClick={onRun}>{ran ? 'REFERENCE COMPLETE' : 'RUN SI REFERENCE · 8 MIN'}</button></div><div className="control-card"><p className="mini-label">PEAK-POSITION CONTROL</p><div className="control-chart"><i className="limit top" /><i className="center" /><i className="limit bottom" /><span style={{ left: '12%', top: '43%' }} /><span style={{ left: '28%', top: '51%' }} /><span style={{ left: '46%', top: '47%' }} /><span className="bad" style={{ left: '64%', top: '8%' }} />{ran && <span className="new" style={{ left: '84%', top: '40%' }} />}</div><div className="control-legend"><span>−0.05°</span><b>0.00°</b><span>+0.05°</span></div><div className="result-box"><span>PREVIOUS</span><b>+0.17°</b><span>CURRENT</span><b>{ran ? '+0.02°' : '—'}</b></div>{ran && <div className="decision-stack"><p className="mini-label">DISPOSITION AFFECTED RESULTS</p><button type="button" onClick={() => onDisposition(true)}>Invalidate + reacquire held results</button><button type="button" className="secondary" onClick={() => onDisposition(false)}>Release prior results as reported</button></div>}</div></div>{feedback && <p className={`feedback ${feedback.startsWith('Unsafe') ? 'bad' : ''}`}>{feedback}</p>}
  </ModalShell>;
}

function LineageModal({ scanned, onScan, feedback, onResolve, onClose }: { scanned: boolean; onScan: () => void; feedback: string; onResolve: (correct: boolean) => void; onClose: () => void }) {
  const samples = ['184-01', '184-02', '184-03', '184-04', '184-05', scanned ? '148-06' : '184-06'];
  return <ModalShell title="Carrier identity reconciliation" kicker="MATERIAL CONTROL · BC-184" onClose={onClose} wide><p className="modal-intro">The carrier cannot enter the robot cell until physical labels, manifest identifiers, and specimen count agree.</p><div className="manifest-summary"><span>WORK ORDER<b>WO-2841</b></span><span>SOURCE LOT<b>LOT-91</b></span><span>EXPECTED<b>6 SPECIMENS</b></span><span>ROUTE<b>PREP → FURN → XRD</b></span></div><div className="sample-tray">{samples.map((id, index) => <div key={index} className={scanned && index === 5 ? 'mismatch' : ''}><i>{index + 1}</i><b>SPEC-{id}</b><small>{scanned && index === 5 ? 'MANIFEST: 184-06' : 'identity matched'}</small></div>)}</div>{!scanned ? <button className="modal-run" type="button" onClick={onScan}>SCAN PHYSICAL CARRIER</button> : <div className="decision-stack horizontal"><button type="button" onClick={() => onResolve(true)}>Quarantine + reconcile source</button><button type="button" className="secondary" onClick={() => onResolve(false)}>Reprint label from manifest</button></div>}{feedback && <p className={`feedback ${feedback.includes('can be wrong') ? 'bad' : ''}`}>{feedback}</p>}</ModalShell>;
}

function EvidenceModal({ feedback, onDecide, onClose }: { feedback: string; onDecide: (correct: boolean) => void; onClose: () => void }) {
  return <ModalShell title="Characterization result review" kicker="RESULT GATE · RUN CA-TI-031" onClose={onClose} wide><div className="evidence-grid"><div className="trace-panel"><div className="panel-heading"><span>XRD DIFFRACTION PATTERN</span><b>XRD-03 · RUN 031</b></div><div className="xrd-chart" aria-label="Simulated XRD trace with one unresolved peak"><i style={{ left: '9%', height: '16%' }} /><i style={{ left: '19%', height: '40%' }} /><i style={{ left: '31%', height: '84%' }} /><i style={{ left: '44%', height: '35%' }} /><i className="unknown" style={{ left: '54%', height: '52%' }} /><i style={{ left: '67%', height: '29%' }} /><i style={{ left: '78%', height: '63%' }} /><i style={{ left: '91%', height: '22%' }} /><span>UNRESOLVED · 36.1°</span></div><div className="axis"><span>10°</span><b>2θ</b><span>80°</span></div></div><div className="report-panel"><div className="panel-heading"><span>PHASE-ANALYSIS RESULT</span><b>method v2.4</b></div><div className="report-metric"><span>Target phase</span><b>94.2%</b></div><div className="report-metric"><span>Fit Rwp</span><b>8.6%</b></div><div className="report-metric"><span>Campaign target</span><b>≥ 90%</b></div><div className="report-status">TARGET MET</div><p>Operator review still required for the unassigned reflection.</p></div></div><div className="ai-proposal"><div><span>AI PLANNER · PROPOSED NEXT RUN</span><h3>Increase dwell 4 h → 6 h at 1,000 °C</h3><p>Expected target fraction: 97% · confidence 0.82</p></div><b>READY</b></div><div className="decision-stack horizontal evidence-actions"><button type="button" onClick={() => onDecide(true)}>Flag anomaly · request SEM/EDS follow-up</button><button type="button" className="secondary" onClick={() => onDecide(false)}>Accept AI next-run plan</button></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function SemEdsModal({ feedback, onDecide, onClose }: { feedback: string; onDecide: (correct: boolean) => void; onClose: () => void }) {
  const grains = [[8, 15, 34, 27], [34, 9, 29, 36], [61, 12, 34, 25], [18, 41, 37, 30], [51, 38, 25, 26], [73, 39, 29, 33], [4, 70, 33, 24], [36, 67, 31, 28], [64, 72, 35, 22]];
  const peaks: [string, number, number][] = [['O', 24, 43], ['Si', 38, 72], ['Ca', 57, 88], ['Ti', 76, 64], ['Ti', 86, 31]];
  return <ModalShell title="SEM / EDS inclusion triage" kicker="CHARACTERIZATION FOLLOW-UP · SPEC-184-03" onClose={onClose} wide><p className="modal-intro">The XRD result contains an unassigned reflection. A backscattered-electron field reveals one bright inclusion; the local spectrum can guide follow-up, but not represent the bulk by itself.</p><div className="sem-evidence-grid"><div className="micrograph-panel"><div className="panel-heading"><span>BSE MICROGRAPH · FIELD 01</span><b>SEM-01 · SPEC-184-03</b></div><div className="micrograph" aria-label="Simulated SEM micrograph with a bright inclusion">{grains.map(([left, top, width, height], index) => <i key={index} style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }} />)}<span className="bright-inclusion" /><b className="feature-tag">EDS ROI 01</b><em className="scale-bar">20 µm</em><i className="scan-line" /></div><div className="field-strip"><span className="active"><i />F01<b>inclusion</b></span><span><i />F02<b>queued</b></span><span><i />F03<b>queued</b></span><span><i />F04<b>queued</b></span></div></div><div className="eds-panel"><div className="panel-heading"><span>LOCAL EDS SPECTRUM</span><b>ROI 01</b></div><div className="eds-spectrum" aria-label="Simulated local EDS spectrum">{peaks.map(([label, left, height], index) => <i key={`${label}-${index}`} className={label === 'Si' ? 'flagged' : ''} style={{ left: `${left}%`, height: `${height}%` }}><b>{label}</b></i>)}</div><div className="report-metric"><span>Matrix</span><b>Ca · Ti · O</b></div><div className="report-metric flagged-metric"><span>Inclusion</span><b>Si elevated</b></div><div className="report-status warn-status">LOCAL EVIDENCE ONLY</div><p>Elemental signal is spatially local and acquisition-context dependent.</p></div></div><div className="ai-proposal"><div><span>FOLLOW-UP QUESTION</span><h3>Does the Si-rich feature explain the unresolved XRD reflection?</h3><p>Current coverage: 1 field · representativeness not established</p></div><b>OPEN</b></div><div className="decision-stack horizontal evidence-actions"><button type="button" onClick={() => onDecide(true)}>Acquire 4 fields + EDS map · route interpretation</button><button type="button" className="secondary" onClick={() => onDecide(false)}>Report first field as bulk explanation</button></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function CompleteModal({ scores, logCount, exceptionCount, onReset, onClose }: { scores: Scores; logCount: number; exceptionCount: number; onReset: () => void; onClose: () => void }) {
  const total = Math.round((scores.safety + scores.traceability + scores.integrity + scores.uptime) / 4);
  return <ModalShell title="Campaign debrief" kicker="WO-2841 · COMPLETE" onClose={onClose}><div className="debrief-score"><span>RUN RATING</span><b>{total}</b><i>/ 100</i></div><p className="modal-intro">You returned an instrument to control, quarantined a mislabeled specimen, released a robot workcell, challenged an AI plan, and built a representative SEM/EDS follow-up package.</p><DebriefVisual scenario="xrd" scores={scores} exceptionCount={exceptionCount} /><div className="debrief-grid"><span>Safety<b>{scores.safety}</b></span><span>Traceability<b>{scores.traceability}</b></span><span>Data integrity<b>{scores.integrity}</b></span><span>Uptime<b>{scores.uptime}</b></span></div><div className="lesson-card"><b>What the controlled lab connects</b><p>Hands-on sample work, equipment health, controlled records, automation exceptions, and evidence that is fit for scientific and AI decisions.</p></div><p className="debrief-meta">{logCount} run events captured · 1 specimen quarantined · 2 characterization gates reviewed</p><button className="modal-run" type="button" onClick={onReset}>REPLAY INCIDENT</button></ModalShell>;
}

function LedgerDrawer({ log, onClose }: { log: LogItem[]; onClose: () => void }) {
  return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="ledger-drawer" role="dialog" aria-modal="true" aria-label="Event ledger" onClick={(event) => event.stopPropagation()}><header><div><p className="section-kicker">RUN RECORD</p><h2>Event ledger</h2></div><button type="button" onClick={onClose}>×</button></header><p className="drawer-intro">A chronological record of QC checks, sample exceptions, workcell transfers, results, and operator decisions.</p><ol>{[...log].reverse().map((item, index) => <li key={`${item.time}-${index}`}><time>{item.time}</time><i className={item.type}>{item.type}</i><p>{item.text}</p></li>)}</ol></aside></div>;
}
