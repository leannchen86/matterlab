'use client';

import { useEffect, useState } from 'react';
import { getCampaignIdentity, getCampaignSpec } from './campaign-spec';
import { getCampaignStationId, getCampaignStationView } from './campaign-context';
import type { Station } from './sim-data';

type Tab = 'hmi' | 'les' | 'lims' | 'cmms';
type ScenarioId = 'xrd' | 'bet' | 'furnace' | 'tga' | 'facility';
type ConsoleSession = { completed: Record<Tab, boolean>; hmiOperations: string[] };

const emptyConsoleSession = (): ConsoleSession => ({ completed: { hmi: false, les: false, lims: false, cmms: false }, hmiOperations: [] });

const TAB_META: Record<Tab, { icon: string; label: string; sub: string }> = {
  hmi: { icon: '⌁', label: 'HMI', sub: 'live control' },
  les: { icon: '✓', label: 'LES', sub: 'method steps' },
  lims: { icon: '⌗', label: 'LIMS', sub: 'sample record' },
  cmms: { icon: '◇', label: 'CMMS', sub: 'asset health' },
};

const profiles: Record<string, {
  controller: string;
  safe: string[];
  method: string[];
  sample: [string, string, string];
  workOrder: string;
  service: string;
  health: number;
  supplies: string[];
}> = {
  'PREP-01': { controller: 'BAL-01 / LEV-01', safe: ['LEV airflow proven', 'balance level valid', 'door sash in range'], method: ['Receive lot', 'Verify balance', 'Weigh portion', 'Bind specimen'], sample: ['LOT-91', 'PREP-91-06', 'BC-184'], workOrder: 'PM-104', service: 'Filter ΔP check · 12 d', health: 94, supplies: ['weigh boats 83%', 'antistatic brush', 'P100 filters'] },
  'ROBO-02': { controller: 'RC-02 / SAFE-PLC', safe: ['area scanner clear', 'gate chain closed', 'gripper pressure valid'], method: ['Read carrier', 'Confirm destination', 'Execute transfer', 'Write handshake'], sample: ['BC-184', 'POSE-1192', 'XRD-03'], workOrder: 'WO-775', service: 'Gripper inspection · 4 d', health: 88, supplies: ['jaw inserts 2', 'vacuum cups 8', 'grease kit'] },
  'FURN-04': { controller: 'TC-04 / OT-04', safe: ['door interlock closed', 'overtemp relay armed', 'exhaust flow proven'], method: ['Verify occupancy', 'Load recipe', 'Ramp + dwell', 'Cool / release'], sample: ['BC-207', 'RCP-1000C', 'RUN-882'], workOrder: 'CAL-092', service: 'Thermocouple survey · 18 d', health: 91, supplies: ['type-K TC 3', 'hearth plate', 'door rope'] },
  'XRD-03': { controller: 'XRD-03 / RAD-PLC', safe: ['enclosure closed', 'shutter feedback closed', 'generator standby'], method: ['Load reference', 'Align holder', 'Acquire scan', 'Review control limit'], sample: ['BC-184-06', 'CA-TI-031', 'PAT-7738'], workOrder: 'QC-2841', service: 'NIST Si reference · due', health: 76, supplies: ['zero-background holders 4', 'Si standard', 'Kapton film'] },
  'SEM-01': { controller: 'SEM-01 / VAC-1', safe: ['chamber vented or pumped', 'stage Z clearance valid', 'HV blanked'], method: ['Mount stub', 'Pump chamber', 'Set field + kV', 'Capture BSE / EDS'], sample: ['CA-TI-031', 'STUB-118', 'MAP-04'], workOrder: 'PM-318', service: 'Aperture clean · 23 d', health: 96, supplies: ['carbon tabs 41', 'Al stubs 18', 'aperture set'] },
  'BET-02': { controller: 'BET-02 / VAC-MFD', safe: ['vacuum trend stable', 'N₂ supply in range', 'tube ports isolated'], method: ['Verify pretreatment', 'Enter dry mass', 'Leak test', 'Acquire isotherm'], sample: ['ADS-77-C', 'DEGAS-771', 'ISO-220'], workOrder: 'MX-233', service: 'Vendor recommission · open', health: 63, supplies: ['sample tubes 12', 'filler rods 8', 'LN₂ dewar'] },
  'TGA-01': { controller: 'TGA-01 / GAS-3', safe: ['furnace near ambient', 'purge path proven', 'autosampler clear'], method: ['Select pan pair', 'Record sample mass', 'Run baseline / method', 'Review mass + heat flow'], sample: ['LOT-91-T', 'PANSET-14', 'THM-208'], workOrder: 'QC-621', service: 'Baseline + balance check · due', health: 84, supplies: ['Al pans 26', 'Pt pans 4', 'pan crimper'] },
};

const HMI_OPERATIONS: Record<string, [string, string, string]> = {
  'PREP-01': ['Prove enclosure flow', 'Zero analytical balance', 'Confirm antistatic state'],
  'ROBO-02': ['Reset safeguarded stop', 'Home transfer axes', 'Prove gripper state'],
  'FURN-04': ['Read overtemperature relay', 'Verify door chain', 'Confirm empty-cell state'],
  'XRD-03': ['Home specimen stage', 'Prove shutter feedback', 'Read reference position'],
  'SEM-01': ['Establish chamber vacuum', 'Verify stage clearance', 'Arm BSE / EDS detectors'],
  'BET-02': ['Isolate analysis ports', 'Run manifold leak check', 'Prove N₂ supply state'],
  'TGA-01': ['Tare balance channel', 'Prove purge path', 'Home autosampler carousel'],
};

function getCampaignHmiOperations(stationId: string, stage: number, selected: string, runNumber: number): string[] | null {
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  if (!stage) return null;
  if (stationId === 'ROBO-02' && stage === 2) return ['Verify safeguarded stop', 'Clean gripper tooling', 'Acquire witness coupon'];
  if (stationId === 'ROBO-02') return [`Scan ${identity.carrier} carrier`, 'Verify six dose positions', 'Execute crucible dosing'];
  if (stationId === 'FURN-04' && stage === 4) return ['Read active profile state', 'Verify queue position', `Confirm ${identity.carrier} hold location`];
  if (stationId === 'FURN-04') return ['Read overtemperature relay', 'Verify door chain', `Start ${spec.profile} profile`];
  if (stationId === 'XRD-03' && stage === 6) return ['Home specimen stage', 'Prove shutter feedback', 'Acquire Si reference', `Acquire ${identity.runId} pattern`];
  if (stationId === 'XRD-03') return ['Review Si control', 'Review phase fit', `Release ${identity.pattern} evidence`];
  return HMI_OPERATIONS[stationId] ?? null;
}

function getCampaignMethodStep(stage: number) {
  if (stage === 1 || stage === 2 || stage === 4 || stage === 6) return 1;
  if (stage === 3 || stage === 5) return 2;
  return 3;
}

function completeCampaignMachineStage(stage: number) {
  if (stage < 1 || stage > 6) return null;
  try {
    const current = JSON.parse(window.localStorage.getItem('mattershift-campaign-v2') ?? '{}') as { stage?: number; elapsed?: number; insight?: number; selected?: string; runNumber?: number; history?: unknown[]; [key: string]: unknown };
    if (Number(current.stage) !== stage) return null;
    const elapsed = Number(current.elapsed ?? 0);
    const insight = Number(current.insight ?? 248);
    const spec = getCampaignSpec(String(current.selected ?? 'C-42'));
    const identity = getCampaignIdentity(Number(current.runNumber ?? 42));
    const transition = {
      1: { stage: 2, elapsed: 12, insight, message: `${identity.prepSample} evidence retained. ROBO-02 stopped on a gripper cleanliness fault before dosing.` },
      2: { stage: 3, elapsed: elapsed + 18, insight: insight - 8, message: 'Gripper cleaned and witness coupon passed. Robot synthesis resumed with lineage intact.' },
      3: { stage: 4, elapsed: elapsed + 14, insight, message: `Six crucibles dosed and ${identity.carrier} released. FURN-04 is occupied by RUN-039; ${identity.runId} is now queue constrained.` },
      4: { stage: 5, elapsed: elapsed + 62, insight, message: `RUN-039 cooled and unloaded. Queue proof retained; ${identity.runId} entered ${spec.profile} at ${spec.temperature}.` },
      5: { stage: 6, elapsed: elapsed + spec.thermalMinutes, insight, message: `${spec.temperature} / ${spec.dwell} thermal trace retained. XRD specimen release is held because the Si reference is overdue.` },
      6: { stage: 7, elapsed: elapsed + 18, insight: insight + spec.insightReward, message: `Reference passed at +0.01° 2θ. ${spec.id} measured ${spec.measured}% target phase: valid evidence, ${spec.objectiveMet ? `${spec.gap} above the objective.` : `${spec.gap.replace('−', '')} below the objective.`}` },
    }[stage];
    if (!transition) return null;
    const history = Array.isArray(current.history) ? current.history : [];
    const next = { ...current, ...transition, history: stage === 6 ? [...history, { runNumber: identity.runNumber, candidate: spec.id, measured: spec.measured, gap: spec.gap, objectiveMet: spec.objectiveMet, elapsed: transition.elapsed }] : history };
    window.localStorage.setItem('mattershift-campaign-v2', JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('mattershift:campaign-state', { detail: next }));
    return transition.stage;
  } catch {
    return null;
  }
}

function getContextProfile(stationId: string, scenarioId: ScenarioId, campaignStage = 0, selected = 'C-42', runNumber = 42): typeof profiles[string] {
  const profile = profiles[stationId] ?? profiles['XRD-03'];
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  if (campaignStage === 1 && stationId === 'PREP-01') return { ...profile, controller: `BAL-01 / LES-${spec.id.replace('-', '')}`, method: ['Scan precursor lots', `Weigh ${spec.id} formulation`, 'Homogenize + seal', `Release ${identity.runId}`], sample: [spec.id, identity.prepSample, identity.carrier], workOrder: `MAT-${identity.suffix}`, service: 'Campaign preparation · active', supplies: [spec.precursorLabel, `target ${spec.targetMass}`, 'sealed liners 14'] };
  if (campaignStage >= 2 && campaignStage <= 3 && stationId === 'ROBO-02') return { ...profile, controller: 'RC-02 / CAMPAIGN-PLC', safe: ['area scanner clear', 'gate chain closed', 'gripper witness valid'], method: [`Receive ${identity.carrier}`, 'Clean + witness gripper', 'Dose crucibles', 'Write carrier handshake'], sample: [identity.prepSample, identity.carrier, identity.furnaceQueue], workOrder: `MAT-${identity.suffix}`, service: campaignStage === 2 ? 'Gripper cleanliness recovery · active' : 'Campaign dosing · active', health: campaignStage === 2 ? 79 : 90 };
  if (campaignStage >= 4 && campaignStage <= 5 && stationId === 'FURN-04') return { ...profile, controller: `TC-04 / MES-Q${identity.suffix}`, method: [`Accept ${identity.carrier}`, 'Respect active queue', `Load ${spec.temperature} profile`, 'Cool + release'], sample: [identity.carrier, spec.profile, identity.thermalSample], workOrder: `MAT-${identity.suffix}`, service: campaignStage === 4 ? 'Queue 01 · RUN-039 active' : `${spec.profile} · active` };
  if (campaignStage >= 6 && stationId === 'XRD-03') return { ...profile, controller: 'XRD-03 / CAMPAIGN-QC', method: ['Load NIST Si', 'Prove +0.01° 2θ', `Acquire ${identity.runId}`, `Review ${spec.measured}% result`], sample: [identity.thermalSample, identity.xrdDataset, identity.pattern], workOrder: `MAT-${identity.suffix}`, service: campaignStage === 6 ? 'Si reference · release hold' : `Valid result · target ${spec.objectiveMet ? 'met' : 'missed'}`, health: campaignStage === 6 ? 78 : 92 };
  if (scenarioId === 'facility' && stationId === 'PREP-01') return { ...profile, controller: 'MOVE-HMI / MES-A2', method: ['Scan both totes', 'Inspect powered jack', 'Secure load + route', 'Retain move receipt'], sample: ['LOT-3024-A', 'MOV-3024', 'REC-BET-02'], workOrder: 'MOV-3024', service: 'Powered-jack pre-use · current', supplies: ['restraint straps 6', 'spill kit sealed', 'tote covers 12'] };
  if (scenarioId === 'facility' && stationId === 'ROBO-02') return { ...profile, method: ['Reserve cross-aisle', 'Park robot', 'Prove safeguarded boundary', 'Release move priority'], sample: ['MOV-3024', 'A2-RESERVE', 'BET-02'], workOrder: 'MOV-3024', service: 'Cross-aisle coordination · active' };
  if (scenarioId === 'facility' && stationId === 'BET-02') return { ...profile, controller: 'BET-02 / GAS-MFD', method: ['Isolate service boundary', 'Verify GAS-41 identity', 'Run leak + control', 'Release data window'], sample: ['GAS-41', 'ALU-21', 'POST-GAS-41'], workOrder: 'GAS-41', service: 'N₂ service transition · active', health: 89 };
  if (scenarioId === 'furnace' && stationId === 'ROBO-02') return { ...profile, method: ['Observe cell', 'Reconcile occupancy', 'Dry-cycle handshake', 'Park + retain state'], sample: ['BC-207', 'I-204', 'REC-HT44'], workOrder: 'WO-2954', service: 'Recovery inspection · active' };
  if (scenarioId === 'xrd' && stationId === 'FURN-04') return { ...profile, method: ['Verify BC-184 occupancy', 'Load HT-1000', 'Ramp + dwell', 'Cool / release'], sample: ['BC-184', 'HT-1000', 'CA-TI-031'], workOrder: 'WO-2841', service: 'Campaign cycle · controlled' };
  if (scenarioId === 'xrd' && stationId === 'SEM-01') return { ...profile, sample: ['SPEC-184-03', 'BSE-F01', 'MAP-04'], workOrder: 'WO-2841', service: 'Inclusion triage · active' };
  return profile;
}

export function StationAccess({ station, scenarioId = 'xrd', physicalChecks = [] }: { station: Station; scenarioId?: ScenarioId; physicalChecks?: string[] }) {
  const [open, setOpen] = useState(false);
  const [enteredFromLab, setEnteredFromLab] = useState(false);
  const [enteredChecks, setEnteredChecks] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('hmi');
  const [sessions, setSessions] = useState<Record<string, ConsoleSession>>({});
  const [campaignStage, setCampaignStage] = useState(() => {
    if (typeof window === 'undefined') return 0;
    try { return Number(JSON.parse(window.localStorage.getItem('mattershift-campaign-v2') ?? '{}').stage ?? 0); } catch { return 0; }
  });
  const [campaignSelected, setCampaignSelected] = useState(() => {
    if (typeof window === 'undefined') return 'C-42';
    try { return String(JSON.parse(window.localStorage.getItem('mattershift-campaign-v2') ?? '{}').selected ?? 'C-42'); } catch { return 'C-42'; }
  });
  const [campaignRunNumber, setCampaignRunNumber] = useState(() => {
    if (typeof window === 'undefined') return 42;
    try { return Number(JSON.parse(window.localStorage.getItem('mattershift-campaign-v2') ?? '{}').runNumber ?? 42); } catch { return 42; }
  });
  const campaignActive = getCampaignStationId(campaignStage) === station.id;
  const contextKey = campaignActive ? `${station.id}:RUN-${campaignRunNumber}:${campaignSelected}:S${campaignStage}` : station.id;
  const consoleStation = campaignActive ? getCampaignStationView(station, campaignStage, campaignSelected, campaignRunNumber) : station;
  const session = sessions[contextKey] ?? emptyConsoleSession();
  const completed = session.completed;
  const hmiOperations = session.hmiOperations;
  const profile = getContextProfile(station.id, scenarioId, campaignActive ? campaignStage : 0, campaignSelected, campaignRunNumber);
  const activePhysicalChecks = campaignActive ? (enteredFromLab ? enteredChecks : []) : physicalChecks;
  const recordStationEvent = (type: string, text: string, action?: string) => window.dispatchEvent(new CustomEvent('mattershift:station-event', { detail: { stationId: station.id, type, text, action } }));
  const finish = () => {
    setSessions((current) => {
      const active = current[contextKey] ?? emptyConsoleSession();
      return { ...current, [contextKey]: { ...active, completed: { ...active.completed, [tab]: true } } };
    });
    recordStationEvent('attestation', `${station.id} ${TAB_META[tab].label} ${tab === 'hmi' ? 'safe-state attestation' : 'operator action'} retained with TECH-07 and the active record revision.`);
    if (tab === 'hmi' && campaignActive) {
      const nextStage = completeCampaignMachineStage(campaignStage);
      if (nextStage) window.setTimeout(() => {
        setOpen(false);
        setEnteredFromLab(false);
        setEnteredChecks([]);
        const stationId = getCampaignStationId(nextStage);
        window.dispatchEvent(new CustomEvent('mattershift:return-to-lab', { detail: { stationId } }));
      }, 420);
    }
  };
  const commitHmiOperation = (operation: string) => {
    if (hmiOperations.includes(operation)) return;
    setSessions((current) => {
      const active = current[contextKey] ?? emptyConsoleSession();
      return { ...current, [contextKey]: { ...active, hmiOperations: [...active.hmiOperations, operation] } };
    });
    recordStationEvent('control', `${station.id} local control: ${operation}; equipment feedback retained.`, operation);
  };

  useEffect(() => {
    const followCampaign = (event: Event) => {
      const detail = (event as CustomEvent<{ stage?: number; selected?: string; runNumber?: number }>).detail;
      setCampaignStage(Number(detail?.stage ?? 0));
      if (detail?.selected) setCampaignSelected(String(detail.selected));
      if (detail?.runNumber) setCampaignRunNumber(Number(detail.runNumber));
    };
    window.addEventListener('mattershift:campaign-state', followCampaign);
    return () => window.removeEventListener('mattershift:campaign-state', followCampaign);
  }, []);

  useEffect(() => {
    const openFromLab = (event: Event) => {
      const request = event as CustomEvent<{ stationId?: string; physicalChecks?: string[] }>;
      if (request.detail?.stationId === station.id) {
        setEnteredFromLab(true);
        setEnteredChecks(request.detail.physicalChecks ?? []);
        setOpen(true);
      }
    };
    window.addEventListener('mattershift:open-console', openFromLab);
    return () => window.removeEventListener('mattershift:open-console', openFromLab);
  }, [station.id]);

  const closeConsole = () => {
    setOpen(false);
    setEnteredFromLab(false);
    setEnteredChecks([]);
  };
  const returnToAsset = () => {
    setOpen(false);
    setEnteredFromLab(false);
    setEnteredChecks([]);
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mattershift:return-to-lab', { detail: { stationId: station.id } })));
  };

  return <>
    <button className="station-access-button" type="button" onClick={() => { setEnteredFromLab(false); setEnteredChecks([]); setOpen(true); }}><span>⌁</span><b>OPEN LOCAL CONSOLE</b><i>{campaignActive ? 'ENTER THROUGH 3D WALK · ' : physicalChecks.length === 3 ? 'WALK ✓ · ' : `WALK ${physicalChecks.length}/3 · `}HMI · LES · LIMS · CMMS</i><em>→</em></button>
    {open && <div className="modal-backdrop station-console-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeConsole(); }}>
      <section className="modal-card wide station-console" role="dialog" aria-modal="true" aria-label={`${station.name} local station console`}>
        <header><div><p className="section-kicker">LOCAL STATION ACCESS · {profile.controller}</p><h2>{station.id} / {station.name}</h2></div><div className="console-header-actions">{enteredFromLab && <button type="button" className="return-asset" onClick={returnToAsset}>← RETURN TO ASSET</button>}<button type="button" onClick={closeConsole} aria-label="Close">×</button></div></header>
        <div className="console-shell">
          <nav className="console-nav" aria-label="Station systems">
            {Object.entries(TAB_META).map(([id, meta]) => <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id as Tab)}>
              <span>{meta.icon}</span><b>{meta.label}</b><small>{meta.sub}</small>{completed[id as Tab] && <i>✓</i>}
            </button>)}
          </nav>
          <div className="console-main">
            <div className="console-statusbar"><span><i className="online" />PLC ONLINE</span><span>ROLE <b>TECH-07</b></span><span>WALK <b>{activePhysicalChecks.length}/3</b></span><span><i className={consoleStation.tone === 'warn' ? 'alarm' : consoleStation.tone === 'off' ? '' : 'online'} />{consoleStation.state}</span></div>
            {tab === 'hmi' && <HmiView station={consoleStation} profile={profile} campaignStage={campaignActive ? campaignStage : 0} campaignSelected={campaignSelected} campaignRunNumber={campaignRunNumber} physicalChecks={activePhysicalChecks} operations={hmiOperations} onOperation={commitHmiOperation} complete={completed.hmi} onComplete={finish} />}
            {tab === 'les' && <LesView station={consoleStation} profile={profile} campaignStage={campaignActive ? campaignStage : 0} complete={completed.les} onComplete={finish} />}
            {tab === 'lims' && <LimsView station={consoleStation} profile={profile} scenarioId={scenarioId} campaignStage={campaignActive ? campaignStage : 0} campaignSelected={campaignSelected} complete={completed.lims} onComplete={finish} />}
            {tab === 'cmms' && <CmmsView profile={profile} complete={completed.cmms} onComplete={finish} />}
          </div>
        </div>
      </section>
    </div>}
  </>;
}

function HmiView({ station, profile, campaignStage, campaignSelected, campaignRunNumber, physicalChecks, operations, onOperation, complete, onComplete }: { station: Station; profile: typeof profiles[string]; campaignStage: number; campaignSelected: string; campaignRunNumber: number; physicalChecks: string[]; operations: string[]; onOperation: (operation: string) => void; complete: boolean; onComplete: () => void }) {
  const releaseBlocked = station.tone === 'warn' || station.tone === 'off' || station.tone === 'hold';
  const walkaroundComplete = physicalChecks.length === 3;
  const operationSteps = getCampaignHmiOperations(station.id, campaignStage, campaignSelected, campaignRunNumber) ?? (station.id === 'FURN-04' && station.state !== 'READY'
    ? ['Read overtemperature relay', 'Verify door chain', 'Confirm chamber occupancy']
    : HMI_OPERATIONS[station.id] ?? HMI_OPERATIONS['XRD-03']);
  const completedOperations = operationSteps.filter((operation) => operations.includes(operation)).length;
  const operationsComplete = operationSteps.every((operation) => operations.includes(operation));
  return <div className="console-view hmi-view">
    <div className="console-view-head"><div><p className="section-kicker">HMI / SCADA</p><h3>Equipment state + permissives</h3></div><span>REFRESH 250 ms</span></div>
    <div className="hmi-layout">
      <div className="instrument-mimic"><InstrumentMimic station={station} /><div className="mimic-caption"><span>ASSET MIMIC</span><b>{station.id}</b><i>{station.state}</i></div></div>
      <div className="live-readouts">{station.technicianView.map((item, index) => { const [key, value = '—'] = item.split(': '); return <div key={item}><span>{key}</span><b>{value}</b><i style={{ width: `${58 + index * 9}%` }} /></div>; })}</div>
      <div className="permissive-panel"><p className="mini-label">START PERMISSIVES</p>{profile.safe.map((item) => <div key={item}><i className="ok">✓</i><span>{item}</span><b>TRUE</b></div>)}<div><i className={walkaroundComplete ? 'ok' : 'attention'}>{walkaroundComplete ? '✓' : '!'}</i><span>physical walkaround evidence</span><b>{walkaroundComplete ? 'TRUE' : 'HOLD'}</b></div><div><i className={releaseBlocked ? 'attention' : 'ok'}>{releaseBlocked ? '!' : '✓'}</i><span>quality / service release</span><b>{releaseBlocked ? 'HOLD' : 'TRUE'}</b></div></div>
    </div>
    {campaignStage >= 6 && station.id === 'XRD-03' && <XrdCampaignPanel stage={campaignStage} selected={campaignSelected} runNumber={campaignRunNumber} operations={operations} />}
    <div className="hmi-operations">
      <div><p className="mini-label">LOCAL CONTROL SEQUENCE</p><span>{completedOperations} / {operationSteps.length} proven</span></div>
      {operationSteps.map((operation, index) => { const done = operations.includes(operation); const priorComplete = operationSteps.slice(0, index).every((prior) => operations.includes(prior)); const active = walkaroundComplete && priorComplete && !done; return <button key={operation} type="button" className={done ? 'done' : active ? 'active' : ''} disabled={!walkaroundComplete || !priorComplete || done} onClick={() => onOperation(operation)}><i>{done ? '✓' : `0${index + 1}`}</i><b>{operation}</b><small>{done ? 'feedback retained' : active ? 'ready at HMI' : walkaroundComplete ? 'sequence held' : 'walkaround held'}</small></button>; })}
    </div>
    <ConsoleAction complete={complete} disabled={!walkaroundComplete || !operationsComplete} idle={!walkaroundComplete ? 'WALKAROUND REQUIRED' : operationsComplete ? 'ATTEST SAFE STATE' : 'COMPLETE CONTROL SEQUENCE'} done="SAFE STATE ATTESTED" note={complete ? 'Attestation staged for the LES record.' : !walkaroundComplete ? `${physicalChecks.length}/3 physical inspection points linked. Use 3D focus mode.` : operationsComplete ? 'Physical state and local feedback agree; quality or service holds remain independent.' : `${completedOperations}/${operationSteps.length} local subsystem checks retained.`} onClick={onComplete} />
  </div>;
}

const XRD_PEAKS: Record<string, Array<[number, number]>> = {
  'C-42': [[23.2, .28], [33.1, 1], [40.8, .36], [47.6, .55], [59.2, .72], [69.4, .31]],
  'Z-17': [[22.9, .22], [29.5, .27], [32.8, 1], [40.4, .41], [47.1, .61], [58.8, .78], [69.1, .38], [74.2, .18]],
  'D-08': [[23.1, .25], [33.0, 1], [40.6, .34], [47.4, .49], [59.0, .68], [69.3, .29]],
};

function diffractionPath(peaks: Array<[number, number]>, baseline: number, amplitude: number) {
  return Array.from({ length: 151 }, (_, index) => {
    const angle = 10 + index * (70 / 150);
    const intensity = peaks.reduce((sum, [center, height]) => sum + height * Math.exp(-0.5 * ((angle - center) / .34) ** 2), 0);
    const x = 42 + index * (584 / 150);
    const y = baseline - Math.min(1.06, intensity) * amplitude;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function XrdCampaignPanel({ stage, selected, runNumber, operations }: { stage: number; selected: string; runNumber: number; operations: string[] }) {
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  const referenceCaptured = stage >= 7 || operations.includes('Acquire Si reference');
  const sampleCaptured = stage >= 7 || operations.includes(`Acquire ${identity.runId} pattern`);
  const samplePeaks = XRD_PEAKS[spec.id] ?? XRD_PEAKS['C-42'];
  return <section className={`campaign-xrd-console${sampleCaptured ? ' result-ready' : ''}`}>
    <header><div><span>DIFFRACTION ACQUISITION</span><b>{identity.xrdDataset} · Cu Kα · 10–80° 2θ</b></div><em>{sampleCaptured ? 'PATTERN COMPLETE' : referenceCaptured ? 'REFERENCE PASS' : 'CONTROL REQUIRED'}</em></header>
    <div className="campaign-xrd-layout">
      <svg viewBox="0 0 660 210" role="img" aria-label={`${identity.runId} simulated XRD reference and diffraction pattern`}>
        <defs><linearGradient id="xrdFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4dd5ed" stopOpacity=".25" /><stop offset="1" stopColor="#4dd5ed" stopOpacity="0" /></linearGradient></defs>
        {[42, 126, 210, 294, 378, 462, 546, 626].map((x) => <line key={`x-${x}`} x1={x} x2={x} y1="17" y2="186" className="grid" />)}
        {[30, 64, 98, 132, 166].map((y) => <line key={`y-${y}`} x1="42" x2="626" y1={y} y2={y} className="grid" />)}
        <line x1="42" x2="626" y1="76" y2="76" className="baseline" /><line x1="42" x2="626" y1="174" y2="174" className="baseline" />
        <text x="48" y="24">NIST Si CONTROL</text><text x="48" y="116">{identity.runId} · {spec.id}</text>
        {referenceCaptured ? <path d={diffractionPath([[28.44, 1], [47.3, .24], [56.1, .16]], 72, 42)} className="reference-trace" /> : <path d="M42 72 H626" className="awaiting-trace" />}
        {sampleCaptured ? <><path d={`${diffractionPath(samplePeaks, 172, 58)} L626 174 L42 174 Z`} className="sample-fill" /><path d={diffractionPath(samplePeaks, 172, 58)} className="sample-trace" /></> : <path d="M42 172 H626" className="awaiting-trace" />}
        {!sampleCaptured && referenceCaptured && <line x1="118" x2="118" y1="106" y2="176" className="scan-sweep" />}
        <text x="38" y="198">10°</text><text x="324" y="198">2θ</text><text x="609" y="198">80°</text>
      </svg>
      <aside>
        <div className={referenceCaptured ? 'pass' : 'hold'}><span>REFERENCE</span><b>{referenceCaptured ? '+0.01° 2θ' : 'OVERDUE'}</b><small>{referenceCaptured ? 'within ±0.05°' : 'specimen inhibited'}</small></div>
        <div className={sampleCaptured ? 'pass' : 'waiting'}><span>PHASE FIT</span><b>{sampleCaptured ? `${spec.measured}%` : '—'}</b><small>{sampleCaptured ? `Rwp ${spec.id === 'Z-17' ? '7.2' : spec.id === 'D-08' ? '8.1' : '7.6'}%` : 'awaiting pattern'}</small></div>
        <div className={sampleCaptured ? spec.objectiveMet ? 'pass' : 'miss' : 'waiting'}><span>OBJECTIVE</span><b>{sampleCaptured ? spec.gap : '≥ 96%'}</b><small>{sampleCaptured ? spec.objectiveMet ? 'target met' : 'valid negative' : 'campaign gate'}</small></div>
      </aside>
    </div>
  </section>;
}

function LesView({ station, profile, campaignStage, complete, onComplete }: { station: Station; profile: typeof profiles[string]; campaignStage: number; complete: boolean; onComplete: () => void }) {
  const active = campaignStage ? getCampaignMethodStep(campaignStage) : station.tone === 'run' ? 2 : station.tone === 'warn' ? 1 : 0;
  return <div className="console-view">
    <div className="console-view-head"><div><p className="section-kicker">LES / METHOD EXECUTION</p><h3>Guided work + operator attestations</h3></div><span>REV 8.4 · EFFECTIVE</span></div>
    <div className="les-layout"><div className="procedure-rail">{profile.method.map((step, index) => <div key={step} className={index < active ? 'done' : index === active ? 'active' : ''}><span>{index < active ? '✓' : `0${index + 1}`}</span><i /><div><b>{step}</b><small>{index < active ? 'evidence attached' : index === active ? 'technician action' : 'blocked by sequence'}</small></div><em>{index < active ? 'COMPLETE' : index === active ? 'ACTIVE' : 'WAIT'}</em></div>)}</div><aside className="method-card"><span>METHOD</span><b>{station.id}-OPS-08</b><div><i />controlled copy</div><div><i />training current</div><div><i />instrument matched</div><small>Electronic signature will bind the operator, method revision, timestamp, and asset.</small></aside></div>
    <ConsoleAction complete={complete} idle="ATTEST ACTIVE STEP" done="STEP ATTESTED" note={complete ? 'Operator + method revision bound to this execution.' : 'Attestation does not bypass the physical verification.'} onClick={onComplete} />
  </div>;
}

function LimsView({ station, profile, scenarioId, campaignStage, campaignSelected, complete, onComplete }: { station: Station; profile: typeof profiles[string]; scenarioId: ScenarioId; campaignStage: number; campaignSelected: string; complete: boolean; onComplete: () => void }) {
  const itemNotes = campaignStage
    ? ['campaign formulation / physical input', 'governed run + carrier association', 'native evidence package']
    : scenarioId === 'facility'
    ? ['physical tag + declared target', 'governed move / service record', 'receipt + bounded data window']
    : scenarioId === 'furnace'
      ? ['physical load identity', 'interruption + recovery record', 'retained censored dataset']
      : ['received + released', 'asset association', 'native result package'];
  const facilityState = station.id === 'PREP-01'
    ? station.state === 'BAY RELEASED' ? 'MOVE RECEIVED' : station.state === 'TRANSFER READY' ? 'MOVE RELEASED' : 'MOVE HOLD'
    : station.state === 'READY' ? 'ELIGIBLE' : station.state === 'DATA REVIEW' ? 'WINDOW HOLD' : station.state === 'QC READY' ? 'CONTROL READY' : 'SERVICE HOLD';
  const chainState = campaignStage === 2 ? 'CONTAM HOLD' : campaignStage === 4 ? 'QUEUE HOLD' : campaignStage === 6 ? 'QC HOLD' : campaignStage >= 7 ? getCampaignSpec(campaignSelected).objectiveMet ? 'VALID · HIT' : 'VALID · MISS' : campaignStage ? 'IN PROCESS' : scenarioId === 'furnace' ? 'CENSORED' : scenarioId === 'bet' ? 'RECONCILE' : scenarioId === 'tga' ? 'PAN HOLD' : scenarioId === 'facility' ? facilityState : 'QC HOLD';
  return <div className="console-view">
    <div className="console-view-head"><div><p className="section-kicker">LIMS / SAMPLE IDENTITY</p><h3>Physical item ↔ digital record</h3></div><span>CHAIN LOCKED</span></div>
    <div className="lims-layout"><div className="lims-chain">{profile.sample.map((item, index) => <div key={item}><span>{['SOURCE', 'SPECIMEN / RUN', 'DATASET'][index]}</span><b>{item}</b><Barcode seed={index + item.length} /><small>{itemNotes[index]}</small></div>)}</div><div className="lineage-connector"><i /><i /><span>{chainState}</span></div><aside className="lims-facts"><p className="mini-label">REQUIRED LINKS</p><div><span>lot / batch</span><b>BOUND</b></div><div><span>operator</span><b>TECH-07</b></div><div><span>method revision</span><b>08</b></div><div><span>raw file hash</span><b>READY</b></div></aside></div>
    <ConsoleAction complete={complete} idle="SCAN + VERIFY ASSOCIATION" done="ASSOCIATION VERIFIED" note={complete ? 'Barcode, selected record, and asset context agree.' : 'A plausible neighboring record is still the wrong record.'} onClick={onComplete} />
  </div>;
}

function CmmsView({ profile, complete, onComplete }: { profile: typeof profiles[string]; complete: boolean; onComplete: () => void }) {
  return <div className="console-view">
    <div className="console-view-head"><div><p className="section-kicker">CMMS / ASSET RELIABILITY</p><h3>Service evidence + return to use</h3></div><span>{profile.workOrder}</span></div>
    <div className="cmms-layout"><div className="health-dial" style={{ '--health': `${profile.health * 3.6}deg` } as React.CSSProperties}><div><b>{profile.health}</b><span>ASSET HEALTH</span></div></div><div className="maintenance-timeline"><div className="complete"><i /><span>PREVIOUS</span><b>Inspection closed</b><small>parts + labor captured</small></div><div className="active"><i /><span>CURRENT</span><b>{profile.service}</b><small>acceptance evidence required</small></div><div><i /><span>NEXT</span><b>Performance verification</b><small>owner: lab operations</small></div></div><aside className="spares-card"><p className="mini-label">POINT-OF-USE</p>{profile.supplies.map((item, index) => <div key={item}><i className={index === 0 ? 'stock-low' : ''} /><span>{item}</span></div>)}</aside></div>
    <ConsoleAction complete={complete} idle="REVIEW RETURN-TO-USE" done="EVIDENCE REVIEWED" note={complete ? 'Service closure and laboratory acceptance are separately recorded.' : 'A vendor-closed ticket alone does not release the asset.'} onClick={onComplete} />
  </div>;
}

function ConsoleAction({ complete, disabled = false, idle, done, note, onClick }: { complete: boolean; disabled?: boolean; idle: string; done: string; note: string; onClick: () => void }) {
  return <footer className="console-action"><p><i className={complete ? 'online' : ''} />{note}</p><button type="button" disabled={disabled} className={complete ? 'complete' : ''} onClick={onClick}>{complete ? '✓ ' : ''}{complete ? done : idle}</button></footer>;
}

function Barcode({ seed }: { seed: number }) {
  return <div className="barcode" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ width: `${(index * seed) % 3 + 1}px`, opacity: index % 4 === 0 ? .45 : 1 }} />)}</div>;
}

function InstrumentMimic({ station }: { station: Station }) {
  const stationId = station.id;
  const tone = station.tone;
  const accent = tone === 'warn' ? '#f4b95f' : tone === 'run' ? '#4dd5ed' : '#51e19a';
  const furnaceRecovered = stationId === 'FURN-04' && station.state === 'READY';
  return <svg viewBox="0 0 520 270" role="img" aria-label={`${stationId} live equipment mimic`} style={{ '--mimic': accent } as React.CSSProperties}>
    <defs><linearGradient id="metal" x1="0" x2="1"><stop stopColor="#536575" /><stop offset=".5" stopColor="#1b2b3b" /><stop offset="1" stopColor="#7b8992" /></linearGradient><pattern id="mgrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#1d3145" strokeWidth="1" /></pattern></defs>
    <rect width="520" height="270" fill="#071019" /><rect width="520" height="270" fill="url(#mgrid)" opacity=".75" />
    {stationId === 'XRD-03' && <g transform="translate(98 22)"><rect width="320" height="220" rx="22" fill="url(#metal)" stroke="#8094a2" /><rect x="45" y="30" width="215" height="140" rx="16" fill="#091820" stroke="#38586a" /><path d="M92 140 A75 75 0 0 1 239 140" fill="none" stroke="#8298a6" strokeWidth="13" /><circle cx="165" cy="140" r="13" fill="#d8e2e5" /><path d="M95 90 L165 140 235 78" fill="none" stroke="var(--mimic)" strokeWidth="2" /><rect x="75" y="55" width="35" height="54" rx="4" fill="#b4c1c6" transform="rotate(-28 92 82)" /><rect x="222" y="46" width="40" height="62" rx="4" fill="#566b7a" transform="rotate(30 242 77)" /><rect x="70" y="187" width="105" height="18" fill="#07161d" /><path d="M76 198 L95 190 115 201 135 186 162 196" fill="none" stroke="var(--mimic)" strokeWidth="2" /></g>}
    {stationId === 'SEM-01' && <g transform="translate(135 18)"><path d="M120 8 H170 L185 68 H105 Z" fill="#b9c5c9" /><rect x="124" y="0" width="42" height="70" fill="url(#metal)" /><path d="M92 62 H198 L225 112 H66 Z" fill="#667986" /><ellipse cx="145" cy="154" rx="105" ry="72" fill="url(#metal)" stroke="#a3b3ba" strokeWidth="3" /><circle cx="145" cy="154" r="48" fill="#071018" stroke="#375467" /><path d="M145 45 V154" stroke="var(--mimic)" strokeWidth="2" /><circle cx="145" cy="154" r="6" fill="var(--mimic)" /><rect x="265" y="55" width="92" height="82" fill="#101f2b" stroke="#3a5266" /><g fill="#91a6ad">{Array.from({ length: 12 }, (_, i) => <circle key={i} cx={278 + (i % 4) * 21} cy={70 + Math.floor(i / 4) * 23} r={2 + i % 3} />)}</g></g>}
    {stationId === 'BET-02' && <g transform="translate(80 18)"><rect width="300" height="225" rx="10" fill="url(#metal)" stroke="#647b89" /><rect x="42" y="24" width="210" height="150" rx="5" fill="#081820" stroke="#355062" />{[74, 120, 166, 212].map((x, i) => <g key={x}><path d={`M${x} 48 V135`} stroke="#c5d7da" strokeWidth="5" /><circle cx={x} cy="146" r="13" fill={i === 2 ? '#6c7d88' : 'var(--mimic)'} opacity={i === 2 ? .65 : .9} /><path d={`M${x} 48 V35 H150`} fill="none" stroke="#8398a3" /></g>)}<circle cx="360" cy="158" r="55" fill="#526978" stroke="#8599a2" /><rect x="347" y="68" width="26" height="82" fill="#6d8290" /><path d="M270 45 Q360 42 360 88" fill="none" stroke="var(--mimic)" strokeWidth="3" /></g>}
    {stationId === 'TGA-01' && <g transform="translate(72 22)"><rect x="20" y="75" width="275" height="135" rx="16" fill="url(#metal)" stroke="#a8b5ba" /><rect x="142" y="112" width="112" height="42" rx="5" fill="#07161d" stroke="#415b69" /><path d="M158 137 H226" stroke="var(--mimic)" strokeWidth="3" /><g transform="translate(92 76)"><ellipse cx="0" cy="0" rx="48" ry="23" fill="#6b7e88" stroke="#a7b4b8" /><ellipse cx="0" cy="0" rx="19" ry="11" fill="#2c3940" stroke="#f09a5d" /><path d="M0 -10 V-55" stroke="#778b96" strokeWidth="28" /><ellipse cx="0" cy="-55" rx="21" ry="9" fill="#c0c8ca" /></g><g transform="translate(350 96)"><ellipse rx="72" ry="32" fill="#566d7b" stroke="#9aabb1" />{Array.from({ length: 6 }, (_, index) => { const angle = index * Math.PI / 3; return <circle key={index} cx={Math.cos(angle) * 47} cy={Math.sin(angle) * 20} r="7" fill={index < 2 ? '#d4ae66' : '#d8dfe0'} />; })}<path d="M0 0 V-48" stroke="#788d98" strokeWidth="8" /></g><path d="M394 172 Q430 115 412 52" fill="none" stroke="#708b99" strokeWidth="4" /><rect x="400" y="105" width="23" height="98" fill="#506b7a" /></g>}
    {stationId === 'FURN-04' && <g transform="translate(115 18)"><rect width="290" height="225" rx="8" fill="url(#metal)" stroke="#85939a" /><rect x="46" y="34" width="190" height="125" rx="5" fill={furnaceRecovered ? '#081511' : '#120c09'} stroke="#9ca7aa" strokeWidth="4" /><rect x="62" y="50" width="158" height="93" fill={furnaceRecovered ? '#17392e' : '#7a341b'} /><circle cx="141" cy="96" r="54" fill={furnaceRecovered ? '#51e19a' : '#f28f43'} opacity={furnaceRecovered ? '.2' : '.55'} /><rect x="57" y="180" width="115" height="24" fill="#07171d" /><path d="M67 196 H113" stroke="var(--mimic)" strokeWidth="3" /><path d="M250 55 V145" stroke={furnaceRecovered ? '#64d49f' : '#c0c8c9'} strokeWidth="7" /></g>}
    {stationId === 'ROBO-02' && <g transform="translate(80 10)"><path d="M30 230 H395" stroke="#7f642d" strokeWidth="5" /><path d="M30 15 V230 M395 15 V230 M30 65 H395 M30 180 H395" stroke="#9a772c" strokeWidth="5" opacity=".85" /><ellipse cx="195" cy="220" rx="70" ry="22" fill="#304457" /><path d="M195 210 L165 146 L245 94 L310 133" fill="none" stroke="#d8e0e2" strokeWidth="25" strokeLinecap="round" strokeLinejoin="round" /><g fill="#5e7180" stroke="#a8b6bc" strokeWidth="3"><circle cx="165" cy="146" r="18" /><circle cx="245" cy="94" r="18" /><circle cx="310" cy="133" r="16" /></g><circle cx="310" cy="133" r="7" fill="var(--mimic)" /><path d="M316 139 l22 16 m-25 -12 l8 26" stroke="#a8b6bc" strokeWidth="6" /></g>}
    {stationId === 'PREP-01' && <g transform="translate(80 25)"><rect x="20" width="275" height="190" fill="url(#metal)" stroke="#82929c" /><rect x="55" y="25" width="205" height="105" fill="#0c1c24" stroke="#547081" /><rect x="65" y="35" width="185" height="85" fill="#78a5b0" opacity=".12" />{[95, 130, 165].map((x, i) => <g key={x}><rect x={x} y="87" width="20" height="33" fill={['#d2b269', '#c77c62', '#8db8c3'][i]} /><rect x={x + 3} y="80" width="14" height="8" fill="#d3dcde" /></g>)}<rect x="325" y="95" width="100" height="86" rx="5" fill="#293d4e" /><rect x="342" y="111" width="66" height="28" fill="#07171d" /><path d="M350 128 H394" stroke="var(--mimic)" strokeWidth="3" /><ellipse cx="375" cy="77" rx="52" ry="10" fill="#bbc5c8" /></g>}
    <g transform="translate(18 18)"><circle r="5" fill="var(--mimic)" /><text x="12" y="4" fill="#8fa3b3" fontSize="10" fontFamily="monospace">LIVE / {stationId}</text></g>
  </svg>;
}
