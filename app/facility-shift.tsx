'use client';

import { useEffect, useMemo, useState } from 'react';
import { DebriefVisual } from './debrief-visual';
import { CampaignControlModal } from './campaign-control';
import { SystemsAtlasModal } from './systems-atlas';
import { LabViewport } from './lab-viewport';
import { PlannerPanel, ShiftDeckModal, type ScenarioId } from './scenario-shifts';
import { baseStations, type Station } from './sim-data';
import { StationAccess } from './station-access';

type Scores = { safety: number; traceability: number; integrity: number; uptime: number };
type LogItem = { time: string; type: string; text: string };
type Modal = 'deck' | 'guide' | 'campaign' | 'campaign-facility' | 'move' | 'gas' | 'control' | 'evidence' | 'complete' | null;

const tasks = [
  { title: 'Read transfer handoff', pending: 'MOV-3024 assigned', done: 'Move + gas scope read' },
  { title: 'Reconcile load + identity', pending: 'Two totes at bay', done: 'LOT-3024-A secured' },
  { title: 'Execute controlled move', pending: 'Route held', done: 'Receiving bay occupied' },
  { title: 'Prove gas-service boundary', pending: 'GAS-41 changeover', done: 'Identity + isolation proven' },
  { title: 'Run post-change control', pending: 'Reference waiting', done: 'Control inside band' },
  { title: 'Gate AI eligibility', pending: 'Mixed service window', done: 'Transition data held' },
];

const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function FacilityShift({ onSwitch }: { onSwitch: (id: ScenarioId) => void }) {
  const [phase, setPhase] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedId, setSelectedId] = useState('PREP-01');
  const [minute, setMinute] = useState(11 * 60 + 34);
  const [log, setLog] = useState<LogItem[]>([
    { time: '11:21', type: 'handoff', text: 'MOV-3024 opened for a dry-powder tote transfer; two physically similar totes remain in the staging bay.' },
    { time: '11:29', type: 'system', text: 'BET-02 gas service GAS-40 exhausted; GAS-41 connected but not accepted by laboratory operations.' },
  ]);
  const [logOpen, setLogOpen] = useState(false);
  const [moveChecks, setMoveChecks] = useState<Record<string, boolean>>({});
  const [scanned, setScanned] = useState(false);
  const [gasChecks, setGasChecks] = useState<Record<string, boolean>>({});
  const [leakRan, setLeakRan] = useState(false);
  const [controlChecks, setControlChecks] = useState<Record<string, boolean>>({});
  const [controlRan, setControlRan] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [scores, setScores] = useState<Scores>({ safety: 82, traceability: 71, integrity: 74, uptime: 78 });
  const [physicalInspections, setPhysicalInspections] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const openCampaign = (event: Event) => setModal((event as CustomEvent<{ view?: string }>).detail?.view === 'facility' ? 'campaign-facility' : 'campaign');
    window.addEventListener('mattershift:open-campaign', openCampaign);
    return () => window.removeEventListener('mattershift:open-campaign', openCampaign);
  }, []);

  useEffect(() => {
    const retainStationEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; text?: string }>).detail;
      if (!detail?.text) return;
      const next = minute + 1;
      setMinute(next);
      setLog((items) => [...items, { time: formatTime(next), type: detail.type ?? 'control', text: detail.text as string }]);
    };
    window.addEventListener('mattershift:station-event', retainStationEvent);
    return () => window.removeEventListener('mattershift:station-event', retainStationEvent);
  }, [minute]);

  const stations = useMemo(() => baseStations.map((station): Station => {
    if (station.id === 'PREP-01') {
      if (phase === 0) return { ...station, state: 'MOVE HOLD', tone: 'warn', meta: 'Two totes · identity unresolved', technicianView: ['Move ticket: MOV-3024', 'Target: LOT-3024-A', 'Staging bay: 2 totes', 'Powered jack: pre-use due'] };
      if (phase === 1) return { ...station, state: 'TRANSFER READY', tone: 'ready', meta: 'LOT-3024-A · load secured', technicianView: ['Target: LOT-3024-A', 'Gross load: 184 kg', 'Carrier restraint: proven', 'Aisle route: clear'] };
      return { ...station, state: 'BAY RELEASED', tone: 'ready', meta: 'Transfer receipt linked', technicianView: ['Move: MOV-3024', 'Departure scan: linked', 'Spill check: clear', 'Staging bay: available'] };
    }
    if (station.id === 'ROBO-02' && phase === 1) return { ...station, state: 'AISLE HOLD', tone: 'hold', meta: 'Material move has priority', technicianView: ['Cell boundary: closed', 'Robot: parked', 'Cross-aisle: reserved', 'Move MOV-3024: active'] };
    if (station.id === 'BET-02') {
      if (phase < 2) return { ...station, state: 'RECEIVING HOLD', tone: 'hold', meta: 'Bay + utility release pending', technicianView: ['Sample ports: isolated', 'Gas service: GAS-41', 'Lab acceptance: pending', 'Receiving bay: clear'] };
      if (phase === 2) return { ...station, state: 'UTILITY HOLD', tone: 'warn', meta: 'GAS-41 not yet proven', technicianView: ['Cylinder: GAS-41', 'Declared gas: N₂ 5.0', 'Isolation boundary: pending', 'Automated leak check: due'] };
      if (phase === 3) return { ...station, state: 'QC READY', tone: 'ready', meta: 'Service boundary accepted', technicianView: ['Gas identity: N₂ 5.0', 'Leak rate: 0.7 µbar·L/s', 'Ports: isolated', 'Reference: ALU-21 ready'] };
      if (phase === 4) return { ...station, state: 'DATA REVIEW', tone: 'warn', meta: 'Service transition in batch window', technicianView: ['Reference: 181 m²/g', 'Control band: 173–191 m²/g', 'Transition samples: 2', 'AI eligibility: review'] };
      return { ...station, state: 'READY', tone: 'ready', meta: 'Post-change window released', technicianView: ['Reference: in control', 'Transition points: excluded', 'Post-proof samples: eligible', 'AI export: bounded'] };
    }
    return station;
  }), [phase]);

  const selectedBase = stations.find((station) => station.id === selectedId) ?? stations[0];
  const selected = selectedBase;
  const completed = phase >= 5 ? 6 : phase + 1;
  const progress = Math.round(completed / 6 * 100);
  const appendLog = (type: string, text: string, add = 0) => { const next = minute + add; setMinute(next); setLog((items) => [...items, { time: formatTime(next), type, text }]); };
  const penalize = (key: keyof Scores, amount: number) => setScores((value) => ({ ...value, [key]: Math.max(0, value[key] - amount) }));
  const reward = (updates: Partial<Scores>) => setScores((value) => ({ safety: Math.min(100, updates.safety ?? value.safety), traceability: Math.min(100, updates.traceability ?? value.traceability), integrity: Math.min(100, updates.integrity ?? value.integrity), uptime: Math.min(100, updates.uptime ?? value.uptime) }));
  const recordInspection = (stationId: string, inspectionChecks: string[]) => {
    const wasComplete = (physicalInspections[stationId]?.length ?? 0) === 3;
    setPhysicalInspections((current) => ({ ...current, [stationId]: inspectionChecks }));
    if (!wasComplete && inspectionChecks.length === 3) appendLog('inspection', `${stationId} physical walkaround completed; ${inspectionChecks.join(', ')} retained with the shift record.`, 1);
  };
  const open = (next: Modal, stationId = selectedId) => { setFeedback(''); setModal(next); setSelectedId(stationId); };

  const finishMove = (correct: boolean) => {
    if (!correct) { penalize('traceability', 18); penalize('safety', 8); setFeedback('The electronic move ticket cannot transfer identity onto a neighboring physical tote. The move remains blocked.'); appendLog('exception', 'Attempted to relabel the adjacent tote from MOV-3024 without physical lot reconciliation; transfer blocked.', 2); return; }
    setPhase(1); reward({ safety: scores.safety + 10, traceability: scores.traceability + 16 }); appendLog('lineage', 'LOT-3024-A physically scanned, carrier restraint verified, and powered-jack route released for MOV-3024.', 6); window.setTimeout(() => setModal(null), 650);
  };
  const executeMove = () => { setPhase(2); setSelectedId('BET-02'); reward({ uptime: scores.uptime + 5 }); appendLog('transfer', 'LOT-3024-A departure and arrival scans linked; pallet jack parked with forks lowered and receiving bay occupied.', 9); };
  const finishGas = (correct: boolean) => {
    if (!correct) { penalize('safety', 17); penalize('integrity', 10); setFeedback('Cylinder color and supply pressure are not identity or boundary evidence. The analyzer remains isolated.'); appendLog('exception', 'Attempted GAS-41 acceptance from cylinder color and pressure alone; service release blocked.', 2); return; }
    setPhase(3); reward({ safety: scores.safety + 12, integrity: scores.integrity + 8 }); appendLog('control', 'GAS-41 physical service tag, certificate link, isolation proof, and automated leak result accepted as one boundary record.', 11); window.setTimeout(() => setModal(null), 650);
  };
  const acquireControl = () => { setFeedback(''); setControlRan(true); appendLog('measurement', 'ALU-21 post-change adsorption isotherm acquired under the accepted GAS-41 boundary; native pressure, dose, and equilibrium records retained.', 38); };
  const finishControl = (correct: boolean) => {
    if (!correct) { penalize('integrity', 14); setFeedback('A certificate supports reference-material identity and assigned value; it is not a current analyzer-control measurement. The post-change window remains held.'); appendLog('exception', 'Prior ALU-21 certificate value offered in place of a current BET-02 control acquisition; release blocked.', 2); return; }
    setPhase(4); setSelectedId('BET-02'); reward({ uptime: scores.uptime + 7, integrity: scores.integrity + 6 }); appendLog('qc', 'Post-change ALU-21 reference completed at 181 m²/g inside the 173–191 m²/g control band; native isotherm and governed fit retained.', 4); setFeedback(''); setModal('evidence');
  };
  const finishEvidence = (correct: boolean) => {
    if (!correct) { penalize('integrity', 19); setFeedback('A passing reference proves the post-change state; it does not retroactively validate samples measured across the service transition.'); appendLog('exception', 'Mixed pre-proof and post-proof adsorption results offered to the planner as one comparable batch; export blocked.', 3); return; }
    setPhase(5); reward({ integrity: scores.integrity + 15, traceability: scores.traceability + 5 }); appendLog('decision', 'Two service-transition results held; post-proof window released to the planner with GAS-41 and ALU-21 evidence attached.', 5); setFeedback(''); setModal('complete');
  };

  const actions = [() => open('move', 'PREP-01'), executeMove, () => open('gas', 'BET-02'), () => open('control', 'BET-02'), () => open('evidence', 'BET-02'), () => open('complete')];
  const action = getFacilityAction(phase, actions);

  return <main className="shell scenario-shell scenario-facility" style={{ '--scenario-accent': '#68d4ad' } as React.CSSProperties}>
    <header className="topbar"><div className="brand-block"><span className="brand-mark">M<span>²</span></span><div><p className="eyebrow">Materials operations simulator</p><h1>SHIFT CONSOLE <span>{'// LAB 04'}</span></h1></div></div><div className="shift-readout"><span className="live-dot" /><div><b>DAY SHIFT</b><small>{formatTime(minute)} · MENLO PARK SIM</small></div></div><div className="header-actions"><button className="campaign-button" type="button" onClick={() => setModal('campaign')}>CAMPAIGN LAB</button><button className="deck-button" type="button" onClick={() => setModal('deck')}>SHIFT DECK <span>5</span></button><button type="button" onClick={() => setModal('guide')}>SYSTEMS ATLAS</button><button type="button" onClick={() => setLogOpen(true)}>EVENT LEDGER <span>{log.length}</span></button><div className="operator-chip"><span>LC</span><b>TECH-07</b></div></div></header>
    <div className="workspace"><aside className="left-rail"><section className="rail-section shift-card"><p className="section-kicker">ACTIVE WORK ORDER</p><div className="wo-title"><span>WO-3024</span><em>{phase === 4 ? 'DATA GATE' : phase >= 5 ? 'CLOSED' : 'CONTROLLED MOVE'}</em></div><h2>Gas-service changeover</h2><p>Move the correct powder lot, prove the analyzer utility boundary, and keep transition data out of the AI loop.</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-meta"><span>{completed} / 6 tasks</span><span>{progress}%</span></div></section><section className="rail-section"><p className="section-kicker">SHIFT CHECKLIST</p><ol className="task-list">{tasks.map((task, index) => { const done = index === 0 || phase >= index; const active = !done && index === phase + 1; const fn = index > 0 ? actions[index - 1] : undefined; return <Task key={task.title} number={`0${index + 1}`} title={task.title} note={done ? task.done : task.pending} status={done ? 'done' : active ? 'active' : 'pending'} onClick={active ? fn : undefined} />; })}</ol></section><section className="rail-section handoff-note"><div className="section-title-row"><p className="section-kicker">SHIFT HANDOFF</p><span>3 SIGNALS</span></div><div className="handoff-grid"><div><span>MOVE</span><b>3024</b><small>two totes staged</small></div><div><span>SERVICE</span><b>GAS-41</b><small>acceptance pending</small></div><div><span>QUEUE</span><b>6</b><small>samples waiting</small></div></div></section><section className="rail-section system-boundary"><p className="section-kicker">CONTROL BOUNDARY</p><div><span>PHYSICAL</span><i>tote, restraint, jack + gas tag</i></div><div><span>SCADA</span><i>isolation, pressure + leak proof</i></div><div><span>LIMS</span><i>lot, move, service + result window</i></div></section></aside>
      <section className="lab-view"><div className="lab-heading"><div><p className="section-kicker">LIVE FACILITY MAP</p><h2>High-throughput materials bay</h2></div><div className="legend"><span><i className="ready" />ready</span><span><i className="run" />active</span><span><i className="warn" />attention</span></div></div><LabViewport stations={stations} selectedId={selectedId} phase={phase} scenarioId="facility" inspectionState={physicalInspections} onInspectionChange={recordInspection} onSelect={setSelectedId} /><footer className="facility-footer"><div><span>ENV</span><b>22.0 °C</b><small>40% RH</small></div><div><span>AISLE</span><b>{phase === 1 ? 'RESERVED' : 'CLEAR'}</b><small>route A-2</small></div><div><span>GAS DETECTION</span><b>NORMAL</b><small>6 / 6 online</small></div><div><span>MES MOVES</span><b>{phase >= 2 ? '1' : '2'}</b><small>{phase >= 5 ? '0 held' : '1 controlled'}</small></div></footer></section>
      <aside className="right-rail"><section className={`rail-section alert-card tone-${action.tone}`}><div className="alert-head"><span>{action.tag}</span><b>{phase >= 5 ? 'CLOSED' : phase === 4 ? 'REVIEW' : 'ACTIVE'}</b></div><h2>{action.title}</h2><div className="metric-row"><span>Current state</span><strong>{action.metric}</strong></div><p>{action.body}</p><button className="primary-action" type="button" onClick={action.fn}>{action.label}<span>→</span></button></section><section className="rail-section station-inspector"><div className="section-title-row"><p className="section-kicker">STATION INSPECTOR</p><span className={selected.tone}>{selected.state}</span></div><div className="station-identity"><b>{selected.id}</b><h2>{selected.name}</h2></div><div className="readout-list">{selected.technicianView.map((item) => { const [key, value] = item.split(': '); return <div key={item}><span>{key}</span><b>{value}</b></div>; })}</div><p className="mini-label">OUTPUTS</p><div className="tag-list">{selected.dataProducts.map((item) => <span key={item}>{item}</span>)}</div><StationAccess station={selected} scenarioId="facility" physicalChecks={physicalInspections[selected.id] ?? []} /></section><PlannerPanel scenario="facility" phase={phase} /><section className="rail-section score-panel"><div className="section-title-row"><p className="section-kicker">SHIFT HEALTH</p><span>LIVE</span></div><Score label="Safety" value={scores.safety} /><Score label="Traceability" value={scores.traceability} /><Score label="Data integrity" value={scores.integrity} /><Score label="Lab uptime" value={scores.uptime} /></section><section className="rail-section lineage-card"><div className="section-title-row"><p className="section-kicker">EVIDENCE CHAIN</p><span>LIVE</span></div><div className="lineage-flow"><span>LOT-3024-A</span><i>→</i><span>GAS-41</span><i>→</i><span>{phase >= 5 ? 'BOUNDED' : phase >= 3 ? 'PROVEN' : 'HOLD'}</span></div><p>{phase >= 5 ? 'Only the post-proof measurement window is AI-eligible.' : phase >= 4 ? 'Reference is in control; result-window eligibility remains open.' : phase >= 3 ? 'Physical service and SCADA evidence agree; control result required.' : 'Material identity and utility state remain independent gates.'}</p></section></aside></div>
    {modal === 'deck' && <ShiftDeckModal active="facility" onChoose={onSwitch} onClose={() => setModal(null)} />}
    {modal === 'guide' && <SystemsAtlasModal onClose={() => setModal(null)} />}
    {(modal === 'campaign' || modal === 'campaign-facility') && <CampaignControlModal autoOpenFacility={modal === 'campaign-facility'} onClose={() => setModal(null)} />}
    {modal === 'move' && <MoveBayModal checks={moveChecks} setChecks={setMoveChecks} scanned={scanned} setScanned={setScanned} feedback={feedback} appendLog={appendLog} onFinish={finishMove} onClose={() => setModal(null)} />}
    {modal === 'gas' && <GasBoundaryModal checks={gasChecks} setChecks={setGasChecks} leakRan={leakRan} setLeakRan={setLeakRan} feedback={feedback} appendLog={appendLog} onFinish={finishGas} onClose={() => setModal(null)} />}
    {modal === 'control' && <BetControlModal checks={controlChecks} setChecks={setControlChecks} acquired={controlRan} onAcquire={acquireControl} feedback={feedback} onFinish={finishControl} onClose={() => setModal(null)} />}
    {modal === 'evidence' && <FacilityEvidenceModal feedback={feedback} onFinish={finishEvidence} onClose={() => setModal(null)} />}
    {modal === 'complete' && <FacilityCompleteModal scores={scores} logCount={log.length} exceptionCount={log.filter((event) => event.type === 'exception').length} onDeck={() => setModal('deck')} onClose={() => setModal(null)} />}
    {logOpen && <LedgerDrawer log={log} onClose={() => setLogOpen(false)} />}
  </main>;
}

function getFacilityAction(phase: number, actions: (() => void)[]) {
  return [
    { tag: 'MOVE CONTROL', title: 'Two totes occupy the bay', metric: '1 valid load', body: 'The move ticket, physical tote, carrier restraint, and aisle route must agree before power travel is released.', label: 'OPEN MOVE BAY', fn: actions[0], tone: 'warn' },
    { tag: 'TRANSFER READY', title: 'LOT-3024-A secured', metric: '184 kg', body: 'The correct tote is bound and the cross-aisle is reserved. Retain both departure and arrival state.', label: 'EXECUTE CONTROLLED MOVE', fn: actions[1], tone: 'ready' },
    { tag: 'UTILITY CONTROL', title: 'GAS-41 awaits acceptance', metric: 'N₂ 5.0', body: 'Physical gas identity, the isolated analyzer boundary, and automated leak evidence are separate proofs.', label: 'OPEN GAS MANIFOLD', fn: actions[2], tone: 'warn' },
    { tag: 'MEASUREMENT CONTROL', title: 'Post-change reference ready', metric: 'ALU-21', body: 'A control material establishes the comparable measurement window after the service transition.', label: 'RUN CONTROL REFERENCE', fn: actions[3], tone: 'ready' },
    { tag: 'DATA ELIGIBILITY', title: 'Batch crosses service state', metric: '2 transition runs', body: 'A passing post-change control does not retroactively validate results acquired across the boundary.', label: 'REVIEW AI PAYLOAD', fn: actions[4], tone: 'warn' },
    { tag: 'SHIFT COMPLETE', title: 'Transfer + service bounded', metric: '6 / 6', body: 'Material, utility, control, and result-window evidence remain linked for future interpretation.', label: 'VIEW DEBRIEF', fn: actions[5], tone: 'ready' },
  ][phase] ?? { tag: 'SHIFT COMPLETE', title: 'Transfer + service bounded', metric: '6 / 6', body: 'The controlled move is complete.', label: 'VIEW DEBRIEF', fn: actions[5], tone: 'ready' };
}

function MoveBayModal({ checks, setChecks, scanned, setScanned, feedback, appendLog, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; scanned: boolean; setScanned: (value: boolean) => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['power', 'Power, brake + emergency-reverse state'], ['forks', 'Forks, load wheels + capacity'], ['restraint', 'Tote restraint + pallet condition'], ['route', 'Aisle, door + receiving bay clear']];
  const ready = scanned && items.every(([key]) => checks[key]);
  const scan = () => { setScanned(true); appendLog('scan', 'Move-bay scan: north tote LOT-3024-B; south tote LOT-3024-A matches MOV-3024.', 2); };
  return <ModalShell title="Powered material-move bay" kicker="MES MOVE EXECUTION · MOV-3024" onClose={onClose} wide><div className="facility-workbench"><div className="facility-visual-panel"><div className="panel-heading"><span>STAGING BAY · ROUTE A-2</span><b>{ready ? 'LOAD RELEASE READY' : 'POWER TRAVEL HELD'}</b></div><MoveBayVisual scanned={scanned} checks={checks} /><div className="facility-indicator-strip"><span className={checks.power ? 'ok' : ''}>DRIVE</span><span className={checks.forks ? 'ok' : ''}>FORKS</span><span className={checks.restraint ? 'ok' : ''}>LOAD</span><span className={checks.route ? 'ok' : ''}>ROUTE</span><span className={scanned ? 'ok' : ''}>LOT</span></div></div><div className="facility-control-panel"><p className="modal-intro">Verify the real load and path before the digital move is allowed to follow it.</p><div className="compact-checks">{items.map(([key, label]) => <label key={key} className={checks[key] ? 'checked' : ''}><input type="checkbox" checked={Boolean(checks[key])} onChange={() => setChecks((value) => ({ ...value, [key]: !value[key] }))} /><i>{checks[key] ? '✓' : ''}</i><b>{label}</b></label>)}</div><button className="modal-run" type="button" disabled={scanned} onClick={scan}>{scanned ? 'PHYSICAL TAGS READ' : 'SCAN BOTH TOTE TAGS'}</button>{scanned && <div className="scan-result"><span>MOV-3024 TARGET</span><b>LOT-3024-A · SOUTH BAY</b><i>PHYSICAL MATCH</i></div>}{ready && <div className="decision-stack"><button type="button" onClick={() => onFinish(true)}>Bind south tote · release move</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Relabel north tote from ticket</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}<p className="concept-note">Simulation boundary · real material handling remains governed by site authorization, equipment manuals, and EHS controls.</p></ModalShell>;
}

function MoveBayVisual({ scanned, checks }: { scanned: boolean; checks: Record<string, boolean> }) {
  return <svg className="move-bay-svg" viewBox="0 0 620 360" role="img" aria-label="Powered pallet jack, two staged powder totes, and controlled aisle route">
    <defs><linearGradient id="bayFloor" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#233442" /><stop offset="1" stopColor="#0b131b" /></linearGradient><linearGradient id="jackMetal" x1="0" x2="1"><stop stopColor="#477264" /><stop offset=".5" stopColor="#8caa9f" /><stop offset="1" stopColor="#294b42" /></linearGradient></defs>
    <path d="M45 55H575V305H45Z" fill="url(#bayFloor)" stroke="#405565" /><path d="M80 80H540V278H80Z" fill="none" stroke={checks.route ? '#68d4ad' : '#7b6135'} strokeWidth="3" strokeDasharray="12 10" />
    <path d="M170 239H485" stroke="#89a69d" strokeWidth="28" opacity=".12" /><path d="M170 239H485" stroke={checks.route ? '#68d4ad' : '#b48945'} strokeWidth="3" strokeDasharray="9 8" />
    <g transform="translate(110 112)"><rect width="126" height="18" y="102" rx="3" fill="#866c45" /><rect x="11" width="104" height="104" rx="18" fill="#b4b9b2" stroke="#dce1db" /><path d="M37 0V-16H89V0" fill="#51635f" /><rect x="28" y="34" width="70" height="38" fill="#e6e6d8" /><path d="M34 49H92" stroke={scanned ? '#d89b5d' : '#707a78'} strokeWidth="6" /><text x="63" y="61" textAnchor="middle">{scanned ? 'LOT-3024-B' : 'SCAN'}</text><circle cx="18" cy="129" r="8" fill="#283239" /><circle cx="108" cy="129" r="8" fill="#283239" /></g>
    <g transform="translate(374 112)"><rect width="126" height="18" y="102" rx="3" fill={checks.restraint ? '#55735f' : '#866c45'} /><rect x="11" width="104" height="104" rx="18" fill="#b4b9b2" stroke={scanned ? '#68d4ad' : '#dce1db'} strokeWidth={scanned ? 3 : 1} /><path d="M37 0V-16H89V0" fill="#51635f" /><rect x="28" y="34" width="70" height="38" fill="#e6e6d8" /><path d="M34 49H92" stroke={scanned ? '#68d4ad' : '#707a78'} strokeWidth="6" /><text x="63" y="61" textAnchor="middle">{scanned ? 'LOT-3024-A' : 'SCAN'}</text><circle cx="18" cy="129" r="8" fill="#283239" /><circle cx="108" cy="129" r="8" fill="#283239" /></g>
    <g transform="translate(265 222)"><path d="M0 0H133V14H0Z" fill="url(#jackMetal)" /><path d="M8 4H112M8 11H112" stroke="#c8dad3" /><path d="M13 0L-18-72" stroke="url(#jackMetal)" strokeWidth="13" strokeLinecap="round" /><path d="M-17-73L-5-111" stroke="#59796f" strokeWidth="15" strokeLinecap="round" /><rect x="-35" y="-121" width="62" height="34" rx="13" fill="#233932" stroke="#6d9386" /><circle cx="12" cy="20" r="11" fill="#10161b" stroke="#56666d" /><circle cx="120" cy="20" r="8" fill="#10161b" stroke="#56666d" /><circle cx="-7" cy="-104" r="4" fill={checks.power && checks.forks ? '#68d4ad' : '#d39a4d'} /></g>
    <text x="64" y="44">STAGING NORTH</text><text x="458" y="44">RECEIVING →</text><text x="310" y="330" textAnchor="middle">CONTROLLED AISLE A-2 · {checks.route ? 'CLEAR' : 'VERIFY ROUTE'}</text>
  </svg>;
}

function GasBoundaryModal({ checks, setChecks, leakRan, setLeakRan, feedback, appendLog, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; leakRan: boolean; setLeakRan: (value: boolean) => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['identity', 'Physical service tag ↔ certificate'], ['isolation', 'Analyzer isolation proof retained'], ['trend', 'SCADA pressure trend stable']];
  const all = items.every(([key]) => checks[key]);
  const runLeak = () => { setLeakRan(true); appendLog('qc', 'Automated GAS-41 isolated-boundary leak check retained: 0.7 µbar·L/s; acceptance limit < 2.0.', 7); };
  return <ModalShell title="Gas-service acceptance console" kicker="UTILITY BOUNDARY · BET-02 / GAS-41" onClose={onClose} wide><div className="facility-workbench gas-workbench"><div className="facility-visual-panel"><div className="panel-heading"><span>MANIFOLD MFD-2 · ISOLATED TEST</span><b>{leakRan ? 'BOUNDARY PROVEN' : 'ANALYZER HELD'}</b></div><GasManifoldVisual checks={checks} leakRan={leakRan} /><div className="gas-readout"><span>SUPPLY<b>{checks.trend ? '2.08 bar' : '—'}</b></span><span>DECAY<b>{leakRan ? '0.7 µbar·L/s' : '—'}</b></span><span>LIMIT<b>&lt; 2.0</b></span></div></div><div className="facility-control-panel"><p className="modal-intro">Accept the service as a linked physical and control-system boundary—not by cylinder color.</p><div className="compact-checks">{items.map(([key, label]) => <label key={key} className={checks[key] ? 'checked' : ''}><input type="checkbox" checked={Boolean(checks[key])} onChange={() => setChecks((value) => ({ ...value, [key]: !value[key] }))} /><i>{checks[key] ? '✓' : ''}</i><b>{label}</b></label>)}</div><button className="modal-run" type="button" disabled={!all || leakRan} onClick={runLeak}>{leakRan ? 'LEAK EVIDENCE RETAINED' : 'RUN AUTOMATED ISOLATED LEAK CHECK'}</button>{leakRan && <div className="decision-stack"><button type="button" onClick={() => onFinish(true)}>Accept GAS-41 boundary record</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Accept from cylinder color + pressure</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}<p className="concept-note">Simulation boundary · site-specific gas, pressure, and hazardous-energy procedures remain authoritative.</p></ModalShell>;
}

function GasManifoldVisual({ checks, leakRan }: { checks: Record<string, boolean>; leakRan: boolean }) {
  return <svg className="gas-manifold-svg" viewBox="0 0 620 360" role="img" aria-label="Gas cylinder bank, isolated manifold, analyzer boundary, gauges, and leak check trend">
    <defs><linearGradient id="cyl" x1="0" x2="1"><stop stopColor="#263a44" /><stop offset=".5" stopColor="#97a6a7" /><stop offset="1" stopColor="#21333c" /></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
    <path d="M160 91H494V240H160Z" fill="#0a141c" stroke="#314657" /><path d="M160 115H494M160 186H494" stroke="#1d3141" /><path d="M185 151H455" stroke={checks.isolation ? '#68d4ad' : '#647784'} strokeWidth="8" /><path d="M185 151H455" stroke="#15242d" strokeWidth="3" strokeDasharray="8 6" />
    {[88, 134].map((x, index) => <g key={x} transform={`translate(${x} 85)`}><rect x="-22" y="25" width="44" height="158" rx="19" fill="url(#cyl)" stroke={index === 1 && checks.identity ? '#68d4ad' : '#71838a'} strokeWidth={index === 1 && checks.identity ? 3 : 1} /><path d="M-11 27V12H11V27" fill="#60747b" /><circle cy="8" r="8" fill="#273a41" /><rect x="-16" y="91" width="32" height="38" fill="#e4e3d5" /><text y="107" textAnchor="middle">{index ? 'GAS-41' : 'GAS-40'}</text><text y="119" textAnchor="middle">{index ? 'N₂ 5.0' : 'EMPTY'}</text></g>)}
    {[220, 305, 390].map((x, index) => <g key={x} transform={`translate(${x} 151)`}><circle r="17" fill="#111e28" stroke={checks.isolation || index === 0 ? '#68d4ad' : '#71818d'} strokeWidth="3" /><path d="M-10-10L10 10M10-10L-10 10" stroke="#9aacb1" strokeWidth="4" /><text y="43" textAnchor="middle">{['SOURCE', 'TEST', 'PORTS'][index]}</text></g>)}
    <g transform="translate(492 151)"><rect x="-37" y="-47" width="82" height="94" rx="8" fill="#26343f" stroke={leakRan ? '#68d4ad' : '#7f8e93'} /><circle cx="4" cy="-12" r="22" fill="#09131a" stroke="#687c83" /><path d="M4-12L16-25" stroke={leakRan ? '#68d4ad' : '#d0a252'} strokeWidth="3" /><rect x="-18" y="22" width="44" height="11" fill="#081217" /><path d="M-13 28H21" stroke={leakRan ? '#68d4ad' : '#66767e'} /><text x="4" y="68" textAnchor="middle">BET-02</text></g>
    <g transform="translate(183 276)"><path d="M0 28H360" stroke="#354a58" /><path d={leakRan ? 'M0 3 C70 5 103 18 150 22 S270 25 360 25' : checks.trend ? 'M0 3 C60 5 105 8 170 9 S285 10 360 10' : 'M0 25H360'} fill="none" stroke={leakRan ? '#68d4ad' : '#d0a252'} strokeWidth="3" filter="url(#glow)" /><text x="0" y="48">ISOLATED PRESSURE DECAY</text><text x="360" y="48" textAnchor="end">{leakRan ? 'PASS · 0.7 µbar·L/s' : 'AWAITING TEST'}</text></g>
  </svg>;
}

function BetControlModal({ checks, setChecks, acquired, onAcquire, feedback, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; acquired: boolean; onAcquire: () => void; feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['identity', 'ALU-21 physical reference ↔ LIMS lot'], ['prep', 'Pretreatment + dry-mass record current'], ['boundary', 'GAS-41 boundary + analysis port linked']];
  const ready = items.every(([key]) => checks[key]);
  return <ModalShell title="Post-change BET control" kicker="MEASUREMENT CONTROL · BET-02 / ALU-21" onClose={onClose} wide><div className="facility-workbench bet-control-workbench"><div className="facility-visual-panel"><div className="panel-heading"><span>ADSORPTION ISOTHERM · GOVERNED METHOD</span><b>{acquired ? 'CONTROL PASS' : ready ? 'ACQUISITION READY' : 'MEASUREMENT HELD'}</b></div><BetControlVisual acquired={acquired} /><div className="gas-readout bet-control-readout"><span>REFERENCE<b>ALU-21</b></span><span>RESULT<b>{acquired ? '181 m²/g' : '—'}</b></span><span>BAND<b>173–191</b></span></div></div><div className="facility-control-panel"><p className="modal-intro">Establish a post-service measurement boundary with a current control—not a certificate value copied forward.</p><div className="compact-checks">{items.map(([key, label]) => <label key={key} className={checks[key] ? 'checked' : ''}><input type="checkbox" checked={Boolean(checks[key])} onChange={() => setChecks((value) => ({ ...value, [key]: !value[key] }))} /><i>{checks[key] ? '✓' : ''}</i><b>{label}</b></label>)}</div><button className="modal-run" type="button" disabled={!ready || acquired} onClick={onAcquire}>{acquired ? 'NATIVE ISOTHERM RETAINED' : 'ACQUIRE ALU-21 CONTROL'}</button>{!acquired && <button className="control-certificate-shortcut" type="button" onClick={() => onFinish(false)}>Use certificate value as current control</button>}{acquired && <div className="control-verdict"><span>METHOD FIT</span><b>QUALITY CRITERIA MET</b><i>IN CONTROL</i></div>}{acquired && <div className="decision-stack"><button type="button" onClick={() => onFinish(true)}>Retain control · review result window</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}<p className="concept-note">Simulation boundary · preparation, dosing, equilibrium, and acceptance criteria remain method- and instrument-specific.</p></ModalShell>;
}

function BetControlVisual({ acquired }: { acquired: boolean }) {
  const points = [[72,270],[105,254],[137,232],[169,202],[204,164],[240,132],[278,106],[320,86],[366,72],[416,61],[470,52]];
  return <svg className="bet-control-svg" viewBox="0 0 620 360" role="img" aria-label={acquired ? 'ALU-21 adsorption isotherm and method-controlled BET fit window, result 181 square metres per gram inside control limits' : 'Empty adsorption isotherm acquisition grid awaiting ALU-21 control'}>
    <defs><linearGradient id="betBand" x1="0" x2="1"><stop stopColor="#375f6c" stopOpacity=".16" /><stop offset="1" stopColor="#68d4ad" stopOpacity=".28" /></linearGradient><filter id="pointGlow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
    <path className="grid" d="M56 36H510M56 88H510M56 140H510M56 192H510M56 244H510M56 296H510M56 36V296M132 36V296M208 36V296M284 36V296M360 36V296M436 36V296M510 36V296" />
    <path d="M56 296H530M56 296V24" className="axis" />
    <rect x="116" y="36" width="146" height="260" fill="url(#betBand)" stroke="#4f8b87" strokeDasharray="6 5" opacity={acquired ? 1 : .35} />
    {acquired && <><path className="isotherm-line" d={`M${points.map(([x,y]) => `${x} ${y}`).join('L')}`} />{points.map(([x,y], index) => <circle key={index} className="isotherm-point" cx={x} cy={y} r={index > 7 ? 5 : 4} filter="url(#pointGlow)" />)}<path className="fit-line" d="M126 239L250 118" /></>}
    {!acquired && <path className="awaiting-trace" d="M72 270H470" />}
    <text x="58" y="20">QUANTITY ADSORBED</text><text x="530" y="320" textAnchor="end">RELATIVE PRESSURE →</text><text x="189" y="55" textAnchor="middle">METHOD FIT WINDOW</text>
    <g transform="translate(535 72)"><rect width="64" height="180" rx="5" fill="#0b151c" stroke="#314858" /><rect x="18" y="25" width="28" height="125" fill="#182a31" /><rect x="18" y="58" width="28" height="60" fill="#245443" opacity=".8" /><path d="M10 90H54" stroke={acquired ? '#68d4ad' : '#6c7b82'} strokeWidth="3" /><circle cx="32" cy={acquired ? 86 : 138} r="7" fill={acquired ? '#68d4ad' : '#d0a252'} /><text x="32" y="166" textAnchor="middle">QC BAND</text></g>
  </svg>;
}

function FacilityEvidenceModal({ feedback, onFinish, onClose }: { feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  return <ModalShell title="Service-transition evidence gate" kicker="AI ELIGIBILITY · BET BATCH GAS-41" onClose={onClose} wide><div className="transition-evidence"><div className="transition-chart"><div className="panel-heading"><span>CONTROL + SERVICE STATE</span><b>TIME-ALIGNED EVIDENCE</b></div><ServiceTransitionChart /><div className="transition-legend"><span><i className="pre" />PRE-PROOF</span><span><i className="control" />ALU-21</span><span><i className="post" />POST-PROOF</span></div></div><aside className="transition-window"><span>AI EXPORT WINDOW</span><div className="window-row held"><i>01</i><b>RUNS ADS-401 / 402</b><em>TRANSITION · HOLD</em></div><div className="window-row control"><i>02</i><b>ALU-21 · 181 m²/g</b><em>CONTROL · PASS</em></div><div className="window-row ready"><i>03</i><b>RUNS ADS-403 / 404</b><em>POST-PROOF · READY</em></div><p>The control establishes the boundary after GAS-41 acceptance; it does not rewrite earlier context.</p></aside></div><div className="ai-proposal"><div><span>AI PLANNER · INGEST REQUEST</span><h3>Merge all six adsorption results</h3><p>Proposed as one comparable GAS-41 batch · confidence 0.86</p></div><b>READY</b></div><div className="decision-stack horizontal evidence-actions"><button type="button" onClick={() => onFinish(true)}>Hold transition runs · release post-proof window</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Merge all runs after passing control</button></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function ServiceTransitionChart() {
  return <svg className="service-transition-svg" viewBox="0 0 540 235" role="img" aria-label="Six adsorption results across a gas-service changeover and a passing control reference"><path className="grid" d="M42 28H520M42 72H520M42 116H520M42 160H520M42 204H520M42 24V204M132 24V204M222 24V204M312 24V204M402 24V204M492 24V204" /><path className="band" d="M42 78H520V143H42Z" /><path className="series-pre" d="M58 157L132 145L202 165" /><path className="series-post" d="M340 112L417 105L496 118" />{[[58,157],[132,145],[202,165]].map(([x,y], index) => <circle key={`p-${index}`} className="point-pre" cx={x} cy={y} r="6" />)}<path className="boundary" d="M258 24V204" /><rect className="control-mark" x="274" y="92" width="32" height="32" transform="rotate(45 290 108)" />{[[340,112],[417,105],[496,118]].map(([x,y], index) => <circle key={`q-${index}`} className="point-post" cx={x} cy={y} r="6" />)}<text x="44" y="19">SURFACE AREA / CONTROL BAND</text><text x="249" y="222" textAnchor="middle">GAS-41 PROOF</text><text x="520" y="222" textAnchor="end">RUN ORDER →</text></svg>;
}

function FacilityCompleteModal({ scores, logCount, exceptionCount, onDeck, onClose }: { scores: Scores; logCount: number; exceptionCount: number; onDeck: () => void; onClose: () => void }) {
  const total = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / 4);
  return <ModalShell title="Campaign debrief" kicker="WO-3024 · COMPLETE" onClose={onClose}><div className="debrief-score"><span>RUN RATING</span><b>{total}</b><i>/ 100</i></div><p className="modal-intro">You controlled the physical move, preserved tote identity, proved the gas-service boundary, and bounded the result window before AI ingestion.</p><DebriefVisual scenario="facility" scores={scores} exceptionCount={exceptionCount} /><div className="debrief-grid"><span>Safety<b>{scores.safety}</b></span><span>Traceability<b>{scores.traceability}</b></span><span>Data integrity<b>{scores.integrity}</b></span><span>Uptime<b>{scores.uptime}</b></span></div><div className="lesson-card"><b>System insight</b><p>Material identity and utility state are scientific context. A high-quality result is not comparable evidence until the physical boundary and measurement-control window are known.</p></div><p className="debrief-meta">{logCount} run events captured · move, service, control, and eligibility boundaries linked</p><button className="modal-run" type="button" onClick={onDeck}>CHOOSE ANOTHER INCIDENT</button></ModalShell>;
}

function Task({ number, title, note, status, onClick }: { number: string; title: string; note: string; status: 'done' | 'active' | 'pending'; onClick?: () => void }) { const content = <><span>{status === 'done' ? '✓' : number}</span><div><b>{title}</b><small>{note}</small></div></>; return <li className={status}>{onClick ? <button type="button" onClick={onClick}>{content}</button> : content}</li>; }
function Score({ label, value }: { label: string; value: number }) { return <div className="score-row"><div><span>{label}</span><b>{value}</b></div><div className="score-track"><i style={{ width: `${value}%` }} /></div></div>; }
function ModalShell({ title, kicker, children, onClose, wide = false }: { title: string; kicker: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) { return <div className="modal-backdrop" role="presentation"><section className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</section></div>; }
function LedgerDrawer({ log, onClose }: { log: LogItem[]; onClose: () => void }) { return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="ledger-drawer" role="dialog" aria-modal="true" aria-label="Event ledger" onClick={(event) => event.stopPropagation()}><header><div><p className="section-kicker">SHIFT RECORD</p><h2>Event ledger</h2></div><button type="button" onClick={onClose} aria-label="Close event ledger">×</button></header><p className="drawer-intro">A chronological record of material moves, physical identity, gas-service proof, measurement control, and data-eligibility decisions.</p><ol>{[...log].reverse().map((item, index) => <li key={`${item.time}-${index}`}><time>{item.time}</time><i className={item.type}>{item.type}</i><p>{item.text}</p></li>)}</ol></aside></div>; }
