'use client';

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { CampaignControlModal } from './campaign-control';
import { getCampaignStationId, useCampaignSnapshot, useCampaignStation } from './campaign-context';
import { evaluateCampaignMission, getCampaignIdentity, getCampaignMission, getCampaignOperations, getCampaignSpec } from './campaign-spec';
import { LabViewport } from './lab-viewport';
import { subscribeLabEvent } from './lab-events';
import { baseStations, initialLog, type Station } from './sim-data';
import { AlternateShift, ShiftDeckModal, type ScenarioId } from './scenario-shifts';
import { StationAccess } from './station-access';
import { XrdWorkbench, type XrdBenchStage, type XrdRunContext, type XrdRunResult } from './xrd-workbench';

const TgaShift = lazy(() => import('./tga-shift').then((module) => ({ default: module.TgaShift })));
const FacilityShift = lazy(() => import('./facility-shift').then((module) => ({ default: module.FacilityShift })));

type Modal = 'xrd-workbench' | 'campaign' | 'campaign-inventory' | 'campaign-facility' | 'deck' | null;
type LogItem = { time: string; type: string; text: string };

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
  const [xrdBenchStage, setXrdBenchStage] = useState<XrdBenchStage>('idle');
  const [xrdRunContext, setXrdRunContext] = useState<XrdRunContext | null>(null);
  const [xrdRunResult, setXrdRunResult] = useState<XrdRunResult | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedOverride, setSelectedId] = useState('');
  const selectedId = selectedOverride || (campaignActive ? getCampaignStationId(campaign.stage) : '') || 'XRD-03';
  const [minute, setMinute] = useState(8 * 60 + 16);
  const [log, setLog] = useState<LogItem[]>(initialLog);
  const [logOpen, setLogOpen] = useState(false);
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
    if (station.id === 'XRD-03') return {
      ...station,
      state: phase >= 5 ? xrdRunResult?.uncertain ? 'RUN HELD' : xrdRunResult?.supported ? 'CALL SAVED' : 'REVIEW' : phase === 4 ? 'INTERPRET' : phase === 3 ? 'SCANNING' : phase >= 1 ? 'LOCAL CONTROL' : 'FREE LAB READY',
      tone: phase >= 5 ? xrdRunResult?.supported ? 'ready' : 'warn' : phase >= 3 ? 'run' : 'ready',
      meta: phase >= 5 ? `${xrdRunResult?.sampleId ?? 'sample'} · ${xrdRunResult?.decision ?? '-'}` : phase === 4 ? `${xrdRunContext?.sampleId ?? 'sample'} · choose references` : phase === 3 ? `${xrdRunContext?.sampleId ?? 'sample'} · ${xrdRunContext?.scan ?? 'scan'}` : 'Choose sample · preparation · scan',
      technicianView: phase >= 5
        ? [`Sample: ${xrdRunResult?.sampleId ?? '-'}`, `Claim: ${xrdRunResult?.phases.join(' + ') ?? '-'}`, `Decision: ${xrdRunResult?.decision ?? '-'}`, `Support: ${xrdRunResult?.supported ? 'adequate' : 'weak'}`]
        : phase === 4
          ? [`Sample: ${xrdRunContext?.sampleId ?? '-'}`, 'Pattern: complete', `Preparation: ${xrdRunContext?.prep ?? '-'}`, 'Reference library: open']
          : phase === 3
            ? [`Sample: ${xrdRunContext?.sampleId ?? '-'}`, `Method: ${xrdRunContext?.scan ?? '-'}`, 'Range: 10–80° 2θ', 'Acquisition: in progress']
            : ['Samples: 7 in queue', 'Mounts: front · back · spin · spike', 'Scan programs: 5', 'Reruns: enabled'],
    };
    return station;
  }), [phase, campaign.thermalBayLevel, campaignOperations.activeFurnaceRun, xrdRunContext, xrdRunResult]);

  const selectedBase = stations.find((station) => station.id === selectedId) ?? stations[0];
  const campaignSelected = useCampaignStation(selectedBase);
  const selected = campaignActive ? campaignSelected : selectedBase;
  const selectedInspectionKey = campaignActive && getCampaignStationId(campaign.stage) === selected.id
    ? `${selected.id}:RUN-${campaign.runNumber}:${campaign.selected}`
    : selected.id;
  const campaignTasks = [
    { number: '01', title: 'Prepare formulation', note: campaign.stage >= 2 ? `${campaignIdentity.prepSample} released` : campaignSpec.targetMass, start: 1, complete: 2 },
    { number: '02', title: 'Run robot synthesis', note: campaign.stage === 2 ? campaignOperations.robotCondition === 'contamination' ? 'Cleanliness witness due' : campaignOperations.robotCondition === 'grip-force' ? 'Grip-force witness due' : 'Tool ID + handshake check' : campaign.stage >= 4 ? `${campaignIdentity.carrier} dosed` : '6 crucible positions', start: 2, complete: 4 },
    { number: '03', title: 'Clear furnace queue', note: campaign.stage >= 5 ? 'Capacity slot secured' : `Q01 · ${campaignOperations.queueMinutes} min`, start: 4, complete: 5 },
    { number: '04', title: 'Execute thermal profile', note: campaign.stage >= 6 ? `${campaignSpec.profile} retained` : campaign.stage === 5 && campaignOperations.furnaceConstraint ? campaignOperations.furnaceCondition === 'thermocouple-drift' ? 'TC offset recovery due' : 'Door-seal recovery due' : `${campaignSpec.temperature} · ${campaignSpec.dwell}`, start: 5, complete: 6 },
    { number: '05', title: 'Qualify XRD result', note: campaign.stage >= 7 ? `${campaignIdentity.pattern} qualified` : campaignOperations.referenceCondition === 'age-due' ? 'NIST SRM 640f QC check due' : campaignOperations.referenceCondition === 'trend-review' ? 'Silicon QC trend review' : 'Current silicon QC check', start: 6, complete: 7 },
    { number: '06', title: campaign.confirmationSource ? 'Judge reproducibility' : 'Judge mission result', note: campaign.stage >= 7 ? campaign.confirmationSource ? `${confirmationSpread} pp spread · ${campaignEvaluation.met ? 'boundary repeated' : 'not repeated'}` : `${campaignEvaluation.resultText} · ${campaignEvaluation.met ? 'pass' : 'miss'}` : campaignMission.target, start: 7, complete: 8 },
    { number: '07', title: 'Test mechanism', note: campaign.stage >= 9 ? 'Four-location map linked' : 'SEM / EDS diagnostic branch', start: 8, complete: 9 },
  ];
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

  const updateXrdBenchStage = (nextStage: XrdBenchStage, context: XrdRunContext) => {
    setXrdBenchStage(nextStage);
    setXrdRunContext(context);
    if (nextStage === 'idle') setXrdRunResult(null);
    const nextPhase = nextStage === 'idle' ? 0
      : nextStage === 'open' ? 1
        : nextStage === 'loaded' || nextStage === 'closed' ? 2
          : nextStage === 'scanning' ? 3
            : nextStage === 'review' ? 4 : 5;
    setPhase(nextPhase);
    if (nextStage === 'loaded') appendLog('sample', `${context.sampleId} holder seated on the XRD specimen stage.`);
    if (nextStage === 'closed') appendLog('control', `XRD-03 enclosure closed; ${context.prep.toLowerCase()} preparation ready.`);
    if (nextStage === 'scanning') appendLog('measurement', `${context.sampleId} ${context.scan.toLowerCase()} scan started.`);
    if (nextStage === 'review') appendLog('result', `${context.sampleId} run ${String(context.runNumber).padStart(2, '0')} retained for open reference comparison.`);
  };

  const completeXrdRun = (result: XrdRunResult) => {
    setXrdRunResult(result);
    setXrdBenchStage('complete');
    setPhase(5);
    setXrdRunContext(result);
    appendLog('decision', `${result.sampleId} call committed: ${result.summary}`);
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand-name">MatterLab</h1>
        </div>
        <div className="header-actions">
          <button className="deck-button" type="button" onClick={() => setModal('deck')}>SCENARIOS</button>
          <button className="ledger-button" type="button" onClick={() => setLogOpen(true)}>EVIDENCE LOG</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-rail">
          <section className="rail-section shift-card">
            <p className="section-kicker">CURRENT MISSION</p>
            <h2>{campaignActive ? campaignSpec.name : 'Explore the XRD'}</h2>
            <p>{campaignActive ? `Make ${campaignSpec.formula}, test it, and decide whether the result meets the goal.` : 'Choose a sample, change the setup, and compare what each run reveals.'}</p>
          </section>

          <section className="rail-section">
            <p className="section-kicker">MISSION STEPS</p>
            <ol className="task-list">
              {campaignActive ? campaignTasks.map((task) => {
                const status = campaign.stage >= task.complete ? 'done' : campaign.stage >= task.start ? 'active' : 'pending';
                return <Task key={task.number} number={task.number} title={task.title} note={task.note} status={status} onClick={status === 'active' ? () => setModal('campaign') : undefined} />;
              }) : <>
                <Task number="01" title="Build a run" note={phase >= 2 ? `${xrdRunContext?.sampleId ?? 'Sample'} · ${xrdRunContext?.prep ?? 'prepared'}` : 'Sample · mount · scan'} status={phase >= 2 ? 'done' : 'active'} onClick={() => setModal('xrd-workbench')} />
                <Task number="02" title="Operate XRD-03" note={phase >= 4 ? 'Pattern retained' : phase === 3 ? `${xrdRunContext?.scan ?? 'Scan'} running` : 'Open · load · close · start'} status={phase >= 4 ? 'done' : phase >= 2 ? 'active' : 'pending'} onClick={() => setModal('xrd-workbench')} />
                <Task number="03" title="Test a hypothesis" note={phase >= 5 ? xrdRunResult?.summary ?? 'Run saved' : 'References · rerun · hold'} status={phase >= 5 ? 'done' : phase >= 4 ? 'active' : 'pending'} onClick={() => setModal('xrd-workbench')} />
              </>}
            </ol>
          </section>
        </aside>

        <section className="lab-view">
          <LabViewport stations={stations} selectedId={selectedId} phase={phase} campaignEnabled={campaignMode} inspectionState={physicalInspections} onInspectionChange={recordInspection} onSelect={setSelectedId} />
        </section>

        <aside className="right-rail">
          <ActionPanel campaignActive={campaignActive} onCampaign={() => setModal('campaign')} onOpen={() => setModal('xrd-workbench')} />

          <section className="rail-section station-inspector">
            <div className="station-identity"><b>{selected.id}</b><h2 title={selected.purpose}>{selected.name}</h2></div>
            <StationAccess station={selected} scenarioId="xrd" campaignEnabled={campaignMode} physicalChecks={physicalInspections[selectedInspectionKey] ?? []} />
          </section>
        </aside>
      </div>

      {modal === 'xrd-workbench' && <XrdWorkbench stage={xrdBenchStage} result={xrdRunResult} onStage={updateXrdBenchStage} onResult={completeXrdRun} onClose={() => setModal(null)} />}
      {(modal === 'campaign' || modal === 'campaign-inventory' || modal === 'campaign-facility') && <CampaignControlModal autoOpenInventory={modal === 'campaign-inventory'} autoOpenFacility={modal === 'campaign-facility'} onClose={() => setModal(null)} />}
      {modal === 'deck' && <ShiftDeckModal active="xrd" onChoose={onSwitch} onExpert={() => { setCampaignMode(true); setModal('campaign'); }} onClose={() => setModal(null)} />}
      {logOpen && <LedgerDrawer log={log} onClose={() => setLogOpen(false)} />}
    </main>
  );
}

function Task({ number, title, note, status, onClick }: { number: string; title: string; note: string; status: 'done' | 'active' | 'pending'; onClick?: () => void }) {
  const content = <><span>{status === 'done' ? '✓' : number}</span><div><b>{title}</b><small>{note}</small></div></>;
  return <li className={status}>{onClick ? <button type="button" onClick={onClick}>{content}</button> : content}</li>;
}

function ActionPanel({ campaignActive, onCampaign, onOpen }: { campaignActive: boolean; onCampaign: () => void; onOpen: () => void }) {
  const campaign = useCampaignSnapshot();
  if (campaignActive && campaign.stage > 0) {
    const spec = getCampaignSpec(campaign.selected);
    const observedSpec = campaign.resultMeasured ? { ...spec, measured: campaign.resultMeasured } : spec;
    const identity = getCampaignIdentity(campaign.runNumber);
    const operations = getCampaignOperations(campaign.runNumber, campaign.thermalBayLevel);
    const evaluation = evaluateCampaignMission(observedSpec, campaign.missionId, campaign.stage >= 7 ? campaign.resultElapsed : undefined);
    const campaignStates = {
      1: { body: 'The powder is released. Physical lot, mass, and enclosure checks own the next gate.', metric: 'PREP-01', tone: 'run' },
      2: operations.robotCondition === 'contamination'
        ? { body: 'The robot stopped before dosing. A cleaned gripper and witness coupon are required before material behavior can be trusted.', metric: `${operations.robotRecoveryMinutes} min recovery`, tone: 'warn' }
        : operations.robotCondition === 'grip-force'
          ? { body: 'The pre-dose tool check is outside its nominal band. Inspect the jaw pads and retain a force witness before handling the carrier.', metric: `${operations.robotRecoveryMinutes} min verification`, tone: 'warn' }
          : { body: 'The robot is nominal. Confirm tool identity and the carrier handshake before enabling six-position dosing.', metric: `${operations.robotRecoveryMinutes} min setup`, tone: 'run' },
      3: { body: 'Six crucible positions are executing under the governed carrier handshake.', metric: '6 positions', tone: 'run' },
      4: { body: campaign.thermalBayLevel >= 2 ? `Chamber A remains occupied by ${operations.activeFurnaceRun}. Qualified chamber B needs an independent readiness proof before load.` : `FURN-04 is capacity one. ${operations.activeFurnaceRun} must complete and the carrier hold location must be proven.`, metric: `${operations.furnaceLane} · ${operations.queueMinutes} min`, tone: 'warn' },
      5: operations.furnaceCondition === 'thermocouple-drift'
        ? { body: `${operations.furnaceResult} must be corrected with a qualified controller offset and an independent overtemperature proof before ${spec.profile} can start.`, metric: `${operations.furnaceRecoveryMinutes} min recovery`, tone: 'warn' }
        : operations.furnaceCondition === 'door-seal'
          ? { body: `${operations.furnaceResult} requires gasket inspection, latch adjustment, and a stable door-chain proof before ${spec.profile} can start.`, metric: `${operations.furnaceRecoveryMinutes} min recovery`, tone: 'warn' }
          : { body: `${identity.thermalSample} is loaded. The safety chain and controller agreement still own the start gate.`, metric: `${operations.furnaceRecoveryMinutes} min setup`, tone: 'run' },
      6: operations.referenceCondition === 'age-due'
        ? { body: 'A current NIST SRM 640f silicon QC check must pass before the campaign sample can be measured.', metric: `${operations.referenceAgeHours} h since QC`, tone: 'warn' }
        : operations.referenceCondition === 'trend-review'
          ? { body: 'The silicon QC check is still current, but its position trend needs confirmation before the sample is measured.', metric: `${operations.referenceAgeHours} h QC check`, tone: 'run' }
          : { body: 'The silicon QC check is current. Review it, prove the shutter chain, and acquire the sample pattern.', metric: `${operations.referenceAgeHours} h QC check`, tone: 'run' },
      7: campaign.confirmationSource
        ? { body: `The unchanged recipe moved from ${campaign.confirmationSource.measured}% to ${campaign.resultMeasured}%. ${evaluation.met ? 'The mission boundary repeated; inspect the comparability audit before claiming robustness.' : 'The mission boundary did not repeat; return to design or acquire mechanism evidence.'}`, metric: `${Math.abs(Number(campaign.resultMeasured) - Number(campaign.confirmationSource.measured)).toFixed(1)} pp spread`, tone: 'ready' }
        : { body: `${evaluation.resultText};${evaluation.constraintText}. The qualified result remains useful evidence.`, metric: evaluation.gap, tone: 'ready' },
      8: { body: 'Measure four preplanned, separated locations and one matching EDS map before suggesting a mechanism.', metric: '0 / 4 locations', tone: 'run' },
      9: { body: `${spec.id === 'D-08' ? 'Ti-rich cores' : 'Ca-rich secondary grains'} are retained as a follow-up hypothesis, not treated as bulk proof.`, metric: '4 / 4 fields', tone: 'ready' },
    } as const;
    const state = campaignStates[campaign.stage as keyof typeof campaignStates] ?? campaignStates[7];
    return <section className={`rail-section alert-card tone-${state.tone}`}><div className="metric-row"><span>Current state</span><strong>{state.metric}</strong></div><p>{state.body}</p><button className="primary-action" type="button" onClick={onCampaign}>OPEN CAMPAIGN CONTROL<span>→</span></button></section>;
  }
  return <section className="rail-section alert-card tone-ready"><button className="primary-action" type="button" onClick={onOpen}>OPEN XRD LAB<span>→</span></button></section>;
}

function LedgerDrawer({ log, onClose }: { log: LogItem[]; onClose: () => void }) {
  return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="ledger-drawer" role="dialog" aria-modal="true" aria-label="Evidence log" onClick={(event) => event.stopPropagation()}><header><div><p className="section-kicker">EVIDENCE</p><h2>What you observed</h2></div><button type="button" onClick={onClose} aria-label="Close evidence log">×</button></header>{!log.length && <p className="drawer-intro">Nothing recorded yet.</p>}<ol>{[...log].reverse().map((item, index) => <li key={`${item.time}-${index}`}><time>{item.time}</time><i className={item.type}>{item.type}</i><p>{item.text}</p></li>)}</ol></aside></div>;
}
