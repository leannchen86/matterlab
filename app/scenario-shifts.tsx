'use client';

import { useEffect, useMemo, useState } from 'react';
import { DebriefVisual } from './debrief-visual';
import { CampaignControlModal } from './campaign-control';
import { useCampaignSnapshot } from './campaign-context';
import { campaignSpecs, evaluateCampaignMission, getCampaignIdentity, getCampaignOperations, getCampaignSpec } from './campaign-spec';
import { SystemsAtlasModal } from './systems-atlas';
import { LabViewport } from './lab-viewport';
import { MissionLabHeading, MissionTelemetry, PhysicalEvidenceCue, useModalFocusTrap } from './mission-ui';
import { baseStations, type Station } from './sim-data';
import { StationAccess } from './station-access';

export type ScenarioId = 'xrd' | 'bet' | 'furnace' | 'tga' | 'facility';
type Scores = { safety: number; traceability: number; integrity: number; uptime: number };
type LogItem = { time: string; type: string; text: string };
type Modal = 'deck' | 'guide' | 'campaign' | 'campaign-facility' | 'bench' | 'sample' | 'verify' | 'evidence' | 'complete' | null;
type Scenario = {
  id: 'bet' | 'furnace';
  label: string;
  title: string;
  summary: string;
  stationId: string;
  accent: string;
  handoff: [string, string, string][];
  tasks: { title: string; pending: string; done: string }[];
};

const scenarios: Record<'bet' | 'furnace', Scenario> = {
  bet: {
    id: 'bet', label: 'Surface area', title: 'Restart the BET analyzer',
    summary: 'Check a repaired analyzer, match the correct sample tube, and review a low reading.',
    stationId: 'BET-02', accent: '#b48cff',
    handoff: [['SERVICE', 'MX-233', 'pump replaced'], ['QUEUE', '4', 'samples waiting'], ['GAS', 'N₂', 'supply normal']],
    tasks: [
      { title: 'Check the analyzer', pending: 'Machine needs lab checks', done: 'Machine checks passed' },
      { title: 'Match the sample tube', pending: 'One label may be wrong', done: 'Tube matched' },
      { title: 'Run the surface-area test', pending: 'Waiting to start', done: '4 samples tested' },
      { title: 'Review the low reading', pending: 'QC material is below range', done: 'Repeat check assigned' },
    ],
  },
  furnace: {
    id: 'furnace', label: 'Workcell recovery', title: 'Recover an interrupted furnace run',
    summary: 'Save the stopped run, let the furnace cool, locate the sample, and prove the empty equipment is safe to restart.',
    stationId: 'FURN-04', accent: '#ff995f',
    handoff: [['ALARM', 'I-204', 'cycle interrupted'], ['CARRIER', 'BC-207', 'occupancy unknown'], ['CELL', 'HOLD', 'robot parked']],
    tasks: [
      { title: 'Save trace + cool the furnace', pending: 'Furnace stopped hot', done: 'Trace saved · cooled safely' },
      { title: 'Find the carrier', pending: 'Location uncertain', done: 'Carrier found' },
      { title: 'Run an empty safety test', pending: 'Waiting for dry run', done: 'Safety test passed' },
      { title: 'Review the incomplete result', pending: 'Heating cycle incomplete', done: 'Incomplete result held' },
    ],
  },
};

const deck = [
  { id: 'xrd' as const, title: 'The unexpected peak', station: 'XRD · ROBOT · MICROSCOPE', learn: 'Machine fault vs material evidence', icon: 'xrd' },
  { id: 'bet' as const, title: 'Restart the BET analyzer', station: 'GAS SORPTION', learn: 'Machine fault vs material change', icon: 'bet' },
  { id: 'furnace' as const, title: 'Recover an interrupted run', station: 'FURNACE · ROBOT', learn: 'Recovery without erased history', icon: 'furnace' },
  { id: 'tga' as const, title: 'Fix the empty-pan check', station: 'THERMAL ANALYZER', learn: 'Setup artifact vs material signal', icon: 'tga' },
  { id: 'facility' as const, title: 'Move material and verify gas', station: 'STORAGE · GAS · BET', learn: 'Identity and evidence across handoffs', icon: 'facility' },
];

const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function ShiftDeckModal({ active, onChoose, onExpert, onClose }: { active: ScenarioId; onChoose: (id: ScenarioId) => void; onExpert: () => void; onClose: () => void }) {
  const dialogRef = useModalFocusTrap();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop deck-backdrop" role="presentation"><section ref={dialogRef} className="modal-card wide deck-modal" role="dialog" aria-modal="true" aria-label="Choose a lab scenario"><header><div><p className="section-kicker">PRACTICE CASES</p><h2>What do you want to practice?</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header><div className="scenario-deck">{deck.map((item, index) => <button key={item.id} type="button" className={`scenario-card ${item.id === active ? 'active' : ''}`} onClick={() => onChoose(item.id)}><div className={`scenario-visual visual-${item.icon}`}><span>0{index + 1}</span><EquipmentGlyph type={item.icon} /><i>{item.station}</i></div><div className="scenario-copy"><h3>{item.title}</h3><small><b>PRACTICE</b>{item.learn}</small><footer><em>{item.id === active ? 'RESTART →' : 'START →'}</em></footer></div></button>)}</div><button className="deck-expert-link" type="button" onClick={onExpert}>OPEN EXPERT SANDBOX</button></section></div>;
}

function EquipmentGlyph({ type }: { type: string }) {
  if (type === 'xrd') return <div className="glyph glyph-xrd"><i /><i /><b /></div>;
  if (type === 'bet') return <div className="glyph glyph-bet"><i /><i /><i /><b /></div>;
  if (type === 'furnace') return <div className="glyph glyph-furnace"><i /><b /><span /></div>;
  if (type === 'tga') return <div className="glyph glyph-tga"><i /><i /><b /><span /></div>;
  return <div className="glyph glyph-facility"><i /><i /><b /><span /></div>;
}

export function PlannerPanel({ scenario, phase, campaignActive = false }: { scenario: ScenarioId; phase: number; campaignActive?: boolean }) {
  const campaign = useCampaignSnapshot();
  if (campaignActive && campaign.stage > 0 && scenario === 'xrd') {
    const spec = getCampaignSpec(campaign.selected);
    const observedSpec = campaign.resultMeasured ? { ...spec, measured: campaign.resultMeasured } : spec;
    const identity = getCampaignIdentity(campaign.runNumber);
    const operations = getCampaignOperations(campaign.runNumber, campaign.thermalBayLevel);
    const evaluation = evaluateCampaignMission(observedSpec, campaign.missionId, campaign.stage >= 7 ? campaign.resultElapsed : undefined);
    const cursor = campaign.stage === 8 ? 2 : campaign.stage >= 7 ? 3 : campaign.stage >= 6 ? 2 : 1;
    const status = campaign.stage >= 9 ? 'DIAGNOSIS LINKED · LEARNING' : campaign.stage === 8 ? 'SEM / EDS FOLLOW-UP' : campaign.stage >= 7 ? campaign.confirmationSource ? evaluation.met ? 'REPEAT PASS · ROBUST' : 'REPEAT FAILED · LEARNING' : evaluation.met ? 'MISSION MET · LEARNING' : 'VALID MISS · LEARNING' : campaign.stage >= 6 ? 'MEASUREMENT GATE' : 'LAB EXECUTION';
    const request = campaign.stage >= 9 ? `Assimilate diagnosis · ${identity.runId}` : campaign.stage === 8 ? `Explain valid negative · ${identity.runId}` : campaign.stage >= 7 ? campaign.confirmationSource ? `Compare repeats · ${campaign.confirmationSource.measured}% → ${campaign.resultMeasured}%` : `Assimilate ${identity.runId} · ${evaluation.resultText}` : `Execute ${spec.id} · ${spec.formula}`;
    const gate = campaign.stage === 2
      ? operations.robotCondition === 'grip-force' ? 'Jaw-force witness required' : operations.robotCondition === 'contamination' ? 'Gripper cleanliness witness' : 'Tool identity + carrier handshake'
      : campaign.stage === 4 ? campaign.thermalBayLevel >= 2 ? 'FURN-04B start-readiness proof' : 'Capacity-one furnace queue'
        : campaign.stage === 6 ? operations.referenceCondition === 'age-due' ? 'Overdue NIST SRM 640f QC check' : operations.referenceCondition === 'trend-review' ? 'Silicon QC trend confirmation' : 'Current silicon QC review'
          : campaign.stage === 8 ? 'Four preplanned BSE fields + one EDS map' : campaign.stage >= 9 ? `${spec.id === 'D-08' ? 'Ti-rich cores' : 'Ca-rich grains'} · hypothesis linked` : campaign.stage >= 7 ? campaign.confirmationSource ? `${Math.abs(Number(campaign.resultMeasured) - Number(campaign.confirmationSource.measured)).toFixed(1)} pp replicate spread · ${evaluation.met ? 'boundary repeated' : 'margin lost'}` : `${evaluation.gap} mission gap · qualified result` : `${identity.runId} physical evidence`;
    const next = campaign.stage >= 9 ? 'Archive evidence + propose next candidate' : campaign.stage === 8 ? 'Measure the preplanned microscope locations' : campaign.stage >= 7 ? campaign.confirmationSource && !evaluation.met ? 'Reopen design or diagnose mechanism' : 'Archive result + propose next candidate' : campaign.stage >= 6 ? 'Acquire qualified diffraction pattern' : 'Advance governed material route';
    return <section className="rail-section planner-panel campaign-planner"><div className="section-title-row"><p className="section-kicker">AI EXPERIMENT LOOP</p><span className={campaign.stage >= 7 ? 'held' : campaign.stage >= 6 ? 'review' : ''}>{status}</span></div><div className="planner-loop">{['PLAN', 'EXECUTE', 'MEASURE', 'LEARN'].map((label, index) => <div key={label} className={index < cursor ? 'passed' : index === cursor ? 'current' : ''}><i>{index < cursor ? '✓' : `0${index + 1}`}</i><span>{label}</span></div>)}</div><div className="design-space campaign-mini-space" style={{ '--design-accent': '#4dd5ed' } as React.CSSProperties}><div className="design-space-head"><span>CAMPAIGN SPACE</span><b>{identity.runId} · {spec.id}</b></div><svg viewBox="0 0 100 74" role="img" aria-label={`${spec.id} in the campaign composition and temperature design space`}><path className="space-contour" d="M10 59 C24 25, 50 14, 90 31 M8 68 C34 43, 64 32, 94 18" />{campaignSpecs.map((candidate) => <g key={candidate.id} className={candidate.id === spec.id ? 'proposal-point' : 'measured-point'} transform={`translate(${candidate.point[0] / 3.2} ${candidate.point[1] / 2.43})`}><circle r={candidate.id === spec.id ? 5.2 : 2.2} />{candidate.id === spec.id && <path d="M-3 0H3M0-3V3" />}</g>)}<text x="6" y="70">Ca-rich</text><text x="76" y="70">Ti-rich</text></svg></div><div className="planner-request"><span>MODEL / RUN REQUEST</span><b>{request}</b></div><div className="planner-gate"><i>{campaign.stage >= 7 ? 'MODEL GATE' : 'TECH GATE'}</i><div><b>{gate}</b><span>Next: {next}</span></div></div></section>;
  }
  const states = {
    xrd: {
      request: 'Increase dwell · 4 h → 6 h', gate: 'Unresolved 36.1° reflection', next: 'SEM/EDS follow-up',
      status: phase >= 5 ? 'HOLD + INVESTIGATE' : phase >= 4 ? 'TECH REVIEW' : 'WAITING ON LAB',
    },
    bet: {
      request: 'Lower calcination · −35 °C', gate: 'Low QC-material result', next: 'Repeat QC check',
      status: phase >= 5 ? 'PROPOSAL HELD' : phase >= 4 ? 'TECH REVIEW' : 'WAITING ON LAB',
    },
    furnace: {
      request: 'Ingest run HT-44-207', gate: 'Interrupted thermal history', next: 'Replacement run',
      status: phase >= 5 ? 'EXCLUDED · CENSORED' : phase >= 4 ? 'ELIGIBILITY REVIEW' : 'WAITING ON LAB',
    },
    tga: {
      request: 'Lower calcination · −25 °C', gate: 'Purge-coupled mass step', next: 'Matched-pan repeat',
      status: phase >= 5 ? 'PROPOSAL HELD' : phase >= 4 ? 'TECH REVIEW' : 'WAITING ON LAB',
    },
    facility: {
      request: 'Ingest BET batch · GAS-41', gate: phase >= 5 ? 'Transition runs excluded' : 'Gas identity + service transition', next: phase >= 5 ? 'Post-proof batch ingestion' : 'Post-changeover control',
      status: phase >= 5 ? 'TRANSITION DATA HELD' : phase >= 4 ? 'ELIGIBILITY REVIEW' : 'WAITING ON LAB',
    },
  }[scenario];
  const cursor = phase >= 5 ? 3 : phase >= 4 ? 2 : phase >= 2 ? 1 : 0;
  return <section className="rail-section planner-panel"><div className="section-title-row"><p className="section-kicker">AI EXPERIMENT LOOP</p><span className={phase >= 5 ? 'held' : phase >= 4 ? 'review' : ''}>{states.status}</span></div><div className="planner-loop">{['PLAN', 'EXECUTE', 'MEASURE', 'LEARN'].map((label, index) => <div key={label} className={index < cursor ? 'passed' : index === cursor ? 'current' : ''}><i>{index < cursor ? '✓' : `0${index + 1}`}</i><span>{label}</span></div>)}</div><DesignSpace scenario={scenario} phase={phase} /><div className="planner-request"><span>MODEL REQUEST</span><b>{states.request}</b></div><div className="planner-gate"><i>TECH GATE</i><div><b>{states.gate}</b><span>Next: {states.next}</span></div></div></section>;
}

function DesignSpace({ scenario, phase }: { scenario: ScenarioId; phase: number }) {
  const config = {
    xrd: { x: 'DWELL', y: 'COMPOSITION', accent: '#4dd5ed', proposal: [78, 28], points: [[18, 72], [31, 58], [45, 67], [58, 43], [69, 55], [84, 35]] },
    bet: { x: 'CALCINATION', y: 'SURFACE AREA', accent: '#b48cff', proposal: [35, 69], points: [[16, 42], [28, 51], [43, 62], [58, 58], [70, 39], [82, 28]] },
    furnace: { x: 'THERMAL DOSE', y: 'PHASE SCORE', accent: '#ff995f', proposal: [72, 34], points: [[14, 76], [29, 66], [42, 54], [56, 45], [69, 38], [84, 29]] },
    tga: { x: 'PEAK TEMP', y: 'MASS RETENTION', accent: '#e2a64f', proposal: [64, 38], points: [[14, 68], [28, 61], [43, 53], [57, 47], [72, 41], [86, 34]] },
    facility: { x: 'SERVICE STATE', y: 'CONTROL RESPONSE', accent: '#68d4ad', proposal: [70, 33], points: [[15, 70], [28, 62], [42, 55], [57, 48], [72, 37], [86, 31]] },
  }[scenario];
  const visible = Math.min(config.points.length, 2 + Math.floor(phase / 2));
  const gated = phase >= 4;
  return <div className={`design-space ${gated ? 'gated' : ''}`} style={{ '--design-accent': config.accent } as React.CSSProperties}>
    <div className="design-space-head"><span>EXPERIMENT SPACE</span><b>{gated ? 'EVIDENCE GATE' : 'MODEL PROPOSAL'}</b></div>
    <svg viewBox="0 0 100 74" role="img" aria-label={`${config.x} by ${config.y} experiment design space with ${visible} measured points and one proposed point`}>
      <defs><radialGradient id={`field-${scenario}`}><stop offset="0" stopColor={config.accent} stopOpacity=".28" /><stop offset="1" stopColor={config.accent} stopOpacity="0" /></radialGradient></defs>
      <path className="space-contour" d="M10 55 C22 25, 47 18, 91 30 M7 66 C34 38, 61 36, 94 15 M18 70 C44 54, 69 50, 94 46" />
      <ellipse cx={config.proposal[0]} cy={config.proposal[1]} rx="22" ry="18" fill={`url(#field-${scenario})`} />
      {config.points.slice(0, visible).map(([x, y], index) => <g key={`${x}-${y}`} className="measured-point"><circle cx={x} cy={y} r="2.2" /><text x={x + 3.5} y={y + 1.8}>{String(index + 1).padStart(2, '0')}</text></g>)}
      <g className="proposal-point" transform={`translate(${config.proposal[0]} ${config.proposal[1]})`}><circle r="5.2" /><path d="M-3 0H3M0-3V3" />{gated && <path className="gate-slash" d="M-5 5L5-5" />}</g>
      <text className="axis-label axis-y-label" x="4" y="9">{config.y}</text>
      <text className="axis-label axis-x-label" x="96" y="71" textAnchor="end">{config.x}</text>
    </svg>
    <div className="design-legend"><span><i className="measured" />MEASURED</span><span><i className="proposed" />PROPOSED</span><em>{gated ? 'HOLD' : 'UNCERTAINTY ↓'}</em></div>
  </div>;
}

export function AlternateShift({ scenarioId, onSwitch }: { scenarioId: 'bet' | 'furnace'; onSwitch: (id: ScenarioId) => void }) {
  const scenario = scenarios[scenarioId];
  const [phase, setPhase] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedId, setSelectedId] = useState(scenario.stationId);
  const [minute, setMinute] = useState(scenarioId === 'bet' ? 10 * 60 + 47 : 13 * 60 + 18);
  const [log, setLog] = useState<LogItem[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [ran, setRan] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [scores, setScores] = useState<Scores>({ safety: 100, traceability: 100, integrity: 100, uptime: 100 });
  const [physicalInspections, setPhysicalInspections] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const openCampaign = (event: Event) => setModal((event as CustomEvent<{ view?: string }>).detail?.view === 'facility' ? 'campaign-facility' : 'campaign');
    window.addEventListener('mattershift:open-campaign', openCampaign);
    return () => window.removeEventListener('mattershift:open-campaign', openCampaign);
  }, []);

  useEffect(() => {
    const retainStationEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; text?: string }>).detail;
      const text = detail?.text;
      if (!text) return;
      const next = minute + 1;
      setMinute(next);
      setLog((items) => [...items, { time: formatTime(next), type: detail.type ?? 'control', text }]);
    };
    window.addEventListener('mattershift:station-event', retainStationEvent);
    return () => window.removeEventListener('mattershift:station-event', retainStationEvent);
  }, [minute]);

  const stations = useMemo(() => baseStations.map((station): Station => {
    if (scenarioId === 'bet' && station.id === 'BET-02') {
      if (phase === 0) return station;
      if (phase < 3) return { ...station, state: 'READY', tone: 'ready', meta: phase === 1 ? 'Machine check complete · ports ready' : 'Sample record check', technicianView: ['Analysis ports: available', 'No-sample + leak checks: passed', `Tube ADS-77-C: ${phase >= 2 ? 'matched' : 'testing blocked'}`, 'N₂ supply: normal'] };
      return phase === 3
        ? { ...station, state: 'ANALYZING', tone: 'run', meta: 'Surface-area test running', technicianView: ['Tubes complete: 2 / 4', 'Current step: nitrogen adsorption', 'Results: hidden until complete'] }
        : { ...station, state: 'REVIEW', tone: 'warn', meta: 'Reference material read low', technicianView: ['Reference material: known', 'Result: low', 'Next step: repeat the check'] };
    }
    if (scenarioId === 'furnace' && station.id === 'FURN-04') {
      if (phase === 0) return { ...station, state: 'ALARM HOLD', tone: 'warn', meta: 'Program stopped while hot', technicianView: ['Program: interrupted', 'Furnace: hot', 'Door interlock: active', 'Carrier: unresolved'] };
      if (phase < 3) return { ...station, state: 'SERVICE HOLD', tone: 'hold', meta: phase === 1 ? 'Cooled safely · load location unknown' : 'Empty-cell verification pending', technicianView: phase === 1 ? ['Program trace: retained', 'Furnace: 68 °C', 'Door: safe-access threshold met', 'Carrier: location unresolved'] : ['Program trace: retained', 'Carrier: quarantined', 'Chamber occupancy: empty', 'Recovery: ready for dry test'] };
      return { ...station, state: 'READY', tone: 'ready', meta: 'Empty-cell verification passed', technicianView: ['Program: HT-44 rev 7', 'Interlocks: verified', 'Controller trace: nominal', 'Next load: awaiting release'] };
    }
    if (scenarioId === 'furnace' && station.id === 'ROBO-02') return { ...station, state: phase < 2 ? 'RECOVERY HOLD' : 'READY', tone: phase < 2 ? 'warn' : 'ready', meta: phase < 2 ? 'Carrier location unknown' : 'Carrier state reconciled', technicianView: ['Safety zone: clear', 'Robot: parked', `Carrier: ${phase < 2 ? 'unresolved' : 'set aside'}`, 'Recovery mode: supervised'] };
    return station;
  }), [phase, scenarioId]);

  const selectedBase = stations.find((station) => station.id === selectedId) ?? stations[0];
  const selected = selectedBase;
  const completed = phase >= 5 ? 4 : phase <= 2 ? phase : 3;
  const progress = Math.round((completed / 4) * 100);
  const appendLog = (type: string, text: string, add = 0) => {
    const next = minute + add; setMinute(next); setLog((items) => [...items, { time: formatTime(next), type, text }]);
  };
  const recordInspection = (stationId: string, inspectionChecks: string[]) => {
    const wasComplete = (physicalInspections[stationId]?.length ?? 0) === 3;
    setPhysicalInspections((current) => ({ ...current, [stationId]: inspectionChecks }));
    if (!wasComplete && inspectionChecks.length === 3) appendLog('inspection', `${stationId} physical walkaround completed; ${inspectionChecks.join(', ')} linked to the local-console evidence gate.`, 1);
  };
  const penalize = (key: keyof Scores, amount: number) => setScores((value) => ({ ...value, [key]: Math.max(0, value[key] - amount) }));
  const reward = (updates: Partial<Scores>) => setScores((value) => ({ safety: Math.min(value.safety, updates.safety ?? value.safety), traceability: Math.min(value.traceability, updates.traceability ?? value.traceability), integrity: Math.min(value.integrity, updates.integrity ?? value.integrity), uptime: Math.min(value.uptime, updates.uptime ?? value.uptime) }));
  const open = (next: Modal, station = scenario.stationId) => { setFeedback(''); setChecks({}); setRan(false); setScanned(false); setSelectedId(station); setModal(next); };

  const finishBench = (correct: boolean) => {
    if (!correct) {
      penalize(scenarioId === 'bet' ? 'integrity' : 'safety', 16);
      setFeedback(scenarioId === 'bet' ? 'Vendor completion is not laboratory acceptance evidence. The analyzer still needs an independent readiness check.' : 'Resuming at the interrupted step would erase the thermal-history exception and expose an unresolved carrier state.');
      appendLog('exception', scenarioId === 'bet' ? 'Attempted service release based only on vendor completion; release blocked.' : 'Attempted program resume without controlled interruption disposition; action blocked.', 2);
      return;
    }
    setPhase(1); reward(scenarioId === 'bet' ? { integrity: scores.integrity + 10, uptime: scores.uptime + 10 } : { safety: scores.safety + 4, integrity: scores.integrity + 9 });
    appendLog('decision', scenarioId === 'bet' ? 'The BET analyzer passed independent no-sample and leak checks.' : 'The interrupted trace was saved and the furnace cooled with the door interlocked.', 2);
    window.setTimeout(() => setModal(null), 600);
  };

  const finishSample = (correct: boolean) => {
    if (!correct) {
      penalize('traceability', 18); setFeedback(scenarioId === 'bet' ? 'Copying the adjacent tube record would create a plausible but false pretreatment history.' : 'Robot telemetry alone cannot prove physical occupancy after an interrupted handoff.');
      appendLog('exception', scenarioId === 'bet' ? 'Adjacent degas record selected as substitute; association blocked.' : 'Carrier occupancy inferred from telemetry without physical reconciliation; release blocked.', 2); return;
    }
    setPhase(2); reward({ traceability: scores.traceability + 15, integrity: scores.integrity + 5 });
    appendLog('lineage', scenarioId === 'bet' ? 'Tube C was held until its own preparation record was linked.' : 'The physical carrier was found, set aside, and reconciled with the computer record.', 2);
    window.setTimeout(() => setModal(null), 650);
  };

  const releaseRun = () => {
    setPhase(3); setSelectedId(scenario.stationId); reward({ uptime: scores.uptime + 5 });
    appendLog('transfer', scenarioId === 'bet' ? 'Four ready tubes released to BET-02; the corrected tube record was included.' : 'Empty safety test completed. The furnace and robot returned to ready.', scenarioId === 'bet' ? 5 : 16);
  };
  const runRecoveryVerification = () => {
    setFeedback(''); setRan(true);
    appendLog('verification', 'Empty-cell recovery cycle acquired with chamber occupancy, access circuit, furnace controller, and robot handshake channels retained.', 16);
  };
  const finishRecoveryVerification = (correct: boolean) => {
    if (!correct) {
      penalize('safety', 15); setFeedback('Alarm acknowledgement clears a message, not the workcell boundary. Coordinated empty-cell evidence is still required.');
      appendLog('exception', 'Furnace recovery release attempted from alarm acknowledgement without coordinated empty-cell verification; release blocked.', 2); return;
    }
    setPhase(3); setSelectedId(scenario.stationId); reward({ safety: scores.safety + 4, uptime: scores.uptime + 5 });
    appendLog('verification', 'Empty-cell cycle passed: access circuit closed, chamber empty, controller trace nominal, and robot handshake returned ready.', 2);
    setFeedback(''); setModal(null);
  };
  const advance = () => { setPhase(4); setFeedback(''); appendLog('result', scenarioId === 'bet' ? 'Adsorption run complete. The full curve, sample mass, and preparation record were linked.' : 'Recovery record assembled. The interrupted run is still waiting for a reuse decision.', scenarioId === 'bet' ? 64 : 1); setModal('evidence'); };
  const finishEvidence = (correct: boolean) => {
    if (!correct) { penalize('integrity', 17); setFeedback(scenarioId === 'bet' ? 'The suggestion blames the material before the low QC-material result is checked.' : 'The interrupted specimen did not complete the same heating cycle, so it should not be used for predictions.'); appendLog('exception', scenarioId === 'bet' ? 'A material change was suggested before the low QC result was reviewed. The decision was blocked.' : 'The interrupted result was offered to the prediction model without a warning label. The export was blocked.', 3); return; }
    setPhase(5); reward({ integrity: scores.integrity + 12, traceability: scores.traceability + 5 }); appendLog('decision', scenarioId === 'bet' ? 'Low QC-material result sent for a repeat check. Material changes remain paused until the measurement is trustworthy.' : 'Interrupted result labeled and excluded from predictions. A replacement run was queued.', 5); setModal('complete'); setFeedback('');
  };

  const releaseAction = scenarioId === 'furnace' ? () => open('verify', 'FURN-04') : releaseRun;
  const state = getActionState(scenarioId, phase, () => open('bench'), () => open('sample', scenarioId === 'furnace' ? 'ROBO-02' : 'BET-02'), releaseAction, advance, () => setModal('evidence'), () => setModal('complete'));

  return <main className={`shell scenario-shell scenario-${scenarioId}`} style={{ '--scenario-accent': scenario.accent } as React.CSSProperties}>
    <header className="topbar"><div className="brand-block"><span className="brand-mark" aria-hidden="true"><b>M</b><i>L</i></span><h1 className="brand-name">MatterLab</h1></div><div className="header-actions"><button className="campaign-button" type="button" aria-label="Open optional expert campaign sandbox" onClick={() => setModal('campaign')}>EXPERT SANDBOX</button><button className="deck-button" type="button" onClick={() => setModal('deck')}>SCENARIOS <span>5</span></button><button type="button" onClick={() => setModal('guide')}>HELP</button><button type="button" onClick={() => setLogOpen(true)}>EVIDENCE LOG</button></div></header>
    <div className="workspace"><aside className="left-rail"><section className="rail-section shift-card"><p className="section-kicker">CURRENT MISSION</p><h2>{scenario.title}</h2><p>{scenario.summary}</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-meta"><span>{completed} / 4 tasks</span><span>{progress}%</span></div><MissionTelemetry blockedAttempts={log.filter((event) => event.type === 'exception').length} evidenceCount={log.length} /></section><section className="rail-section"><p className="section-kicker">MISSION STEPS</p><ol className="task-list">{scenario.tasks.map((task, index) => { const done = index === 3 ? phase >= 5 : phase > index; const active = !done && (index === phase || (index === 3 && (phase === 3 || phase === 4))); const actions = [() => open('bench'), () => open('sample', scenarioId === 'furnace' ? 'ROBO-02' : 'BET-02'), releaseAction, () => phase === 3 ? advance() : setModal('evidence')]; return <Task key={task.title} number={`0${index + 1}`} title={task.title} note={done ? task.done : task.pending} status={done ? 'done' : active ? 'active' : 'pending'} onClick={active ? actions[index] : undefined} />; })}</ol></section></aside>
      <section className="lab-view"><MissionLabHeading objective={state.title} stationId={selected.id} stationState={selected.state} stationTone={selected.tone} /><LabViewport stations={stations} selectedId={selectedId} phase={phase} scenarioId={scenarioId} inspectionState={physicalInspections} onInspectionChange={recordInspection} onSelect={setSelectedId} /></section>
      <aside className="right-rail"><section className={`rail-section alert-card tone-${state.tone}`}><div className="alert-head"><span>{state.tag}</span><b>{phase >= 5 ? 'CLOSED' : phase === 4 ? 'REVIEW' : 'ACTIVE'}</b></div><h2>{state.title}</h2><div className="metric-row"><span>Current state</span><strong>{state.metric}</strong></div><p>{state.body}</p><button className="primary-action" type="button" onClick={state.fn}>{state.action}<span>→</span></button></section><PhysicalEvidenceCue stationId={selected.id} checks={physicalInspections[selected.id] ?? []} /><section className="rail-section station-inspector"><div className="section-title-row"><p className="section-kicker">SELECTED EQUIPMENT</p><span className={selected.tone}>{selected.state}</span></div><div className="station-identity"><b>{selected.id}</b><h2>{selected.name}</h2></div><p>{selected.purpose}</p><StationAccess station={selected} scenarioId={scenarioId} physicalChecks={physicalInspections[selected.id] ?? []} /></section><section className="rail-section lineage-card"><div className="section-title-row"><p className="section-kicker">EVIDENCE CHAIN</p><span>SIM</span></div><div className="lineage-flow"><span>{scenarioId === 'bet' ? 'LOT-77' : 'LOT-112'}</span><i>→</i><span>{scenarioId === 'bet' ? 'ADS-77-C' : 'BC-207'}</span><i>→</i><span>{scenarioId === 'bet' ? (phase >= 2 ? 'READY' : 'HOLD') : (phase >= 5 ? 'EXCLUDE' : 'HOLD')}</span></div><p>{scenarioId === 'bet' ? (phase >= 2 ? 'Tube identity and preparation record agree.' : 'The tube record needs review.') : (phase >= 5 ? 'The interrupted result is saved but excluded from predictions.' : phase >= 2 ? 'The interrupted load is set aside with its record saved.' : 'The furnace contents still need to be checked.')}</p></section></aside></div>
    {modal === 'deck' && <ShiftDeckModal active={scenarioId} onChoose={onSwitch} onExpert={() => setModal('campaign')} onClose={() => setModal(null)} />}
    {modal === 'guide' && <SystemsAtlasModal onClose={() => setModal(null)} />}
    {(modal === 'campaign' || modal === 'campaign-facility') && <CampaignControlModal autoOpenFacility={modal === 'campaign-facility'} onClose={() => setModal(null)} />}
    {modal === 'bench' && <BenchModal scenarioId={scenarioId} physicalChecks={physicalInspections[scenario.stationId] ?? []} ran={ran} setRan={setRan} clearFeedback={() => setFeedback('')} feedback={feedback} appendLog={appendLog} onFinish={finishBench} onClose={() => setModal(null)} />}
    {modal === 'sample' && <SampleModal scenarioId={scenarioId} scanned={scanned} setScanned={setScanned} feedback={feedback} appendLog={appendLog} onFinish={finishSample} onClose={() => setModal(null)} />}
    {modal === 'verify' && <RecoveryVerificationModal checks={checks} setChecks={setChecks} ran={ran} onRun={runRecoveryVerification} feedback={feedback} onFinish={finishRecoveryVerification} onClose={() => setModal(null)} />}
    {modal === 'evidence' && <ScenarioEvidenceModal scenarioId={scenarioId} feedback={feedback} onFinish={finishEvidence} onClose={() => setModal(null)} />}
    {modal === 'complete' && <ScenarioCompleteModal scenarioId={scenarioId} scores={scores} elapsedMinutes={minute - (scenarioId === 'bet' ? 10 * 60 + 47 : 13 * 60 + 18)} logCount={log.length} exceptionCount={log.filter((event) => event.type === 'exception').length} onDeck={() => setModal('deck')} onClose={() => setModal(null)} />}
    {logOpen && <LedgerDrawer log={log} onClose={() => setLogOpen(false)} />}
  </main>;
}

function getActionState(id: 'bet' | 'furnace', phase: number, bench: () => void, sample: () => void, release: () => void, advance: () => void, evidence: () => void, complete: () => void) {
  const bet = [
    ['NEXT STEP', 'Check the repaired BET analyzer', 'A repair ticket is not enough. Run the lab checks before using the machine.', 'Needs checks', 'CHECK THE ANALYZER', bench, 'warn'],
    ['NEXT STEP', 'One sample tube does not match', 'Compare the tube label with the preparation rack and find the mismatch.', '1 mismatch', 'CHECK THE TUBE', sample, 'warn'],
    ['NEXT STEP', 'The analyzer is ready', 'The machine and sample records now agree.', '4 tubes', 'START TEST', release, 'ready'],
    ['IN PROGRESS', 'The BET test is running', 'Finish the acquisition to inspect the result.', 'Running', 'COMPLETE TEST', advance, 'run'],
    ['NEXT STEP', 'The QC-material reading is low', 'Check the curve before blaming the material or changing the recipe.', 'Below range', 'REVIEW THE RESULT', evidence, 'warn'],
    ['MISSION COMPLETE', 'A repeat check is queued', 'You avoided making a material change from an uncertain machine reading.', '4 / 4', 'VIEW SUMMARY', complete, 'ready'],
  ];
  const furnace = [
    ['NEXT STEP', 'The furnace stopped mid-run', 'Save the alarm trace, keep the door locked, and let the furnace cool before checking the load.', 'Stopped hot', 'START SAFE RECOVERY', bench, 'warn'],
    ['NEXT STEP', 'Find the sample carrier', 'The furnace is cool enough for the approved access check. Confirm where the carrier actually is.', 'Location unknown', 'CHECK THE WORKCELL', sample, 'warn'],
    ['NEXT STEP', 'Test the empty equipment', 'Run a dry cycle before putting another sample at risk.', 'No sample loaded', 'RUN THE SAFETY TEST', release, 'ready'],
    ['NEXT STEP', 'The equipment is working again', 'Now decide whether the interrupted result can be reused.', 'Checks passed', 'REVIEW OLD RUN', advance, 'ready'],
    ['NEXT STEP', 'Can the old result be reused?', 'The furnace stopped early. Compare the planned and actual heating histories before deciding.', '1 interrupted run', 'REVIEW THE RESULT', evidence, 'warn'],
    ['MISSION COMPLETE', 'The furnace and robot are ready', 'The interrupted run remains visible but will not mislead future experiments.', '4 / 4', 'VIEW SUMMARY', complete, 'ready'],
  ];
  const raw = (id === 'bet' ? bet : furnace)[phase] ?? (id === 'bet' ? bet : furnace)[5];
  return { tag: raw[0] as string, title: raw[1] as string, body: raw[2] as string, metric: raw[3] as string, action: raw[4] as string, fn: raw[5] as () => void, tone: raw[6] as string };
}

function ModalShell({ title, kicker, children, onClose, wide = true }: { title: string; kicker: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const dialogRef = useModalFocusTrap();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation"><section ref={dialogRef} className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</section></div>;
}

function BenchModal({ scenarioId, physicalChecks, ran, setRan, clearFeedback, feedback, appendLog, onFinish, onClose }: { scenarioId: 'bet' | 'furnace'; physicalChecks: string[]; ran: boolean; setRan: (value: boolean) => void; clearFeedback: () => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const isBet = scenarioId === 'bet';
  const items = isBet ? [
    ['scope', 'Match the repair work', 'The pump replacement, cleaning record, and software changes all belong to BET-02.', 'VACUUM'],
    ['utilities', 'Check the nitrogen supply', 'The nitrogen label and stable regulator state agree.', 'N₂'],
    ['blank', 'Check the sample ports', 'Closed ports establish the boundary for a no-sample run and leak test.', 'PORTS'],
  ] : [
    ['trace', 'Save the interrupted temperature trace', 'Keep the full program, alarm, and exact stop time.', 'CONTROLLER'],
    ['cool', 'Keep the furnace closed while it cools', 'Do not open a hot chamber to recover the sample quickly.', 'CHAMBER'],
    ['cell', 'Control access to the stopped cell', 'The workcell stays guarded while the alarm state is saved.', 'INTERLOCK'],
  ];
  const run = () => { clearFeedback(); setRan(true); appendLog('qc', isBet ? 'A no-sample run and leak test passed on the BET analyzer.' : 'Interrupted trace package frozen; guarded controlled cooling started with the furnace door interlocked.', isBet ? 12 : 95); };
  return <ModalShell title={isBet ? 'Check the repaired analyzer' : 'Secure the interrupted run'} kicker={isBet ? 'STEP 1 · MACHINE CHECK' : 'STEP 1 · INTERRUPTION CHECK'} onClose={onClose}><div className="modal-grid scenario-bench-grid"><div><p className="modal-intro">{isBet ? 'The repair note says complete. Prove it with a no-sample run and leak test.' : 'The furnace stopped at 742 °C. Preserve the stopped state and cool the closed chamber before anyone checks the sample.'}</p><div className="evidence-brief">{items.map(([key, title, note, hotspot]) => { const observed = physicalChecks.includes(hotspot); return <article key={key} className={observed ? 'observed' : ''} aria-label={`${title}; ${observed ? 'observed in the 3D walkaround' : 'not yet observed in the 3D walkaround'}`}><i>{observed ? '✓' : '•'}</i><div><b>{title}</b><small>{isBet ? (observed ? 'Observed in 3D' : 'Not inspected') : note}</small></div></article>; })}</div><button className="modal-run" type="button" disabled={ran} onClick={run}>{ran ? (isBet ? 'MACHINE CHECK PASSED' : 'TRACE SAVED · FURNACE COOLED') : isBet ? 'RUN MACHINE CHECK' : 'SAVE TRACE + CONTROLLED COOL'}</button>{!ran && <button className="blank-release-shortcut" type="button" onClick={() => onFinish(false)}>{isBet ? 'Trust the repair note without testing' : 'Resume the stored program without checking'}</button>}</div><div className={`instrument-console ${isBet ? 'vacuum-console' : 'thermal-console'}`}><div className="panel-heading"><span>{isBet ? 'BET STATUS' : 'TEMPERATURE VS TIME'}</span><b>{isBet ? 'AFTER REPAIR' : 'INTERRUPTED RUN'}</b></div>{!isBet && <ThermalTrace ran={ran} />}<div className="result-box"><span>{isBet ? 'REPAIR NOTE' : 'ALARM'}</span><b>{isBet ? 'COMPLETE' : 'TRIGGERED'}</b><span>{isBet ? 'MACHINE CHECK' : 'FURNACE'}</span><b>{ran ? (isBet ? 'PASSED' : 'COOLED') : 'NOT RUN'}</b></div>{ran && <div className="decision-stack"><p className="mini-label">CHOOSE THE NEXT STATE</p><button type="button" onClick={() => onFinish(true)}>{isBet ? 'Allow sample testing' : 'Keep the trace and inspect the cooled workcell'}</button><button type="button" className="secondary" onClick={() => onFinish(false)}>{isBet ? 'Rely on the repair note only' : 'Resume the interrupted sample'}</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function ThermalTrace({ ran }: { ran: boolean }) { return <div className="thermal-trace" aria-label="Interrupted furnace trace"><i className="thermal-fill" /><span className="alarm-pin">STOPPED<br />HOT</span><b className="trace-label">PLANNED</b><b className="trace-label actual">ACTUAL</b>{ran && <em>TRACE SAVED</em>}</div>; }

function SampleModal({ scenarioId, scanned, setScanned, feedback, appendLog, onFinish, onClose }: { scenarioId: 'bet' | 'furnace'; scanned: boolean; setScanned: (value: boolean) => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const isBet = scenarioId === 'bet';
  const scan = () => { setScanned(true); appendLog('lineage', isBet ? 'Physical tube C does not match preparation record B.' : 'The carrier is still inside although the computer says the transfer finished.', 4); };
  return <ModalShell title={isBet ? 'Match the sample tube' : 'Find the sample carrier'} kicker="STEP 2 · PHYSICAL CHECK" onClose={onClose}><p className="modal-intro">{isBet ? 'The physical tube must match its own preparation record before the test.' : 'The furnace is cool. Compare what is physically inside with the computer record.'}</p><div className="record-compare"><article><span>WHAT YOU SEE</span><EquipmentGlyph type={isBet ? 'bet' : 'furnace'} /><b>{isBet ? 'TUBE C' : 'FURNACE'}</b><p>{scanned ? (isBet ? 'Tube C is loaded' : 'Carrier is still inside') : 'Not checked'}</p></article><i>≠</i><article className={scanned ? 'mismatch-record' : ''}><span>COMPUTER RECORD</span><div className="record-code">{scanned ? (isBet ? 'TUBE B' : 'TRANSFER COMPLETE') : 'NOT READ'}</div><p>{isBet ? 'Preparation record B' : 'Destination acknowledged'}</p></article></div>{!scanned ? <button className="modal-run" type="button" onClick={scan}>{isBet ? 'CHECK TUBE + RECORD' : 'CHECK THE COOLED CELL'}</button> : <div className="decision-stack horizontal record-actions"><button type="button" onClick={() => onFinish(true)}>{isBet ? 'Set tube C aside' : 'Set the carrier aside and correct the record'}</button><button type="button" className="secondary" onClick={() => onFinish(false)}>{isBet ? 'Copy tube B’s record' : 'Trust the computer and clear the cell'}</button></div>}{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function RecoveryVerificationModal({ setChecks, ran, onRun, feedback, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; ran: boolean; onRun: () => void; feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [
    ['boundary', 'Keep the sample outside the moving cell', 'The carrier is set aside and the furnace is empty.'],
    ['safety', 'Check guards and safety circuits', 'The door, fence, emergency stop, and reset signals agree.'],
    ['records', 'Save the recovery record', 'The alarm, temperature trace, and restart command stay linked.'],
  ];
  const run = () => { setChecks({ boundary: true, safety: true, records: true }); onRun(); };
  return <ModalShell title="Run an empty safety test" kicker="STEP 3 · RECOVERY TEST" onClose={onClose}><div className="modal-grid scenario-bench-grid"><div><p className="modal-intro">Before loading another sample, test the furnace and robot together while the cell is empty.</p><div className="evidence-brief">{items.map(([key, title, note]) => <article key={key}><i>•</i><div><b>{title}</b><small>{note}</small></div></article>)}</div><button className="modal-run" type="button" disabled={ran} onClick={run}>{ran ? 'EMPTY-CELL TEST PASSED' : 'RUN EMPTY SAFETY TEST'}</button>{!ran && <button className="blank-release-shortcut" type="button" onClick={() => onFinish(false)}>Skip because the alarm is cleared</button>}</div><div className="instrument-console recovery-console"><div className="panel-heading"><span>FURNACE + ROBOT TEST</span><b>EMPTY CELL</b></div><RecoverySequence ran={ran} /><div className="recovery-state-grid"><span>OCCUPANCY<b>{ran ? 'EMPTY' : 'HOLD'}</b></span><span>ACCESS LOOP<b>{ran ? 'CLOSED' : '—'}</b></span><span>FURNACE<b>{ran ? 'READY' : 'HOLD'}</b></span><span>ROBOT<b>{ran ? 'HANDSHAKE' : 'PARKED'}</b></span></div>{ran && <div className="blank-verdict"><span>TEST RESULT</span><b>EMPTY CELL + STATE CHANGES PASS</b><i>READY</i></div>}{ran && <div className="decision-stack"><button type="button" onClick={() => onFinish(true)}>Return equipment to ready</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function RecoverySequence({ ran }: { ran: boolean }) {
  const stages = ['AREA CLEAR', 'ACCESS CLOSED', 'FURNACE PROOF', 'ROBOT HANDSHAKE'];
  return <div className={`recovery-sequence ${ran ? 'passed' : ''}`} role="img" aria-label={ran ? 'Passed furnace and robot coordinated empty-cell verification sequence' : 'Furnace and robot recovery sequence held before acquisition'}><div className="recovery-cell-visual"><i className="recovery-furnace"><b>FURNACE</b></i><span className="recovery-link">↔</span><i className="recovery-robot"><b>ROBOT</b></i><em>EMPTY CELL</em></div><ol>{stages.map((stage, index) => <li key={stage} className={ran ? 'done' : index === 0 ? 'armed' : ''}><i>{ran ? '✓' : `0${index + 1}`}</i><span>{stage}</span></li>)}</ol><div className="recovery-trace"><i /><span>ALARM SAVED</span><b>{ran ? 'SEQUENCE COMPLETE' : 'TEST HELD'}</b></div></div>;
}

function ScenarioEvidenceModal({ scenarioId, feedback, onFinish, onClose }: { scenarioId: 'bet' | 'furnace'; feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const isBet = scenarioId === 'bet';
  return <ModalShell title={isBet ? 'Review the low reading' : 'Review the interrupted result'} kicker="STEP 4 · RESULT CHECK" onClose={onClose}><div className="decision-question"><span>DECISION</span><b>{isBet ? 'Is one low reference reading enough to change the material?' : 'Can an interrupted run be compared with a completed run?'}</b></div><div className="evidence-grid"><div className="trace-panel"><div className="panel-heading"><span>{isBet ? 'ADSORPTION CURVE' : 'HEATING HISTORY'}</span><b>{isBet ? 'SMOOTH CURVE' : 'PLANNED VS ACTUAL'}</b></div>{isBet ? <IsothermChart /> : <EligibilityChart />}</div><div className="report-panel"><div className="panel-heading"><span>{isBet ? 'REFERENCE RESULT' : 'RUN RECORD'}</span><b>{isBet ? 'KNOWN MATERIAL' : 'INTERRUPTED'}</b></div><div className="report-metric"><span>{isBet ? 'Reading' : 'Recorded status'}</span><b>{isBet ? 'LOW' : 'COMPLETE*'}</b></div><div className="report-metric"><span>{isBet ? 'Expected' : 'Heating completed'}</span><b>{isBet ? 'IN RANGE' : 'PARTIAL'}</b></div><div className="report-status warn-status">{isBet ? 'RECHECK THE MEASUREMENT' : 'NOT COMPARABLE'}</div><p>{isBet ? 'The known reference material read low once.' : 'The actual trace stops before the planned heating cycle ends.'}</p></div></div><div className="ai-proposal"><div><span>NEXT-RUN SUGGESTION</span><h3>{isBet ? 'Change the material recipe' : 'Use the interrupted run for predictions'}</h3><p>{isBet ? 'Based on one low machine reading.' : 'Based on the incorrect “complete” label.'}</p></div></div><div className="decision-stack horizontal evidence-actions"><button type="button" onClick={() => onFinish(true)}>{isBet ? 'Recheck the reference material first' : 'Label interrupted and exclude it'}</button><button type="button" className="secondary" onClick={() => onFinish(false)}>{isBet ? 'Change the material from this reading' : 'Use it because the record says complete'}</button></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function IsothermChart() { const points = [8, 12, 16, 21, 27, 34, 43, 55, 69, 84]; return <div className="isotherm-chart" aria-label="Simulated gas adsorption isotherm">{points.map((value, index) => <i key={value} style={{ left: `${8 + index * 9}%`, bottom: `${value}%` }} />)}<span className="fit-window">BET FIT WINDOW</span><b className="chart-y">adsorbed volume</b><b className="chart-x">relative pressure P/P₀</b></div>; }
function EligibilityChart() { return <div className="eligibility-chart" aria-label="Thermal history mismatch"><span className="ideal-line" /><span className="actual-line" /><i>STOPPED</i><div><b>PLANNED HISTORY</b><em>complete cycle</em></div><div><b>ACTUAL HISTORY</b><em>stopped early</em></div></div>; }

function ScenarioCompleteModal({ scenarioId, scores, elapsedMinutes, logCount, exceptionCount, onDeck, onClose }: { scenarioId: 'bet' | 'furnace'; scores: Scores; elapsedMinutes: number; logCount: number; exceptionCount: number; onDeck: () => void; onClose: () => void }) {
  const isBet = scenarioId === 'bet';
  return <ModalShell title="Mission debrief" kicker="MISSION COMPLETE" onClose={onClose} wide={false}><p className="modal-intro">{isBet ? 'You checked the repaired analyzer, matched the sample record, and avoided changing the material from an uncertain reading.' : 'You preserved the interrupted heating history, found the physical sample, tested the empty equipment, and excluded the incomplete result.'}</p><DebriefVisual scenario={scenarioId} scores={scores} elapsedMinutes={elapsedMinutes} logCount={logCount} exceptionCount={exceptionCount} /><div className="lesson-card"><b>What changed in the lab</b><p>{isBet ? 'Four matched tubes are ready. The low QC-material result is queued for a repeat check, and no material recipe was changed.' : 'The interrupted sample and trace remain saved. The empty equipment passed, and a replacement run is ready.'}</p></div><button className="modal-run" type="button" onClick={onDeck}>CHOOSE ANOTHER MISSION</button></ModalShell>;
}

function Task({ number, title, note, status, onClick }: { number: string; title: string; note: string; status: 'done' | 'active' | 'pending'; onClick?: () => void }) { const content = <><span>{status === 'done' ? '✓' : number}</span><div><b>{title}</b><small>{note}</small></div></>; return <li className={status}>{onClick ? <button type="button" onClick={onClick}>{content}</button> : content}</li>; }
function LedgerDrawer({ log, onClose }: { log: LogItem[]; onClose: () => void }) { return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="ledger-drawer" role="dialog" aria-modal="true" aria-label="Event ledger" onClick={(event) => event.stopPropagation()}><header><div><p className="section-kicker">RUN RECORD</p><h2>Event ledger</h2></div><button type="button" onClick={onClose} aria-label="Close event ledger">×</button></header><p className="drawer-intro">A chronological record of operator checks, equipment state, material exceptions, results, and decisions.</p><ol>{[...log].reverse().map((item, index) => <li key={`${item.time}-${index}`}><time>{item.time}</time><i className={item.type}>{item.type}</i><p>{item.text}</p></li>)}</ol></aside></div>; }
