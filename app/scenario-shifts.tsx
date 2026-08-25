'use client';

import { useEffect, useMemo, useState } from 'react';
import { DebriefVisual } from './debrief-visual';
import { CampaignControlModal } from './campaign-control';
import { useCampaignSnapshot } from './campaign-context';
import { campaignSpecs, evaluateCampaignMission, getCampaignIdentity, getCampaignOperations, getCampaignSpec } from './campaign-spec';
import { SystemsAtlasModal } from './systems-atlas';
import { LabViewport } from './lab-viewport';
import { baseStations, type Station } from './sim-data';
import { StationAccess } from './station-access';

export type ScenarioId = 'xrd' | 'bet' | 'furnace' | 'tga' | 'facility';
type Scores = { safety: number; traceability: number; integrity: number; uptime: number };
type LogItem = { time: string; type: string; text: string };
type Modal = 'deck' | 'guide' | 'campaign' | 'campaign-facility' | 'bench' | 'sample' | 'verify' | 'evidence' | 'complete' | null;
type Scenario = {
  id: 'bet' | 'furnace';
  label: string;
  code: string;
  priority: string;
  title: string;
  summary: string;
  stationId: string;
  accent: string;
  handoff: [string, string, string][];
  tasks: { title: string; pending: string; done: string }[];
};

const scenarios: Record<'bet' | 'furnace', Scenario> = {
  bet: {
    id: 'bet', label: 'Surface area', code: 'WO-2916', priority: 'SERVICE RETURN', title: 'Restart the BET analyzer',
    summary: 'Check a repaired analyzer, match the correct sample tube, and review a low reading.',
    stationId: 'BET-02', accent: '#b48cff',
    handoff: [['SERVICE', 'MX-233', 'pump replaced'], ['QUEUE', '4', 'samples waiting'], ['GAS', 'N₂', 'supply normal']],
    tasks: [
      { title: 'Read the repair note', pending: 'Repair complete', done: 'Repair note read' },
      { title: 'Check the analyzer', pending: 'Machine needs lab checks', done: 'Machine checks passed' },
      { title: 'Match the sample tube', pending: 'One label may be wrong', done: 'Tube matched' },
      { title: 'Run the surface-area test', pending: 'Waiting to start', done: '4 samples tested' },
      { title: 'Review the low reading', pending: 'Reference is below range', done: 'Repeat check assigned' },
    ],
  },
  furnace: {
    id: 'furnace', label: 'Workcell recovery', code: 'WO-2954', priority: 'CELL HOLD', title: 'Recover an interrupted furnace run',
    summary: 'Find out why heating stopped, secure the sample, and safely restart the furnace and robot.',
    stationId: 'FURN-04', accent: '#ff995f',
    handoff: [['ALARM', 'I-204', 'cycle interrupted'], ['CARRIER', 'BC-207', 'occupancy unknown'], ['CELL', 'HOLD', 'robot parked']],
    tasks: [
      { title: 'Read the handoff', pending: 'Heating stopped', done: 'Handoff read' },
      { title: 'Review alarm + secure sample', pending: 'Stopped at 742 °C', done: 'Trace saved · sample held' },
      { title: 'Find the carrier', pending: 'Location uncertain', done: 'Carrier found' },
      { title: 'Run an empty safety test', pending: 'Waiting for dry run', done: 'Safety test passed' },
      { title: 'Exclude the incomplete result', pending: 'Old run still queued', done: 'Incomplete run excluded' },
    ],
  },
};

const deck = [
  { id: 'xrd' as const, eyebrow: 'X-RAY DIFFRACTION', title: 'The unexpected peak', station: 'XRD · ROBOT · MICROSCOPE', duration: '12–15 MIN', copy: 'Check an XRD machine, fix a sample-label problem, and investigate an unusual result.', learn: 'Separate a passing result from unresolved evidence.', icon: 'xrd' },
  { id: 'bet' as const, eyebrow: 'SURFACE AREA', title: 'Restart the BET analyzer', station: 'GAS SORPTION', duration: '9–12 MIN', copy: 'Check a repaired analyzer, match the correct sample tube, and review a low reading.', learn: 'Distinguish equipment trouble from material behavior.', icon: 'bet' },
  { id: 'furnace' as const, eyebrow: 'HEAT TREATMENT', title: 'Recover an interrupted run', station: 'FURNACE · ROBOT', duration: '10–13 MIN', copy: 'Find out why heating stopped, secure the sample, and safely restart the equipment.', learn: 'Recover equipment without erasing interrupted history.', icon: 'furnace' },
  { id: 'tga' as const, eyebrow: 'THERMAL ANALYSIS', title: 'Fix the baseline', station: 'TGA / DSC', duration: '9–12 MIN', copy: 'Correct a setup problem, match the sample pans, and decide whether a result is trustworthy.', learn: 'Recognize when setup artifacts imitate material signals.', icon: 'tga' },
  { id: 'facility' as const, eyebrow: 'LAB OPERATIONS', title: 'Move material and change gas', station: 'STORAGE · GAS · BET', duration: '11–14 MIN', copy: 'Move the correct container, connect the right gas, and check the analyzer afterward.', learn: 'Keep identity and evidence intact across a changeover.', icon: 'facility' },
];

const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function ShiftDeckModal({ active, onChoose, onClose }: { active: ScenarioId; onChoose: (id: ScenarioId) => void; onClose: () => void }) {
  return <div className="modal-backdrop deck-backdrop" role="presentation"><section className="modal-card wide deck-modal" role="dialog" aria-modal="true" aria-label="Choose a lab scenario"><header><div><p className="section-kicker">SIMULATED SCENARIOS</p><h2>Choose a lab challenge</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header><div className="deck-summary"><div><b>5</b><span>FICTIONAL CHALLENGES</span></div><p>Every challenge starts fresh. Pick one goal; the highlighted objective will guide you.</p></div><div className="scenario-deck">{deck.map((item, index) => <button key={item.id} type="button" className={`scenario-card ${item.id === active ? 'active' : ''}`} onClick={() => onChoose(item.id)}><div className={`scenario-visual visual-${item.icon}`}><span>0{index + 1}</span><EquipmentGlyph type={item.icon} /><i>{item.station}</i></div><div className="scenario-copy"><span>{item.eyebrow}</span><h3>{item.title}</h3><p>{item.copy}</p><small><b>YOU’LL LEARN</b>{item.learn}</small><footer><b>{item.duration}</b><em>{item.id === active ? 'RESTART →' : 'START →'}</em></footer></div></button>)}</div></section></div>;
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
        : campaign.stage === 6 ? operations.referenceCondition === 'age-due' ? 'Overdue NIST Si control' : operations.referenceCondition === 'trend-review' ? 'Si trend confirmation' : 'Current Si control review'
          : campaign.stage === 8 ? 'Four BSE fields + representative EDS map' : campaign.stage >= 9 ? `${spec.id === 'D-08' ? 'Ti-rich cores' : 'Ca-rich grains'} · hypothesis linked` : campaign.stage >= 7 ? campaign.confirmationSource ? `${Math.abs(Number(campaign.resultMeasured) - Number(campaign.confirmationSource.measured)).toFixed(1)} pp replicate spread · ${evaluation.met ? 'boundary repeated' : 'margin lost'}` : `${evaluation.gap} mission gap · qualified result` : `${identity.runId} physical evidence`;
    const next = campaign.stage >= 9 ? 'Archive evidence + propose next candidate' : campaign.stage === 8 ? 'Acquire representative microscopy evidence' : campaign.stage >= 7 ? campaign.confirmationSource && !evaluation.met ? 'Reopen design or diagnose mechanism' : 'Archive result + propose next candidate' : campaign.stage >= 6 ? 'Acquire qualified diffraction pattern' : 'Advance governed material route';
    return <section className="rail-section planner-panel campaign-planner"><div className="section-title-row"><p className="section-kicker">AI EXPERIMENT LOOP</p><span className={campaign.stage >= 7 ? 'held' : campaign.stage >= 6 ? 'review' : ''}>{status}</span></div><div className="planner-loop">{['PLAN', 'EXECUTE', 'MEASURE', 'LEARN'].map((label, index) => <div key={label} className={index < cursor ? 'passed' : index === cursor ? 'current' : ''}><i>{index < cursor ? '✓' : `0${index + 1}`}</i><span>{label}</span></div>)}</div><div className="design-space campaign-mini-space" style={{ '--design-accent': '#4dd5ed' } as React.CSSProperties}><div className="design-space-head"><span>CAMPAIGN SPACE</span><b>{identity.runId} · {spec.id}</b></div><svg viewBox="0 0 100 74" role="img" aria-label={`${spec.id} in the campaign composition and temperature design space`}><path className="space-contour" d="M10 59 C24 25, 50 14, 90 31 M8 68 C34 43, 64 32, 94 18" />{campaignSpecs.map((candidate) => <g key={candidate.id} className={candidate.id === spec.id ? 'proposal-point' : 'measured-point'} transform={`translate(${candidate.point[0] / 3.2} ${candidate.point[1] / 2.43})`}><circle r={candidate.id === spec.id ? 5.2 : 2.2} />{candidate.id === spec.id && <path d="M-3 0H3M0-3V3" />}</g>)}<text x="6" y="70">Ca-rich</text><text x="76" y="70">Ti-rich</text></svg></div><div className="planner-request"><span>MODEL / RUN REQUEST</span><b>{request}</b></div><div className="planner-gate"><i>{campaign.stage >= 7 ? 'MODEL GATE' : 'TECH GATE'}</i><div><b>{gate}</b><span>Next: {next}</span></div></div></section>;
  }
  const states = {
    xrd: {
      request: 'Increase dwell · 4 h → 6 h', gate: 'Unresolved 36.1° reflection', next: 'SEM/EDS follow-up',
      status: phase >= 5 ? 'HOLD + INVESTIGATE' : phase >= 4 ? 'TECH REVIEW' : 'WAITING ON LAB',
    },
    bet: {
      request: 'Lower calcination · −35 °C', gate: 'Low control reference', next: 'Reference recheck',
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
  const [log, setLog] = useState<LogItem[]>([
    { time: scenarioId === 'bet' ? '10:31' : '13:04', type: 'handoff', text: scenarioId === 'bet' ? 'Vendor service MX-233 marked complete; laboratory acceptance still required.' : 'SCADA alarm I-204 interrupted thermal program at 742 °C; workcell placed on hold.' },
    { time: scenarioId === 'bet' ? '10:42' : '13:12', type: 'system', text: `${scenario.code} assigned to TECH-07.` },
  ]);
  const [logOpen, setLogOpen] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [ran, setRan] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [scores, setScores] = useState<Scores>({ safety: 96, traceability: 78, integrity: 74, uptime: scenarioId === 'bet' ? 62 : 70 });
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
      if (phase < 3) return { ...station, state: 'READY', tone: 'ready', meta: phase === 1 ? 'Acceptance complete · ports released' : 'Sample eligibility review', technicianView: ['Analysis ports: available', 'Leak/blank: accepted', `Tube ADS-77-C: ${phase >= 2 ? 'reconciled' : 'hold'}`, 'N₂ supply: normal'] };
      return { ...station, state: phase === 3 ? 'ANALYZING' : 'REVIEW', tone: phase === 3 ? 'run' : 'warn', meta: phase === 3 ? 'ADS-77 batch · 61% complete' : 'Reference area below control band', technicianView: ['Reference: ALU-21', 'Measured: 168 m²/g', 'Control band: 173–191 m²/g', 'Fit review: required'] };
    }
    if (scenarioId === 'furnace' && station.id === 'FURN-04') {
      if (phase === 0) return { ...station, state: 'ALARM HOLD', tone: 'warn', meta: 'Program stopped · 742 °C', technicianView: ['Program: HT-44 rev 7', 'Interrupted: 742 °C', 'Door interlock: event I-204', 'Carrier: BC-207'] };
      if (phase < 3) return { ...station, state: 'SERVICE HOLD', tone: 'hold', meta: phase === 1 ? 'Trace retained · load held' : 'Empty-cell verification pending', technicianView: ['Program trace: retained', 'Carrier: quarantined', 'Chamber occupancy: reconciled', `Recovery: ${phase === 2 ? 'ready' : 'workcell check'}`] };
      return { ...station, state: 'READY', tone: 'ready', meta: 'Empty-cell verification passed', technicianView: ['Program: HT-44 rev 7', 'Interlocks: verified', 'Controller trace: nominal', 'Next load: awaiting release'] };
    }
    if (scenarioId === 'furnace' && station.id === 'ROBO-02') return { ...station, state: phase < 2 ? 'RECOVERY HOLD' : 'READY', tone: phase < 2 ? 'warn' : 'ready', meta: phase < 2 ? 'BC-207 occupancy unknown' : 'Carrier state reconciled', technicianView: ['Safety zone: clear', 'Robot: parked', `Carrier BC-207: ${phase < 2 ? 'unresolved' : 'quarantined'}`, 'Recovery mode: supervised'] };
    return station;
  }), [phase, scenarioId]);

  const selectedBase = stations.find((station) => station.id === selectedId) ?? stations[0];
  const selected = selectedBase;
  const completed = phase >= 5 ? 5 : Math.min(4, phase + 1);
  const progress = Math.round((completed / 5) * 100);
  const appendLog = (type: string, text: string, add = 0) => {
    const next = minute + add; setMinute(next); setLog((items) => [...items, { time: formatTime(next), type, text }]);
  };
  const recordInspection = (stationId: string, inspectionChecks: string[]) => {
    const wasComplete = (physicalInspections[stationId]?.length ?? 0) === 3;
    setPhysicalInspections((current) => ({ ...current, [stationId]: inspectionChecks }));
    if (!wasComplete && inspectionChecks.length === 3) appendLog('inspection', `${stationId} physical walkaround completed; ${inspectionChecks.join(', ')} linked to the local-console evidence gate.`, 1);
  };
  const penalize = (key: keyof Scores, amount: number) => setScores((value) => ({ ...value, [key]: Math.max(0, value[key] - amount) }));
  const reward = (updates: Partial<Scores>) => setScores((value) => ({ safety: Math.min(100, updates.safety ?? value.safety), traceability: Math.min(100, updates.traceability ?? value.traceability), integrity: Math.min(100, updates.integrity ?? value.integrity), uptime: Math.min(100, updates.uptime ?? value.uptime) }));
  const open = (next: Modal, station = scenario.stationId) => { setFeedback(''); setChecks({}); setRan(false); setScanned(false); setSelectedId(station); setModal(next); };

  const finishBench = (correct: boolean) => {
    if (!correct) {
      penalize(scenarioId === 'bet' ? 'integrity' : 'safety', 16);
      setFeedback(scenarioId === 'bet' ? 'Vendor completion is not laboratory acceptance evidence. The analyzer still needs an independent readiness check.' : 'Resuming at the interrupted step would erase the thermal-history exception and expose an unresolved carrier state.');
      appendLog('exception', scenarioId === 'bet' ? 'Attempted service release based only on vendor completion; release blocked.' : 'Attempted program resume without controlled interruption disposition; action blocked.', 2);
      return;
    }
    setPhase(1); reward(scenarioId === 'bet' ? { integrity: scores.integrity + 10, uptime: scores.uptime + 10 } : { safety: scores.safety + 4, integrity: scores.integrity + 9 });
    appendLog('decision', scenarioId === 'bet' ? 'BET-02 accepted after service-record review and independent blank/leak evidence.' : 'BC-207 held; interrupted thermal trace retained and linked to an exception record.', scenarioId === 'bet' ? 18 : 7);
    window.setTimeout(() => setModal(null), 600);
  };

  const finishSample = (correct: boolean) => {
    if (!correct) {
      penalize('traceability', 18); setFeedback(scenarioId === 'bet' ? 'Copying the adjacent tube record would create a plausible but false pretreatment history.' : 'Robot telemetry alone cannot prove physical occupancy after an interrupted handoff.');
      appendLog('exception', scenarioId === 'bet' ? 'Adjacent degas record selected as substitute; association blocked.' : 'Carrier occupancy inferred from telemetry without physical reconciliation; release blocked.', 2); return;
    }
    setPhase(2); reward({ traceability: scores.traceability + 15, integrity: scores.integrity + 5 });
    appendLog('lineage', scenarioId === 'bet' ? 'ADS-77-C held, source barcode reconciled, and correct degas record linked.' : 'BC-207 physical occupancy reconciled; load quarantined and robot state restored.', scenarioId === 'bet' ? 9 : 12);
    window.setTimeout(() => setModal(null), 650);
  };

  const releaseRun = () => {
    setPhase(3); setSelectedId(scenario.stationId); reward({ uptime: scores.uptime + 5 });
    appendLog('transfer', scenarioId === 'bet' ? 'Four eligible tubes released to BET-02; one reconciled record included.' : 'Empty-cell verification completed; furnace and robot interlocks returned to ready.', scenarioId === 'bet' ? 5 : 16);
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
  const advance = () => { setPhase(4); setFeedback(''); appendLog('result', scenarioId === 'bet' ? 'Adsorption run complete; native isotherm, fit window, sample mass, and pretreatment records linked.' : 'Recovery evidence assembled; interrupted run is still present in the planner ingestion queue.', scenarioId === 'bet' ? 64 : 1); setModal('evidence'); };
  const finishEvidence = (correct: boolean) => {
    if (!correct) { penalize('integrity', 17); setFeedback(scenarioId === 'bet' ? 'The AI proposal treats the low area as material behavior before the control/reference exception is resolved.' : 'Marking the run complete would teach the planner from a specimen with interrupted and non-comparable thermal history.'); appendLog('exception', scenarioId === 'bet' ? 'AI synthesis proposal accepted before measurement-system review; decision held.' : 'Interrupted run offered to AI training set without censor label; export held.', 3); return; }
    setPhase(5); reward({ integrity: scores.integrity + 12, traceability: scores.traceability + 5 }); appendLog('decision', scenarioId === 'bet' ? 'Low reference routed to recheck; AI synthesis change held pending trustworthy surface-area evidence.' : 'Interrupted run labeled censored and excluded from optimizer training; replacement run queued.', 5); setModal('complete'); setFeedback('');
  };

  const releaseAction = scenarioId === 'furnace' ? () => open('verify', 'FURN-04') : releaseRun;
  const state = getActionState(scenarioId, phase, () => open('bench'), () => open('sample', scenarioId === 'furnace' ? 'ROBO-02' : 'BET-02'), releaseAction, advance, () => setModal('evidence'), () => setModal('complete'));

  return <main className={`shell scenario-shell scenario-${scenarioId}`} style={{ '--scenario-accent': scenario.accent } as React.CSSProperties}>
    <header className="topbar"><div className="brand-block"><span className="brand-mark">M<span>²</span></span><div><p className="eyebrow">Explore · experiment · learn</p><h1>MATTERSHIFT</h1></div></div><div className="shift-readout"><span className="live-dot" /><div><b>SIMULATION READY</b><small>{formatTime(minute)} · FICTIONAL LAB</small></div></div><div className="header-actions"><button className="campaign-button" type="button" onClick={() => setModal('campaign')}>ADVANCED MODE</button><button className="deck-button" type="button" onClick={() => setModal('deck')}>SCENARIOS <span>5</span></button><button type="button" onClick={() => setModal('guide')}>HOW TO PLAY</button><button type="button" onClick={() => setLogOpen(true)}>SIM LOG <span>{log.length}</span></button></div></header>
    <div className="workspace"><aside className="left-rail"><section className="rail-section shift-card"><p className="section-kicker">CURRENT MISSION</p><div className="wo-title"><span>{scenario.code}</span><em>{phase === 4 ? 'REVIEW GATE' : phase >= 5 ? 'CLOSED' : scenario.priority}</em></div><h2>{scenario.title}</h2><p>{scenario.summary}</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-meta"><span>{completed} / 5 tasks</span><span>{progress}%</span></div></section><section className="rail-section"><p className="section-kicker">MISSION STEPS</p><ol className="task-list">{scenario.tasks.map((task, index) => { const done = index === 4 ? phase >= 5 : phase >= index; const active = !done && (index === phase + 1 || (index === 1 && phase === 0) || (index === 4 && phase === 4)); const actions = [undefined, () => open('bench'), () => open('sample', scenarioId === 'furnace' ? 'ROBO-02' : 'BET-02'), releaseAction, () => phase === 3 ? advance() : setModal('evidence')]; return <Task key={task.title} number={`0${index + 1}`} title={task.title} note={done ? task.done : task.pending} status={done ? 'done' : active ? 'active' : 'pending'} onClick={active ? actions[index] : undefined} />; })}</ol></section><section className="rail-section handoff-note"><div className="section-title-row"><p className="section-kicker">SHIFT HANDOFF</p><span>3 SIGNALS</span></div><div className="handoff-grid">{scenario.handoff.map(([tag, value, note]) => <div key={tag}><span>{tag}</span><b>{value}</b><small>{note}</small></div>)}</div></section><section className="rail-section system-boundary"><p className="section-kicker">RECORD PATH</p><div><span>CMMS</span><i>service + maintenance evidence</i></div><div><span>SCADA</span><i>state, trace + alarm context</i></div><div><span>LIMS / LES</span><i>identity, method + disposition</i></div></section></aside>
      <section className="lab-view"><div className="lab-heading"><div><p className="section-kicker">EXPLORE THE LAB</p><h2>Select a station to see what it does</h2></div><div className="legend"><span><i className="ready" />ready</span><span><i className="run" />active</span><span><i className="warn" />attention</span></div></div><LabViewport stations={stations} selectedId={selectedId} phase={phase} scenarioId={scenarioId} inspectionState={physicalInspections} onInspectionChange={recordInspection} onSelect={setSelectedId} /><footer className="facility-footer"><div><span>ENV</span><b>22.1 °C</b><small>41% RH</small></div><div><span>EXHAUST</span><b>NORMAL</b><small>−12 Pa</small></div><div><span>GAS DETECTION</span><b>NORMAL</b><small>6 / 6 online</small></div><div><span>OPEN WORK</span><b>{phase >= 3 ? '9' : '12'}</b><small>{phase >= 2 ? '1' : '3'} waiting release</small></div></footer></section>
      <aside className="right-rail"><section className={`rail-section alert-card tone-${state.tone}`}><div className="alert-head"><span>{state.tag}</span><b>{phase >= 5 ? 'CLOSED' : phase === 4 ? 'REVIEW' : 'ACTIVE'}</b></div><h2>{state.title}</h2><div className="metric-row"><span>Current state</span><strong>{state.metric}</strong></div><p>{state.body}</p><button className="primary-action" type="button" onClick={state.fn}>{state.action}<span>→</span></button></section><section className="rail-section station-inspector"><div className="section-title-row"><p className="section-kicker">SELECTED EQUIPMENT · SIMULATED</p><span className={selected.tone}>{selected.state}</span></div><div className="station-identity"><b>{selected.id}</b><h2>{selected.name}</h2></div><div className="readout-list">{selected.technicianView.map((item) => { const [key, value] = item.split(': '); return <div key={item}><span>{key}</span><b>{value}</b></div>; })}</div><p className="mini-label">OUTPUTS</p><div className="tag-list">{selected.dataProducts.map((item) => <span key={item}>{item}</span>)}</div><StationAccess station={selected} scenarioId={scenarioId} physicalChecks={physicalInspections[selected.id] ?? []} /></section><PlannerPanel scenario={scenarioId} phase={phase} /><section className="rail-section score-panel"><div className="section-title-row"><p className="section-kicker">SHIFT HEALTH</p><span>SIM</span></div>{Object.entries(scores).map(([key, value]) => <Score key={key} label={{ safety: 'Safety', traceability: 'Traceability', integrity: 'Data integrity', uptime: 'Lab uptime' }[key]!} value={value} />)}</section><section className="rail-section lineage-card"><div className="section-title-row"><p className="section-kicker">EVIDENCE CHAIN</p><span>SIM</span></div><div className="lineage-flow"><span>{scenarioId === 'bet' ? 'LOT-77' : 'LOT-112'}</span><i>→</i><span>{scenarioId === 'bet' ? 'ADS-77-C' : 'BC-207'}</span><i>→</i><span>{scenarioId === 'bet' ? (phase >= 2 ? 'ELIG' : 'HOLD') : (phase >= 5 ? 'CENS' : 'HOLD')}</span></div><p>{scenarioId === 'bet' ? (phase >= 2 ? 'Tube identity and pretreatment record agree.' : 'Pretreatment association requires review.') : (phase >= 5 ? 'Interrupted run is retained but excluded from optimizer training.' : phase >= 2 ? 'Interrupted load is quarantined with trace retained.' : 'Physical occupancy remains unresolved.')}</p></section></aside></div>
    {modal === 'deck' && <ShiftDeckModal active={scenarioId} onChoose={onSwitch} onClose={() => setModal(null)} />}
    {modal === 'guide' && <SystemsAtlasModal onClose={() => setModal(null)} />}
    {(modal === 'campaign' || modal === 'campaign-facility') && <CampaignControlModal autoOpenFacility={modal === 'campaign-facility'} onClose={() => setModal(null)} />}
    {modal === 'bench' && <BenchModal scenarioId={scenarioId} ran={ran} setRan={setRan} feedback={feedback} appendLog={appendLog} onFinish={finishBench} onClose={() => setModal(null)} />}
    {modal === 'sample' && <SampleModal scenarioId={scenarioId} scanned={scanned} setScanned={setScanned} feedback={feedback} appendLog={appendLog} onFinish={finishSample} onClose={() => setModal(null)} />}
    {modal === 'verify' && <RecoveryVerificationModal checks={checks} setChecks={setChecks} ran={ran} onRun={runRecoveryVerification} feedback={feedback} onFinish={finishRecoveryVerification} onClose={() => setModal(null)} />}
    {modal === 'evidence' && <ScenarioEvidenceModal scenarioId={scenarioId} feedback={feedback} onFinish={finishEvidence} onClose={() => setModal(null)} />}
    {modal === 'complete' && <ScenarioCompleteModal scenarioId={scenarioId} scores={scores} logCount={log.length} exceptionCount={log.filter((event) => event.type === 'exception').length} onDeck={() => setModal('deck')} onClose={() => setModal(null)} />}
    {logOpen && <LedgerDrawer log={log} onClose={() => setLogOpen(false)} />}
  </main>;
}

function getActionState(id: 'bet' | 'furnace', phase: number, bench: () => void, sample: () => void, release: () => void, advance: () => void, evidence: () => void, complete: () => void) {
  const bet = [
    ['NEXT STEP', 'Check the repaired BET analyzer', 'A repair ticket is not enough. Run the lab checks before using the machine.', 'Needs checks', 'CHECK THE ANALYZER', bench, 'warn'],
    ['NEXT STEP', 'One sample tube does not match', 'Compare the tube label with the preparation rack and find the mismatch.', '1 mismatch', 'CHECK THE TUBE', sample, 'warn'],
    ['NEXT STEP', 'The analyzer is ready', 'The machine and sample records now agree.', '4 tubes', 'START THE TEST', release, 'ready'],
    ['IN PROGRESS', 'The BET test is running', 'Advance when you are ready to inspect the result.', '61%', 'SEE THE RESULT', advance, 'run'],
    ['NEXT STEP', 'The reference reading is low', 'Check the curve before blaming the material or changing the recipe.', 'Below range', 'REVIEW THE RESULT', evidence, 'warn'],
    ['MISSION COMPLETE', 'A repeat check is queued', 'You avoided making a material change from an uncertain machine reading.', '5 / 5', 'VIEW SUMMARY', complete, 'ready'],
  ];
  const furnace = [
    ['NEXT STEP', 'The furnace stopped mid-run', 'Review the alarm and keep the interrupted sample separate.', 'Stopped at 742 °C', 'CHECK THE ALARM', bench, 'warn'],
    ['NEXT STEP', 'Find the sample carrier', 'Confirm whether the carrier is in the robot or the furnace.', 'Location unknown', 'CHECK THE WORKCELL', sample, 'warn'],
    ['NEXT STEP', 'Test the empty equipment', 'Run a dry cycle before putting another sample at risk.', 'No sample loaded', 'RUN THE SAFETY TEST', release, 'ready'],
    ['NEXT STEP', 'The equipment is working again', 'Now decide whether the interrupted result can be reused.', 'Checks passed', 'REVIEW THE OLD RUN', advance, 'ready'],
    ['NEXT STEP', 'Do not train on the interrupted run', 'Its heating history is incomplete, so it cannot represent normal material behavior.', '1 excluded run', 'EXCLUDE THE RUN', evidence, 'warn'],
    ['MISSION COMPLETE', 'The furnace and robot are ready', 'The interrupted run remains visible but will not mislead future experiments.', '5 / 5', 'VIEW SUMMARY', complete, 'ready'],
  ];
  const raw = (id === 'bet' ? bet : furnace)[phase] ?? (id === 'bet' ? bet : furnace)[5];
  return { tag: raw[0] as string, title: raw[1] as string, body: raw[2] as string, metric: raw[3] as string, action: raw[4] as string, fn: raw[5] as () => void, tone: raw[6] as string };
}

function ModalShell({ title, kicker, children, onClose, wide = true }: { title: string; kicker: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation"><section className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</section></div>;
}

function BenchModal({ scenarioId, ran, setRan, feedback, appendLog, onFinish, onClose }: { scenarioId: 'bet' | 'furnace'; ran: boolean; setRan: (value: boolean) => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const isBet = scenarioId === 'bet';
  const items = isBet ? [
    ['scope', 'Match service scope', 'Pump replacement, cleanliness release, and configuration changes are linked to MX-233.'],
    ['utilities', 'Review utilities + port state', 'Adsorbate identity, supply state, analysis ports, and software configuration agree.'],
    ['blank', 'Stage independent acceptance', 'A governed blank/leak check—not vendor status alone—will establish readiness.'],
  ] : [
    ['trace', 'Freeze controller trace', 'Retain the full temperature program, alarm sequence, and interruption timestamp.'],
    ['load', 'Place BC-207 on material hold', 'An interrupted cycle creates a different thermal history even if the target temperature was nearly reached.'],
    ['cell', 'Confirm workcell recovery state', 'Robot parked, access controlled, and local alarm context acknowledged.'],
  ];
  const run = () => { setRan(true); appendLog('qc', isBet ? 'BET-02 acceptance blank/leak sequence complete; criterion met.' : 'Interrupted trace package frozen; carrier BC-207 hold applied.', isBet ? 12 : 5); };
  return <ModalShell title={isBet ? 'Gas-sorption service acceptance' : 'Interrupted-cycle disposition'} kicker={isBet ? 'CMMS + QC · BET-02' : 'SCADA + LES · FURN-04'} onClose={onClose}><div className="modal-grid scenario-bench-grid"><div><p className="modal-intro">{isBet ? 'Vendor work is complete. Review what the lab check must prove, then run it.' : 'The furnace is in a safe hold. Review what must be preserved, then capture the interrupted state.'}</p><div className="evidence-brief">{items.map(([key, title, note]) => <article key={key}><i>•</i><div><b>{title}</b><small>{note}</small></div></article>)}</div><button className="modal-run" type="button" disabled={ran} onClick={run}>{ran ? 'EVIDENCE CAPTURED' : isBet ? 'RUN ACCEPTANCE CHECK · 12 MIN' : 'CAPTURE TRACE + HOLD LOAD · 5 MIN'}</button></div><div className={`instrument-console ${isBet ? 'vacuum-console' : 'thermal-console'}`}><div className="panel-heading"><span>{isBet ? 'VACUUM DECAY · RATE VS LIMIT' : 'TEMPERATURE VS TIME · °C / MIN'}</span><b>{isBet ? 'PORTS 1–4' : 'HT-44 · REV 7'}</b></div>{isBet ? <VacuumTrace ran={ran} /> : <ThermalTrace ran={ran} />}<div className="result-box"><span>{isBet ? 'SERVICE STATE' : 'ALARM'}</span><b>{isBet ? 'VENDOR COMPLETE' : 'I-204'}</b><span>{isBet ? 'LAB ACCEPTANCE' : 'LOAD STATE'}</span><b>{ran ? (isBet ? 'CRITERION MET' : 'CONTROLLED HOLD') : '—'}</b></div>{ran && <div className="decision-stack"><p className="mini-label">DISPOSITION</p><button type="button" onClick={() => onFinish(true)}>{isBet ? 'Accept with independent evidence' : 'Retain trace + quarantine load'}</button><button type="button" className="secondary" onClick={() => onFinish(false)}>{isBet ? 'Release from vendor sign-off only' : 'Resume program at interrupted step'}</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function VacuumTrace({ ran }: { ran: boolean }) { return <div className="vacuum-trace" aria-label="Simulated vacuum acceptance trend"><div className="vacuum-gauge"><i style={{ transform: `rotate(${ran ? 42 : -35}deg)` }} /><b>{ran ? '3.1e−3' : '—'}</b><span>mbar/min</span></div><div className="vacuum-lines">{[72, 58, 45, 34, 26, 21].map((top, index) => <i key={top} style={{ left: `${8 + index * 16}%`, top: `${ran ? top : 88}%` }} />)}<span className="accept-line">ACCEPTANCE CRITERION</span></div></div>; }
function ThermalTrace({ ran }: { ran: boolean }) { return <div className="thermal-trace" aria-label="Simulated interrupted furnace trace"><i className="thermal-fill" /><span className="alarm-pin">I-204<br />742 °C</span><b className="trace-label">SETPOINT</b><b className="trace-label actual">MEASURED</b>{ran && <em>TRACE FROZEN · HASH LINKED</em>}</div>; }

function SampleModal({ scenarioId, scanned, setScanned, feedback, appendLog, onFinish, onClose }: { scenarioId: 'bet' | 'furnace'; scanned: boolean; setScanned: (value: boolean) => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const isBet = scenarioId === 'bet';
  const scan = () => { setScanned(true); appendLog('lineage', isBet ? 'Physical tube ADS-77-C scanned; degas rack event points to ADS-77-B.' : 'BC-207 physical occupancy checked; four crucibles present while robot state reports transfer complete.', 4); };
  return <ModalShell title={isBet ? 'Pretreatment record reconciliation' : 'Robot–furnace occupancy reconciliation'} kicker={isBet ? 'LIMS + LES · ADS-77-C' : 'WORKCELL RECOVERY · BC-207'} onClose={onClose}><p className="modal-intro">{isBet ? 'Surface area depends on sample preparation and pretreatment history. The physical tube must be bound to its own record before analysis.' : 'A transfer interruption can leave digital station state ahead of physical reality. Reconcile both before commanding motion.'}</p><div className="record-compare"><article><span>PHYSICAL / LOCAL</span><EquipmentGlyph type={isBet ? 'bet' : 'furnace'} /><b>{isBet ? 'ADS-77-C' : 'FURNACE OCCUPANCY'}</b><p>{scanned ? (isBet ? 'Tube barcode C · dry mass 0.412 g' : 'BC-207 present · 4 crucibles') : 'Awaiting technician observation'}</p></article><i>≠</i><article className={scanned ? 'mismatch-record' : ''}><span>{isBet ? 'DEGAS RACK EVENT' : 'ROBOT CONTROLLER'}</span><div className="record-code">{scanned ? (isBet ? 'ADS-77-B' : 'TRANSFER COMPLETE') : '••••••••'}</div><b>{isBet ? 'METHOD DG-09' : 'LAST COMMAND 13:03:41'}</b><p>{isBet ? '300 °C · completion recorded 09:58' : 'Gripper empty · destination acknowledged'}</p></article></div>{!scanned ? <button className="modal-run" type="button" onClick={scan}>{isBet ? 'SCAN TUBE + RETRIEVE EVENTS' : 'OBSERVE CELL + COMPARE STATE'}</button> : <div className="decision-stack horizontal record-actions"><button type="button" onClick={() => onFinish(true)}>{isBet ? 'Hold tube · reconcile source record' : 'Quarantine load · restore state model'}</button><button type="button" className="secondary" onClick={() => onFinish(false)}>{isBet ? 'Copy adjacent tube’s degas record' : 'Trust robot telemetry · clear cell'}</button></div>}{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function RecoveryVerificationModal({ checks, setChecks, ran, onRun, feedback, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; ran: boolean; onRun: () => void; feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [
    ['boundary', 'Cell boundary observed clear', 'BC-207 is quarantined outside the motion envelope; chamber occupancy is zero.'],
    ['safety', 'Access + safety circuit ready', 'Door, guarding, E-stop chain, and local reset state agree before coordinated motion.'],
    ['records', 'SCADA + robot context retained', 'I-204, the interrupted controller trace, and the recovery-mode command remain linked.'],
  ];
  const ready = items.every(([key]) => checks[key]);
  return <ModalShell title="Coordinated empty-cell verification" kicker="RECOVERY MODE · FURN-04 ↔ ROBO-02" onClose={onClose}><div className="modal-grid scenario-bench-grid"><div><p className="modal-intro">An acknowledged alarm is not a recovered workcell. Prove the physical boundary, safety circuit, furnace state, and robot handshake together—with no specimen exposed to a second thermal history.</p><div className="check-stack">{items.map(([key, title, note]) => <label key={key} className={checks[key] ? 'checked' : ''}><input type="checkbox" checked={Boolean(checks[key])} onChange={() => setChecks((value) => ({ ...value, [key]: !value[key] }))} /><span>{checks[key] ? '✓' : ''}</span><div><b>{title}</b><small>{note}</small></div></label>)}</div><button className="modal-run" type="button" disabled={!ready || ran} onClick={onRun}>{ran ? 'EMPTY-CELL EVIDENCE RETAINED' : 'RUN COORDINATED DRY CYCLE · 16 MIN'}</button>{!ran && <button className="blank-release-shortcut" type="button" onClick={() => onFinish(false)}>Release from alarm acknowledgement only</button>}</div><div className="instrument-console recovery-console"><div className="panel-heading"><span>WORKCELL STATE SEQUENCE</span><b>RECOVERY · I-204</b></div><RecoverySequence ran={ran} /><div className="recovery-state-grid"><span>OCCUPANCY<b>{ran ? 'EMPTY' : 'HOLD'}</b></span><span>ACCESS LOOP<b>{ran ? 'CLOSED' : '—'}</b></span><span>FURNACE<b>{ran ? 'READY' : 'HOLD'}</b></span><span>ROBOT<b>{ran ? 'HANDSHAKE' : 'PARKED'}</b></span></div>{ran && <div className="blank-verdict"><span>COORDINATED INTERLOCK VERDICT</span><b>EMPTY CELL + STATE TRANSITIONS PASS</b><i>READY</i></div>}{ran && <div className="decision-stack"><button type="button" onClick={() => onFinish(true)}>Retain dry cycle · return workcell ready</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}<p className="concept-note">Simulation boundary · actual recovery, safeguarding, reset authority, and dry-cycle limits remain site- and equipment-specific.</p></ModalShell>;
}

function RecoverySequence({ ran }: { ran: boolean }) {
  const stages = ['AREA CLEAR', 'ACCESS CLOSED', 'FURNACE PROOF', 'ROBOT HANDSHAKE'];
  return <div className={`recovery-sequence ${ran ? 'passed' : ''}`} role="img" aria-label={ran ? 'Passed furnace and robot coordinated empty-cell verification sequence' : 'Furnace and robot recovery sequence held before acquisition'}><div className="recovery-cell-visual"><i className="recovery-furnace"><b>F-04</b></i><span className="recovery-link">↔</span><i className="recovery-robot"><b>R-02</b></i><em>0 SPECIMENS</em></div><ol>{stages.map((stage, index) => <li key={stage} className={ran ? 'done' : index === 0 ? 'armed' : ''}><i>{ran ? '✓' : `0${index + 1}`}</i><span>{stage}</span></li>)}</ol><div className="recovery-trace"><i /><span>I-204 RETAINED</span><b>{ran ? 'SEQUENCE COMPLETE' : 'ACQUISITION HELD'}</b></div></div>;
}

function ScenarioEvidenceModal({ scenarioId, feedback, onFinish, onClose }: { scenarioId: 'bet' | 'furnace'; feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const isBet = scenarioId === 'bet';
  return <ModalShell title={isBet ? 'Adsorption evidence review' : 'AI data-eligibility gate'} kicker={isBet ? 'RESULT GATE · ALU-21 CONTROL' : 'PLANNER INGESTION · RUN HT-44-207'} onClose={onClose}><div className="evidence-grid"><div className="trace-panel"><div className="panel-heading"><span>{isBet ? 'N₂ ADSORPTION ISOTHERM' : 'THERMAL HISTORY COMPARISON'}</span><b>{isBet ? '77 K · ALU-21' : 'SETPOINT VS ACTUAL'}</b></div>{isBet ? <IsothermChart /> : <EligibilityChart />}</div><div className="report-panel"><div className="panel-heading"><span>{isBet ? 'BET RESULT' : 'INGESTION RECORD'}</span><b>{isBet ? 'method v3.1' : 'dataset batch 084'}</b></div><div className="report-metric"><span>{isBet ? 'Specific area' : 'Run status'}</span><b>{isBet ? '168 m²/g' : 'complete*'}</b></div><div className="report-metric"><span>{isBet ? 'Control band' : 'Thermal completion'}</span><b>{isBet ? '173–191 m²/g' : '61%'}</b></div><div className="report-metric"><span>{isBet ? 'Fit R²' : 'Eligibility'}</span><b>{isBet ? '0.9992' : 'unreviewed'}</b></div><div className="report-status warn-status">{isBet ? 'OUTSIDE CONTROL BAND' : 'CENSOR LABEL MISSING'}</div><p>{isBet ? 'A strong linear fit does not resolve a low control reference.' : 'Data can remain discoverable without being eligible for model training.'}</p></div></div><div className="ai-proposal"><div><span>AI PLANNER · {isBet ? 'PROPOSED SYNTHESIS CHANGE' : 'AUTOMATED INGESTION'}</span><h3>{isBet ? 'Lower calcination temperature by 35 °C' : 'Add HT-44-207 to outcome model'}</h3><p>{isBet ? 'Goal: preserve surface area · confidence 0.79' : 'Novel interruption regime · uncertainty value high'}</p></div><b>QUEUED</b></div><div className="decision-stack horizontal evidence-actions"><button type="button" onClick={() => onFinish(true)}>{isBet ? 'Hold proposal · recheck reference + fit window' : 'Label censored · exclude from optimizer'}</button><button type="button" className="secondary" onClick={() => onFinish(false)}>{isBet ? 'Accept AI synthesis change' : 'Mark complete · train on run'}</button></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function IsothermChart() { const points = [8, 12, 16, 21, 27, 34, 43, 55, 69, 84]; return <div className="isotherm-chart" aria-label="Simulated gas adsorption isotherm">{points.map((value, index) => <i key={value} style={{ left: `${8 + index * 9}%`, bottom: `${value}%` }} />)}<span className="fit-window">BET FIT WINDOW</span><b className="chart-y">adsorbed volume</b><b className="chart-x">relative pressure P/P₀</b></div>; }
function EligibilityChart() { return <div className="eligibility-chart" aria-label="Simulated thermal history mismatch"><span className="ideal-line" /><span className="actual-line" /><i>INTERRUPTION</i><div><b>APPROVED HISTORY</b><em>HT-44 envelope</em></div><div><b>BC-207 ACTUAL</b><em>truncated at 742 °C</em></div></div>; }

function ScenarioCompleteModal({ scenarioId, scores, logCount, exceptionCount, onDeck, onClose }: { scenarioId: 'bet' | 'furnace'; scores: Scores; logCount: number; exceptionCount: number; onDeck: () => void; onClose: () => void }) {
  const total = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / 4); const isBet = scenarioId === 'bet';
  return <ModalShell title="Campaign debrief" kicker={`${isBet ? 'WO-2916' : 'WO-2954'} · COMPLETE`} onClose={onClose} wide={false}><div className="debrief-score"><span>RUN RATING</span><b>{total}</b><i>/ 100</i></div><p className="modal-intro">{isBet ? 'You independently accepted serviced equipment, recovered a pretreatment identity exception, and stopped a measurement-system problem from becoming an AI-directed synthesis change.' : 'You preserved an interrupted thermal history, reconciled physical workcell state, verified coordinated recovery, and kept censored data out of the optimizer.'}</p><DebriefVisual scenario={scenarioId} scores={scores} exceptionCount={exceptionCount} /><div className="debrief-grid"><span>Safety<b>{scores.safety}</b></span><span>Traceability<b>{scores.traceability}</b></span><span>Data integrity<b>{scores.integrity}</b></span><span>Uptime<b>{scores.uptime}</b></span></div><p className="score-explanation"><b>Score note:</b> Lower category scores reflect blocked choices and recovery time. {exceptionCount} blocked attempt{exceptionCount === 1 ? "" : "s"}.</p><div className="lesson-card"><b>System insight</b><p>{isBet ? 'A clean number is only trustworthy when service state, sample preparation, method context, and control evidence agree.' : 'Recovery is not merely making equipment move again; it is preserving history, controlling material, and restoring truthful system state.'}</p></div><p className="debrief-meta">{logCount} run events captured · all critical evidence retained</p><button className="modal-run" type="button" onClick={onDeck}>CHOOSE ANOTHER INCIDENT</button></ModalShell>;
}

function Task({ number, title, note, status, onClick }: { number: string; title: string; note: string; status: 'done' | 'active' | 'pending'; onClick?: () => void }) { const content = <><span>{status === 'done' ? '✓' : number}</span><div><b>{title}</b><small>{note}</small></div></>; return <li className={status}>{onClick ? <button type="button" onClick={onClick}>{content}</button> : content}</li>; }
function Score({ label, value }: { label: string; value: number }) { return <div className="score-row"><div><span>{label}</span><b>{value}</b></div><div className="score-track"><i style={{ width: `${value}%` }} /></div></div>; }
function LedgerDrawer({ log, onClose }: { log: LogItem[]; onClose: () => void }) { return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="ledger-drawer" role="dialog" aria-modal="true" aria-label="Event ledger" onClick={(event) => event.stopPropagation()}><header><div><p className="section-kicker">RUN RECORD</p><h2>Event ledger</h2></div><button type="button" onClick={onClose} aria-label="Close event ledger">×</button></header><p className="drawer-intro">A chronological record of operator checks, equipment state, material exceptions, results, and decisions.</p><ol>{[...log].reverse().map((item, index) => <li key={`${item.time}-${index}`}><time>{item.time}</time><i className={item.type}>{item.type}</i><p>{item.text}</p></li>)}</ol></aside></div>; }
