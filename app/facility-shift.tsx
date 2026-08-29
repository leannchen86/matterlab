'use client';

import { useEffect, useMemo, useState } from 'react';
import { DebriefVisual } from './debrief-visual';
import { CampaignControlModal } from './campaign-control';
import { subscribeLabEvent } from './lab-events';
import { LabViewport } from './lab-viewport';
import { MissionLabHeading, MissionTelemetry, PhysicalEvidenceCue, useModalFocusTrap } from './mission-ui';
import { ShiftDeckModal, type ScenarioId } from './scenario-shifts';
import { baseStations, type Station } from './sim-data';
import { StationAccess } from './station-access';

type Scores = { safety: number; traceability: number; integrity: number; uptime: number };
type LogItem = { time: string; type: string; text: string };
type Modal = 'deck' | 'campaign' | 'campaign-facility' | 'move' | 'gas' | 'control' | 'evidence' | 'complete' | null;

const tasks = [
  { title: 'Choose the correct container', pending: 'Two containers in the bay', done: 'Correct load secured' },
  { title: 'Move the material', pending: 'Correct load and route ready', done: 'Material delivered' },
  { title: 'Check the new gas', pending: 'New connection needs checks', done: 'Gas connection passed' },
  { title: 'Test the analyzer', pending: 'Reference material ready', done: 'Analyzer check passed' },
  { title: 'Review results across the gas change', pending: 'Two runs happened before proof', done: 'Uncertain runs held' },
];

const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function FacilityShift({ onSwitch }: { onSwitch: (id: ScenarioId) => void }) {
  const [phase, setPhase] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedId, setSelectedId] = useState('PREP-01');
  const [minute, setMinute] = useState(11 * 60 + 34);
  const [log, setLog] = useState<LogItem[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [moveChecks, setMoveChecks] = useState<Record<string, boolean>>({});
  const [scanned, setScanned] = useState(false);
  const [gasChecks, setGasChecks] = useState<Record<string, boolean>>({});
  const [leakRan, setLeakRan] = useState(false);
  const [controlChecks, setControlChecks] = useState<Record<string, boolean>>({});
  const [controlRan, setControlRan] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [scores, setScores] = useState<Scores>({ safety: 100, traceability: 100, integrity: 100, uptime: 100 });
  const [physicalInspections, setPhysicalInspections] = useState<Record<string, string[]>>({});

  useEffect(() => {
    return subscribeLabEvent('open-campaign', ({ view }) => setModal(view === 'facility' ? 'campaign-facility' : 'campaign'));
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
    if (station.id === 'PREP-01') {
      if (phase === 0) return { ...station, name: 'Material staging bay', purpose: 'Identifies incoming containers and secures them for a controlled move.', state: 'MOVE HOLD', tone: 'warn', meta: 'Two containers · identity unresolved', technicianView: ['Requested container: A', 'Staging bay: 2 containers', 'Pallet jack: inspection due'] };
      if (phase === 1) return { ...station, name: 'Material staging bay', purpose: 'Identifies incoming containers and secures them for a controlled move.', state: 'TRANSFER READY', tone: 'ready', meta: 'Container A · secured', technicianView: ['Container: A', 'Restraint: checked', 'Route: clear'] };
      return { ...station, name: 'Material staging bay', purpose: 'Identifies incoming containers and secures them for a controlled move.', state: 'BAY RELEASED', tone: 'ready', meta: 'Transfer receipt linked', technicianView: ['Move: MOV-3024', 'Departure scan: linked', 'Spill check: clear', 'Staging bay: available'] };
    }
    if (station.id === 'ROBO-02' && phase === 1) return { ...station, state: 'AISLE HOLD', tone: 'hold', meta: 'Material move has priority', technicianView: ['Cell boundary: closed', 'Robot: parked', 'Cross-aisle: reserved', 'Move MOV-3024: active'] };
    if (station.id === 'BET-02') {
      if (phase < 2) return { ...station, state: 'RECEIVING HOLD', tone: 'hold', meta: 'Bay + utility release pending', technicianView: ['Sample ports: isolated', 'Gas service: GAS-41', 'Lab acceptance: pending', 'Receiving bay: clear'] };
      if (phase === 2) return { ...station, state: 'UTILITY HOLD', tone: 'warn', meta: 'GAS-41 not yet proven', technicianView: ['Cylinder: GAS-41', 'Declared gas: N₂ 5.0', 'Isolation boundary: pending', 'Automated leak check: due'] };
      if (phase === 3) return { ...station, state: 'QC READY', tone: 'ready', meta: 'Gas connection checked', technicianView: ['Gas identity: checked', 'Leak test: passed', 'Ports: isolated', 'Reference material: ready'] };
      if (phase === 4) return { ...station, state: 'DATA REVIEW', tone: 'warn', meta: 'Two results cross the gas change', technicianView: ['QC result: 181 m²/g', 'QC range: 173–191 m²/g', 'Uncertain results: 2', 'Result use: review'] };
      return { ...station, state: 'READY', tone: 'ready', meta: 'Results after the check ready', technicianView: ['QC check: passed', 'Earlier results: blocked', 'Post-check results: ready', 'Result window: separated'] };
    }
    return station;
  }), [phase]);

  const selectedBase = stations.find((station) => station.id === selectedId) ?? stations[0];
  const selected = selectedBase;
  const completed = Math.min(5, phase);
  const progress = Math.round(completed / 5 * 100);
  const appendLog = (type: string, text: string, add = 0) => { const next = minute + add; setMinute(next); setLog((items) => [...items, { time: formatTime(next), type, text }]); };
  const penalize = (key: keyof Scores, amount: number) => setScores((value) => ({ ...value, [key]: Math.max(0, value[key] - amount) }));
  const reward = (updates: Partial<Scores>) => setScores((value) => ({ safety: Math.min(value.safety, updates.safety ?? value.safety), traceability: Math.min(value.traceability, updates.traceability ?? value.traceability), integrity: Math.min(value.integrity, updates.integrity ?? value.integrity), uptime: Math.min(value.uptime, updates.uptime ?? value.uptime) }));
  const recordInspection = (stationId: string, inspectionChecks: string[]) => {
    const wasComplete = (physicalInspections[stationId]?.length ?? 0) === 3;
    setPhysicalInspections((current) => ({ ...current, [stationId]: inspectionChecks }));
    if (!wasComplete && inspectionChecks.length === 3) appendLog('inspection', `${stationId} physical walkaround completed; ${inspectionChecks.join(', ')} retained with the shift record.`, 1);
  };
  const open = (next: Modal, stationId = selectedId) => { setFeedback(''); setModal(next); setSelectedId(stationId); };

  const finishMove = (correct: boolean) => {
    if (!correct) { penalize('traceability', 18); penalize('safety', 8); setFeedback('The electronic move ticket cannot transfer identity onto a neighboring physical tote. The move remains blocked.'); appendLog('exception', 'Attempted to relabel the adjacent tote from MOV-3024 without physical lot reconciliation; transfer blocked.', 2); return; }
    setPhase(1); reward({ safety: scores.safety + 10, traceability: scores.traceability + 16 }); appendLog('lineage', 'Container A matched the move request; the restraint and route were checked.', 2); window.setTimeout(() => setModal(null), 650);
  };
  const executeMove = () => { setPhase(2); setSelectedId('BET-02'); reward({ uptime: scores.uptime + 5 }); appendLog('transfer', 'Container A arrived at the analyzer bay; the pallet jack was parked safely.', 9); };
  const finishGas = (correct: boolean) => {
    if (!correct) { penalize('safety', 17); penalize('integrity', 10); setFeedback('Cylinder color and supply pressure are not identity or boundary evidence. The analyzer remains isolated.'); appendLog('exception', 'Attempted GAS-41 acceptance from cylinder color and pressure alone; service release blocked.', 2); return; }
    setPhase(3); reward({ safety: scores.safety + 12, integrity: scores.integrity + 8 }); appendLog('control', 'GAS-41 physical service tag, certificate link, isolation proof, and automated leak result accepted as one boundary record.', 2); window.setTimeout(() => setModal(null), 650);
  };
  const acquireControl = () => { setFeedback(''); setControlRan(true); appendLog('measurement', 'The known reference material was measured after the gas change.', 38); };
  const finishControl = (correct: boolean) => {
    if (!correct) { penalize('integrity', 14); setFeedback('An old certificate is not a current analyzer measurement. Results after the gas change remain blocked.'); appendLog('exception', 'An old certificate was used instead of a current reference measurement. The action was blocked.', 2); return; }
    setPhase(4); setSelectedId('BET-02'); reward({ uptime: scores.uptime + 7, integrity: scores.integrity + 6 }); appendLog('qc', 'The current reference check passed and its full record was saved.', 2); setFeedback(''); setModal('evidence');
  };
  const finishEvidence = (correct: boolean) => {
    if (!correct) { penalize('integrity', 19); setFeedback('A passing QC check proves the analyzer worked after the gas change. It cannot validate earlier results.'); appendLog('exception', 'Results from before and after the gas check were grouped together. The export was blocked.', 3); return; }
    setPhase(5); reward({ integrity: scores.integrity + 15, traceability: scores.traceability + 5 }); appendLog('decision', 'Earlier uncertain results were blocked. Only results after the passing check were approved.', 5); setFeedback(''); setModal('complete');
  };

  const actions = [() => open('move', 'PREP-01'), executeMove, () => open('gas', 'BET-02'), () => open('control', 'BET-02'), () => open('evidence', 'BET-02'), () => open('complete')];
  const action = getFacilityAction(phase, actions);

  return <main className="shell scenario-shell scenario-facility" style={{ '--scenario-accent': '#68d4ad' } as React.CSSProperties}>
    <header className="topbar"><div className="brand-block"><h1 className="brand-name">MatterLab</h1></div><div className="header-actions"><button className="campaign-button" type="button" aria-label="Open optional expert campaign sandbox" onClick={() => setModal('campaign')}>EXPERT SANDBOX</button><button className="deck-button" type="button" onClick={() => setModal('deck')}>SCENARIOS <span>5</span></button><button type="button" onClick={() => setLogOpen(true)}>EVIDENCE LOG</button></div></header>
    <div className="workspace"><aside className="left-rail"><section className="rail-section shift-card"><p className="section-kicker">CURRENT MISSION</p><h2>Move material and verify a gas change</h2><p>Move the correct container, verify the new gas connection, and check the analyzer afterward.</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-meta"><span>{completed} / 5 tasks</span><span>{progress}%</span></div><MissionTelemetry blockedAttempts={log.filter((event) => event.type === 'exception').length} evidenceCount={log.length} /></section><section className="rail-section"><p className="section-kicker">MISSION STEPS</p><ol className="task-list">{tasks.map((task, index) => { const done = phase > index; const active = !done && index === phase; return <Task key={task.title} number={`0${index + 1}`} title={task.title} note={done ? task.done : task.pending} status={done ? 'done' : active ? 'active' : 'pending'} onClick={active ? actions[index] : undefined} />; })}</ol></section></aside>
      <section className="lab-view"><MissionLabHeading objective={action.title} stationId={selected.id} stationState={selected.state} stationTone={selected.tone} /><LabViewport stations={stations} selectedId={selectedId} phase={phase} scenarioId="facility" inspectionState={physicalInspections} onInspectionChange={recordInspection} onSelect={setSelectedId} /></section>
      <aside className="right-rail"><section className={`rail-section alert-card tone-${action.tone}`}><div className="alert-head"><span>{action.tag}</span><b>{phase >= 5 ? 'CLOSED' : phase === 4 ? 'REVIEW' : 'ACTIVE'}</b></div><h2>{action.title}</h2><div className="metric-row"><span>Current state</span><strong>{action.metric}</strong></div><p>{action.body}</p><button className="primary-action" type="button" onClick={action.fn}>{action.label}<span>→</span></button></section><PhysicalEvidenceCue stationId={selected.id} checks={physicalInspections[selected.id] ?? []} /><section className="rail-section station-inspector"><div className="section-title-row"><p className="section-kicker">SELECTED EQUIPMENT</p><span className={selected.tone}>{selected.state}</span></div><div className="station-identity"><b>{selected.id}</b><h2>{selected.name}</h2></div><p>{selected.purpose}</p><StationAccess station={selected} scenarioId="facility" physicalChecks={physicalInspections[selected.id] ?? []} /></section><section className="rail-section lineage-card"><div className="section-title-row"><p className="section-kicker">EVIDENCE CHAIN</p><span>SIM</span></div><div className="lineage-flow"><span>LOT-3024-A</span><i>→</i><span>GAS-41</span><i>→</i><span>{phase >= 5 ? 'READY' : phase >= 3 ? 'CHECKED' : 'HOLD'}</span></div><p>{phase >= 5 ? 'Only results produced after the passing check can be reused.' : phase >= 4 ? 'The analyzer passed; decide which result window can be reused.' : phase >= 3 ? 'The gas tag, isolation, and leak check agree.' : 'The material and gas checks are still separate tasks.'}</p></section></aside></div>
    {modal === 'deck' && <ShiftDeckModal active="facility" onChoose={onSwitch} onExpert={() => setModal('campaign')} onClose={() => setModal(null)} />}
    {(modal === 'campaign' || modal === 'campaign-facility') && <CampaignControlModal autoOpenFacility={modal === 'campaign-facility'} onClose={() => setModal(null)} />}
    {modal === 'move' && <MoveBayModal checks={moveChecks} setChecks={setMoveChecks} scanned={scanned} setScanned={setScanned} feedback={feedback} appendLog={appendLog} onFinish={finishMove} onClose={() => setModal(null)} />}
    {modal === 'gas' && <GasBoundaryModal checks={gasChecks} setChecks={setGasChecks} leakRan={leakRan} setLeakRan={setLeakRan} clearFeedback={() => setFeedback('')} feedback={feedback} appendLog={appendLog} onFinish={finishGas} onClose={() => setModal(null)} />}
    {modal === 'control' && <BetControlModal checks={controlChecks} setChecks={setControlChecks} acquired={controlRan} onAcquire={acquireControl} clearFeedback={() => setFeedback('')} feedback={feedback} onFinish={finishControl} onClose={() => setModal(null)} />}
    {modal === 'evidence' && <FacilityEvidenceModal feedback={feedback} onFinish={finishEvidence} onClose={() => setModal(null)} />}
    {modal === 'complete' && <FacilityCompleteModal scores={scores} elapsedMinutes={minute - (11 * 60 + 34)} logCount={log.length} exceptionCount={log.filter((event) => event.type === 'exception').length} onDeck={() => setModal('deck')} onClose={() => setModal(null)} />}
    {logOpen && <LedgerDrawer log={log} onClose={() => setLogOpen(false)} />}
  </main>;
}

function getFacilityAction(phase: number, actions: (() => void)[]) {
  return [
    { tag: 'NEXT STEP', title: 'Choose the correct container', metric: '1 correct load', body: 'Two containers look alike. Match the label and secure the load before moving it.', label: 'CHECK THE MOVE', fn: actions[0], tone: 'warn' },
    { tag: 'NEXT STEP', title: 'The load is ready to move', metric: 'Ready', body: 'The correct container is secured and the aisle is clear.', label: 'MOVE MATERIAL', fn: actions[1], tone: 'ready' },
    { tag: 'NEXT STEP', title: 'Check the new gas connection', metric: 'Nitrogen', body: 'Confirm the gas label, isolation, and leak test before using the analyzer.', label: 'CHECK THE GAS', fn: actions[2], tone: 'warn' },
    { tag: 'NEXT STEP', title: 'Test the analyzer after the change', metric: 'Ready', body: 'Run the training QC material to prove the new setup works.', label: 'RUN THE CHECK', fn: actions[3], tone: 'ready' },
    { tag: 'NEXT STEP', title: 'Which results can be reused?', metric: '2 uncertain runs', body: 'A passing check only proves the analyzer worked after the gas change.', label: 'REVIEW THE RESULTS', fn: actions[4], tone: 'warn' },
    { tag: 'MISSION COMPLETE', title: 'Move and gas change complete', metric: '5 / 5', body: 'The material moved safely and only trustworthy results will be reused.', label: 'VIEW SUMMARY', fn: actions[5], tone: 'ready' },
  ][phase] ?? { tag: 'MISSION COMPLETE', title: 'Move and gas change complete', metric: '5 / 5', body: 'The controlled move is complete.', label: 'VIEW SUMMARY', fn: actions[5], tone: 'ready' };
}

function MoveBayModal({ checks, setChecks, scanned, setScanned, feedback, appendLog, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; scanned: boolean; setScanned: (value: boolean) => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['power', 'Pallet jack controls work'], ['forks', 'Forks and wheels are sound'], ['restraint', 'Container is restrained'], ['route', 'Route is clear']];
  const ready = scanned;
  const scan = () => { setChecks({ power: true, forks: true, restraint: true, route: true }); setScanned(true); appendLog('scan', 'The south container matches the move request; the north container does not.', 2); };
  return <ModalShell title="Choose the correct container" kicker="STEP 1 · MATERIAL CHECK" onClose={onClose} wide><div className="facility-workbench"><div className="facility-visual-panel"><div className="panel-heading"><span>STAGING BAY</span><b>{ready ? 'LOAD READY' : 'MOVEMENT PAUSED'}</b></div><MoveBayVisual scanned={scanned} checks={checks} /><div className="facility-indicator-strip"><span className={checks.power ? 'ok' : ''}>DRIVE</span><span className={checks.forks ? 'ok' : ''}>FORKS</span><span className={checks.restraint ? 'ok' : ''}>LOAD</span><span className={checks.route ? 'ok' : ''}>ROUTE</span><span className={scanned ? 'ok' : ''}>LABEL</span></div></div><div className="facility-control-panel"><p className="modal-intro">Check the container label and the route before moving anything.</p><div className="evidence-brief">{items.map(([key, label]) => <article key={key}><i>•</i><div><b>{label}</b></div></article>)}</div><button className="modal-run" type="button" disabled={scanned} onClick={scan}>{scanned ? 'BAY CHECKED' : 'INSPECT BAY + LABELS'}</button>{scanned && <div className="scan-result"><span>MOVE REQUEST</span><b>CONTAINER A · SOUTH</b><i>MATCH</i></div>}{ready && <div className="decision-stack"><button type="button" onClick={() => onFinish(true)}>Move container A</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Relabel container B</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function MoveBayVisual({ scanned, checks }: { scanned: boolean; checks: Record<string, boolean> }) {
  return <svg className="move-bay-svg" viewBox="0 0 620 360" role="img" aria-label="Powered pallet jack, two staged powder totes, and controlled aisle route">
    <defs><linearGradient id="bayFloor" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#233442" /><stop offset="1" stopColor="#0b131b" /></linearGradient><linearGradient id="jackMetal" x1="0" x2="1"><stop stopColor="#477264" /><stop offset=".5" stopColor="#8caa9f" /><stop offset="1" stopColor="#294b42" /></linearGradient></defs>
    <path d="M45 55H575V305H45Z" fill="url(#bayFloor)" stroke="#405565" /><path d="M80 80H540V278H80Z" fill="none" stroke={checks.route ? '#68d4ad' : '#7b6135'} strokeWidth="3" strokeDasharray="12 10" />
    <path d="M170 239H485" stroke="#89a69d" strokeWidth="28" opacity=".12" /><path d="M170 239H485" stroke={checks.route ? '#68d4ad' : '#b48945'} strokeWidth="3" strokeDasharray="9 8" />
    <g transform="translate(110 112)"><rect width="126" height="18" y="102" rx="3" fill="#866c45" /><rect x="11" width="104" height="104" rx="18" fill="#b4b9b2" stroke="#dce1db" /><path d="M37 0V-16H89V0" fill="#51635f" /><rect x="28" y="34" width="70" height="38" fill="#e6e6d8" /><path d="M34 49H92" stroke={scanned ? '#d89b5d' : '#707a78'} strokeWidth="6" /><text x="63" y="61" textAnchor="middle">{scanned ? 'B' : 'CHECK'}</text><circle cx="18" cy="129" r="8" fill="#283239" /><circle cx="108" cy="129" r="8" fill="#283239" /></g>
    <g transform="translate(374 112)"><rect width="126" height="18" y="102" rx="3" fill={checks.restraint ? '#55735f' : '#866c45'} /><rect x="11" width="104" height="104" rx="18" fill="#b4b9b2" stroke={scanned ? '#68d4ad' : '#dce1db'} strokeWidth={scanned ? 3 : 1} /><path d="M37 0V-16H89V0" fill="#51635f" /><rect x="28" y="34" width="70" height="38" fill="#e6e6d8" /><path d="M34 49H92" stroke={scanned ? '#68d4ad' : '#707a78'} strokeWidth="6" /><text x="63" y="61" textAnchor="middle">{scanned ? 'A' : 'CHECK'}</text><circle cx="18" cy="129" r="8" fill="#283239" /><circle cx="108" cy="129" r="8" fill="#283239" /></g>
    <g transform="translate(265 222)"><path d="M0 0H133V14H0Z" fill="url(#jackMetal)" /><path d="M8 4H112M8 11H112" stroke="#c8dad3" /><path d="M13 0L-18-72" stroke="url(#jackMetal)" strokeWidth="13" strokeLinecap="round" /><path d="M-17-73L-5-111" stroke="#59796f" strokeWidth="15" strokeLinecap="round" /><rect x="-35" y="-121" width="62" height="34" rx="13" fill="#233932" stroke="#6d9386" /><circle cx="12" cy="20" r="11" fill="#10161b" stroke="#56666d" /><circle cx="120" cy="20" r="8" fill="#10161b" stroke="#56666d" /><circle cx="-7" cy="-104" r="4" fill={checks.power && checks.forks ? '#68d4ad' : '#d39a4d'} /></g>
    <text x="110" y="44" textAnchor="middle">NORTH POSITION</text><text x="437" y="44" textAnchor="middle">SOUTH POSITION · TARGET</text><text x="540" y="330" textAnchor="end">RECEIVING →</text><text x="80" y="330">AISLE A-2 · {checks.route ? 'CLEAR' : 'VERIFY ROUTE'}</text>
  </svg>;
}

function GasBoundaryModal({ checks, setChecks, leakRan, setLeakRan, clearFeedback, feedback, appendLog, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; leakRan: boolean; setLeakRan: (value: boolean) => void; clearFeedback: () => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['identity', 'Gas label matches the certificate'], ['isolation', 'Analyzer is safely isolated'], ['trend', 'Supply pressure is stable']];
  const runLeak = () => { clearFeedback(); setChecks({ identity: true, isolation: true, trend: true }); setLeakRan(true); appendLog('qc', 'The isolated leak check passed on the new gas connection.', 7); };
  return <ModalShell title="Check the new gas connection" kicker="STEP 3 · GAS CHECK" onClose={onClose} wide><div className="facility-workbench gas-workbench"><div className="facility-visual-panel"><div className="panel-heading"><span>ISOLATED GAS TEST</span><b>{leakRan ? 'PASSED' : 'ANALYZER PAUSED'}</b></div><GasManifoldVisual checks={checks} leakRan={leakRan} /><div className="gas-readout"><span>SUPPLY<b>{checks.trend ? 'STABLE' : 'NOT CHECKED'}</b></span><span>LEAK TEST<b>{leakRan ? 'PASS' : 'NOT RUN'}</b></span></div></div><div className="facility-control-panel"><p className="modal-intro">Match the gas label, isolate the analyzer, then test the new connection for leaks.</p><div className="evidence-brief">{items.map(([key, label]) => <article key={key}><i>•</i><div><b>{label}</b></div></article>)}</div><button className="modal-run" type="button" disabled={leakRan} onClick={runLeak}>{leakRan ? 'GAS CHECK PASSED' : 'RUN GAS CHECK'}</button>{!leakRan && <button className="blank-release-shortcut" type="button" onClick={() => onFinish(false)}>Use label and pressure only</button>}{leakRan && <div className="decision-stack"><button type="button" onClick={() => onFinish(true)}>Save the passing check</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Ignore the leak result</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
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

function BetControlModal({ setChecks, acquired, onAcquire, clearFeedback, feedback, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; acquired: boolean; onAcquire: () => void; clearFeedback: () => void; feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['identity', 'Known reference material'], ['prep', 'Preparation and dry mass recorded'], ['boundary', 'New gas connection linked to this test']];
  const ready = true;
  const acquire = () => { clearFeedback(); setChecks({ identity: true, prep: true, boundary: true }); onAcquire(); };
  return <ModalShell title="Test the analyzer" kicker="STEP 4 · MACHINE CHECK" onClose={onClose} wide><div className="facility-workbench bet-control-workbench"><div className="facility-visual-panel"><div className="panel-heading"><span>REFERENCE MATERIAL</span><b>{acquired ? 'CHECK PASSED' : ready ? 'READY TO TEST' : 'ANALYZER PAUSED'}</b></div><BetControlVisual acquired={acquired} /><div className="gas-readout bet-control-readout"><span>REFERENCE<b>KNOWN</b></span><span>RESULT<b>{acquired ? 'IN RANGE' : 'NOT RUN'}</b></span></div></div><div className="facility-control-panel"><p className="modal-intro">Measure a known reference after the gas change to prove the analyzer works.</p><div className="evidence-brief">{items.map(([key, label]) => <article key={key}><i>•</i><div><b>{label}</b></div></article>)}</div><button className="modal-run" type="button" disabled={acquired} onClick={acquire}>{acquired ? 'QC CHECK PASSED' : 'RUN QC CHECK'}</button>{!acquired && <button className="control-certificate-shortcut" type="button" onClick={() => onFinish(false)}>Reuse an old certificate value</button>}{acquired && <div className="control-verdict"><span>RESULT</span><b>REFERENCE IN RANGE</b><i>PASS</i></div>}{acquired && <div className="decision-stack"><button type="button" onClick={() => onFinish(true)}>Save the passing check</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function BetControlVisual({ acquired }: { acquired: boolean }) {
  const points = [[72,270],[105,254],[137,232],[169,202],[204,164],[240,132],[278,106],[320,86],[366,72],[416,61],[470,52]];
  return <svg className="bet-control-svg" viewBox="0 0 620 360" role="img" aria-label={acquired ? 'Known reference material result inside the expected range' : 'Adsorption acquisition awaiting a reference check'}>
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
  return <ModalShell title="Separate results across the gas change" kicker="STEP 5 · RESULT CHECK" onClose={onClose} wide><div className="decision-question"><span>DECISION</span><b>Which results did the passing QC check actually cover?</b></div><div className="transition-evidence"><div className="transition-chart"><div className="panel-heading"><span>RESULT ORDER</span><b>GAS CHANGE + QC CHECK</b></div><ServiceTransitionChart /><div className="transition-legend"><span><i className="pre" />BEFORE CHECK</span><span><i className="control" />QC CHECK</span><span><i className="post" />AFTER CHECK</span></div></div><aside className="transition-window"><span>ORDER</span><div className="window-row held"><i>01</i><b>EARLIER RESULTS</b><em>BEFORE QC PASS</em></div><div className="window-row control"><i>02</i><b>REFERENCE CHECK</b><em>PASS</em></div><div className="window-row ready"><i>03</i><b>LATER RESULTS</b><em>AFTER QC PASS</em></div></aside></div><div className="ai-proposal"><div><span>BATCH SUGGESTION</span><h3>Merge every result together</h3><p>Ignores when the passing check occurred.</p></div></div><div className="decision-stack horizontal evidence-actions"><button type="button" onClick={() => onFinish(true)}>Use only results after the pass</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Use everything because QC passed</button></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function ServiceTransitionChart() {
  return <svg className="service-transition-svg" viewBox="0 0 540 235" role="img" aria-label="Six adsorption results across a gas-service changeover and a passing QC check"><path className="grid" d="M42 28H520M42 72H520M42 116H520M42 160H520M42 204H520M42 24V204M132 24V204M222 24V204M312 24V204M402 24V204M492 24V204" /><path className="band" d="M42 78H520V143H42Z" /><path className="series-pre" d="M58 157L132 145L202 165" /><path className="series-post" d="M340 112L417 105L496 118" />{[[58,157],[132,145],[202,165]].map(([x,y], index) => <circle key={`p-${index}`} className="point-pre" cx={x} cy={y} r="6" />)}<path className="boundary" d="M258 24V204" /><rect className="control-mark" x="274" y="92" width="32" height="32" transform="rotate(45 290 108)" />{[[340,112],[417,105],[496,118]].map(([x,y], index) => <circle key={`q-${index}`} className="point-post" cx={x} cy={y} r="6" />)}<text x="44" y="19">SURFACE AREA / QC RANGE</text><text x="249" y="222" textAnchor="middle">GAS-41 PROOF</text><text x="520" y="222" textAnchor="end">RUN ORDER →</text></svg>;
}

function FacilityCompleteModal({ scores, elapsedMinutes, logCount, exceptionCount, onDeck, onClose }: { scores: Scores; elapsedMinutes: number; logCount: number; exceptionCount: number; onDeck: () => void; onClose: () => void }) {
  return <ModalShell title="Mission debrief" kicker="MISSION COMPLETE" onClose={onClose}><p className="modal-intro">You moved the correct container, verified the gas connection, tested the analyzer, and separated uncertain results.</p><DebriefVisual scenario="facility" scores={scores} elapsedMinutes={elapsedMinutes} logCount={logCount} exceptionCount={exceptionCount} /><div className="lesson-card"><b>What changed in the lab</b><p>The correct container reached the analyzer, the gas connection passed its leak check, and only results made after the passing check are ready.</p></div><button className="modal-run" type="button" onClick={onDeck}>CHOOSE ANOTHER MISSION</button></ModalShell>;
}

function Task({ number, title, note, status, onClick }: { number: string; title: string; note: string; status: 'done' | 'active' | 'pending'; onClick?: () => void }) { const content = <><span>{status === 'done' ? '✓' : number}</span><div><b>{title}</b><small>{note}</small></div></>; return <li className={status}>{onClick ? <button type="button" onClick={onClick}>{content}</button> : content}</li>; }
function ModalShell({ title, kicker, children, onClose, wide = false }: { title: string; kicker: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const dialogRef = useModalFocusTrap();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation"><section ref={dialogRef} className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</section></div>;
}
function LedgerDrawer({ log, onClose }: { log: LogItem[]; onClose: () => void }) { return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="ledger-drawer" role="dialog" aria-modal="true" aria-label="Event ledger" onClick={(event) => event.stopPropagation()}><header><div><p className="section-kicker">RUN RECORD</p><h2>What happened</h2></div><button type="button" onClick={onClose} aria-label="Close event ledger">×</button></header><p className="drawer-intro">A time-ordered record of the material move, gas check, analyzer test, and result decisions.</p><ol>{[...log].reverse().map((item, index) => <li key={`${item.time}-${index}`}><time>{item.time}</time><i className={item.type}>{item.type}</i><p>{item.text}</p></li>)}</ol></aside></div>; }
