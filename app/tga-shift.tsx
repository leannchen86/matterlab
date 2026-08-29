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
type Modal = 'deck' | 'campaign' | 'campaign-facility' | 'baseline' | 'pan' | 'blank' | 'evidence' | 'complete' | null;

const tasks = [
  { title: 'Review the failed check', pending: 'Empty-pan check failed', done: 'Failed check saved' },
  { title: 'Match the sample pans', pending: 'Pan pair is uncertain', done: 'Matching pans loaded' },
  { title: 'Run an empty test', pending: 'Waiting to start', done: 'Empty test passed' },
  { title: 'Review the unusual result', pending: 'One change needs review', done: 'Repeat test assigned' },
];

const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function TgaShift({ onSwitch }: { onSwitch: (id: ScenarioId) => void }) {
  const [phase, setPhase] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedId, setSelectedId] = useState('TGA-01');
  const [minute, setMinute] = useState(15 * 60 + 8);
  const [log, setLog] = useState<LogItem[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [ran, setRan] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [blankChecks, setBlankChecks] = useState<Record<string, boolean>>({});
  const [blankRan, setBlankRan] = useState(false);
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
    if (station.id !== 'TGA-01') return station;
    if (phase === 0) return { ...station, state: 'NO-SAMPLE CHECK FAILED', tone: 'warn', meta: 'Empty-pan check · failed', technicianView: ['Furnace: near room temperature', 'Purge gas: stable', 'No-sample check: failed', 'Sample testing: blocked'] };
    if (phase < 3) return { ...station, state: 'SAMPLE TESTING PAUSED', tone: 'hold', meta: phase === 1 ? 'Pan materials do not match' : 'Matched pans loaded · empty test pending', technicianView: [`Pair state: ${phase >= 2 ? 'matched' : 'platinum / aluminum mismatch'}`, 'Purge gas: stable', 'Empty-pan test: awaiting run'] };
    if (phase === 3) return { ...station, state: 'ANALYZING', tone: 'run', meta: 'Thermal program active', technicianView: ['Sample: loaded', 'Purge gas: stable', 'Acquisition: running'] };
    return { ...station, state: phase >= 5 ? 'RECHECK QUEUED' : 'REVIEW', tone: 'warn', meta: 'Mass step coincides with gas-flow change', technicianView: ['Mass onset: 412 °C', 'Heat-flow event: 438 °C', 'Gas-flow change: 412.5 °C', `Result use: ${phase >= 5 ? 'held for repeat' : 'needs review'}`] };
  }), [phase]);

  const selectedBase = stations.find((station) => station.id === selectedId) ?? stations[6];
  const selected = selectedBase;
  const completed = phase >= 5 ? 4 : phase <= 2 ? phase : 3;
  const progress = Math.round(completed / 4 * 100);
  const appendLog = (type: string, text: string, add = 0) => { const next = minute + add; setMinute(next); setLog((items) => [...items, { time: formatTime(next), type, text }]); };
  const penalize = (key: keyof Scores, amount: number) => setScores((value) => ({ ...value, [key]: Math.max(0, value[key] - amount) }));
  const reward = (updates: Partial<Scores>) => setScores((value) => ({ safety: Math.min(value.safety, updates.safety ?? value.safety), traceability: Math.min(value.traceability, updates.traceability ?? value.traceability), integrity: Math.min(value.integrity, updates.integrity ?? value.integrity), uptime: Math.min(value.uptime, updates.uptime ?? value.uptime) }));
  const recordInspection = (stationId: string, inspectionChecks: string[]) => {
    const wasComplete = (physicalInspections[stationId]?.length ?? 0) === 3;
    setPhysicalInspections((current) => ({ ...current, [stationId]: inspectionChecks }));
    if (!wasComplete && inspectionChecks.length === 3) appendLog('inspection', `${stationId} physical walkaround completed; ${inspectionChecks.join(', ')} linked to the local-console evidence gate.`, 1);
  };
  const open = (next: Modal) => { setFeedback(''); if (next === 'baseline') { setChecks({}); setRan(false); } setModal(next); setSelectedId('TGA-01'); };

  const finishBaseline = (correct: boolean) => {
    if (!correct) { penalize('integrity', 16); setFeedback('A software zero would hide the failed no-sample reading without explaining its physical cause. Sample testing stays blocked.'); appendLog('exception', 'Attempted digital zero before reconciling the physical pan pair; sample testing stayed blocked.', 2); return; }
    setPhase(1); reward({ integrity: scores.integrity + 12, uptime: scores.uptime + 8 }); appendLog('decision', 'Failed no-sample reading saved; sample testing blocked while the physical pan pair is inspected.', 2); window.setTimeout(() => setModal(null), 650);
  };
  const finishPan = (correct: boolean) => {
    if (!correct) { penalize('traceability', 18); setFeedback('Copying the prior pan ID would create a plausible record for a physically mixed pair. The action is blocked.'); appendLog('exception', 'Prior pan-set identity selected without reconciling the mixed Pt/Al pair; association blocked.', 2); return; }
    setPhase(2); reward({ traceability: scores.traceability + 14, integrity: scores.integrity + 6 }); appendLog('lineage', 'The mixed pan pair was set aside and two matching platinum pans were loaded.', 2); window.setTimeout(() => setModal(null), 650);
  };
  const acquireBlank = () => { setFeedback(''); setBlankRan(true); appendLog('measurement', 'The empty-pan test saved mass, heat-flow, temperature, and gas-flow channels.', 14); };
  const finishBlank = (correct: boolean) => {
    if (!correct) { penalize('integrity', 13); setFeedback('Matching pan IDs do not prove the empty setup is stable. Sample testing stays blocked.'); appendLog('exception', 'Sample testing was attempted without a passing empty-pan check. The action was blocked.', 2); return; }
    setPhase(3); setSelectedId('TGA-01'); reward({ uptime: scores.uptime + 6, integrity: scores.integrity + 6 }); appendLog('qc', 'The empty-pan test passed; sample testing was allowed.', 2); setFeedback(''); setModal(null);
  };
  const advance = () => { setPhase(4); appendLog('result', 'TGA/DSC run completed; native mass, heat-flow, temperature, purge, and method channels linked.', 58); setFeedback(''); setModal('evidence'); };
  const finishEvidence = (correct: boolean) => {
    if (!correct) { penalize('integrity', 17); setFeedback('The temperature change treats a gas-flow overlap as sample behavior before a repeat exists.'); appendLog('exception', 'Temperature change attempted before resolving the gas-flow overlap; suggestion held.', 3); return; }
    setPhase(5); reward({ integrity: scores.integrity + 12, traceability: scores.traceability + 5 }); appendLog('decision', 'Gas-flow overlap flagged; temperature change held and matched-pan repeat queued.', 5); setModal('complete'); setFeedback('');
  };

  const actions = [() => open('baseline'), () => open('pan'), () => open('blank'), advance, () => open('evidence'), () => open('complete')];
  const action = getTgaAction(phase, actions);

  return <main className="shell scenario-shell scenario-tga" style={{ '--scenario-accent': '#e2a64f' } as React.CSSProperties}>
    <header className="topbar"><div className="brand-block"><h1 className="brand-name">MatterLab</h1></div><div className="header-actions"><button className="campaign-button" type="button" aria-label="Open optional expert campaign sandbox" onClick={() => setModal('campaign')}>EXPERT SANDBOX</button><button className="deck-button" type="button" onClick={() => setModal('deck')}>SCENARIOS <span>5</span></button><button type="button" onClick={() => setLogOpen(true)}>EVIDENCE LOG</button></div></header>
    <div className="workspace"><aside className="left-rail"><section className="rail-section shift-card"><p className="section-kicker">CURRENT MISSION</p><h2>Fix the empty-pan check</h2><p>Correct the setup, match the sample pans, and decide whether the result is trustworthy.</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-meta"><span>{completed} / 4 tasks</span><span>{progress}%</span></div><MissionTelemetry blockedAttempts={log.filter((event) => event.type === 'exception').length} evidenceCount={log.length} /></section><section className="rail-section"><p className="section-kicker">MISSION STEPS</p><ol className="task-list">{tasks.map((task, index) => { const done = index === 3 ? phase >= 5 : phase > index; const active = !done && (index === phase || (index === 3 && (phase === 3 || phase === 4))); const actionsForTask = [() => open('baseline'), () => open('pan'), () => open('blank'), () => phase === 3 ? advance() : open('evidence')]; return <Task key={task.title} number={`0${index + 1}`} title={task.title} note={done ? task.done : task.pending} status={done ? 'done' : active ? 'active' : 'pending'} onClick={active ? actionsForTask[index] : undefined} />; })}</ol></section></aside>
      <section className="lab-view"><MissionLabHeading objective={action.title} stationId={selected.id} stationState={selected.state} stationTone={selected.tone} /><LabViewport stations={stations} selectedId={selectedId} phase={phase} scenarioId="tga" inspectionState={physicalInspections} onInspectionChange={recordInspection} onSelect={setSelectedId} /></section>
      <aside className="right-rail"><section className={`rail-section alert-card tone-${action.tone}`}><div className="alert-head"><span>{action.tag}</span><b>{phase >= 5 ? 'CLOSED' : phase === 4 ? 'REVIEW' : 'ACTIVE'}</b></div><h2>{action.title}</h2><div className="metric-row"><span>Current state</span><strong>{action.metric}</strong></div><p>{action.body}</p><button className="primary-action" type="button" onClick={action.fn}>{action.label}<span>→</span></button></section><PhysicalEvidenceCue stationId={selected.id} checks={physicalInspections[selected.id] ?? []} /><section className="rail-section station-inspector"><div className="section-title-row"><p className="section-kicker">SELECTED EQUIPMENT</p><span className={selected.tone}>{selected.state}</span></div><div className="station-identity"><b>{selected.id}</b><h2>{selected.name}</h2></div><p>{selected.purpose}</p><StationAccess station={selected} scenarioId="tga" physicalChecks={physicalInspections[selected.id] ?? []} /></section><section className="rail-section lineage-card"><div className="section-title-row"><p className="section-kicker">EVIDENCE CHAIN</p><span>SIM</span></div><div className="lineage-flow"><span>LOT-91-T</span><i>→</i><span>PANSET-14</span><i>→</i><span>{phase >= 5 ? 'REPEAT' : phase >= 2 ? 'MATCH' : 'PAUSED'}</span></div><p>{phase >= 5 ? 'The original result is saved and a repeat is queued.' : phase >= 2 ? 'The sample, matching pans, and method agree.' : 'The physical pan pair still needs to be checked.'}</p></section></aside></div>
    {modal === 'deck' && <ShiftDeckModal active="tga" onChoose={onSwitch} onExpert={() => setModal('campaign')} onClose={() => setModal(null)} />}
    {(modal === 'campaign' || modal === 'campaign-facility') && <CampaignControlModal autoOpenFacility={modal === 'campaign-facility'} onClose={() => setModal(null)} />}
    {modal === 'baseline' && <BaselineModal checks={checks} setChecks={setChecks} physicalChecks={physicalInspections['TGA-01'] ?? []} ran={ran} setRan={setRan} clearFeedback={() => setFeedback('')} feedback={feedback} appendLog={appendLog} onFinish={finishBaseline} onClose={() => setModal(null)} />}
    {modal === 'pan' && <PanModal scanned={scanned} setScanned={setScanned} feedback={feedback} appendLog={appendLog} onFinish={finishPan} onClose={() => setModal(null)} />}
    {modal === 'blank' && <BlankControlModal checks={blankChecks} setChecks={setBlankChecks} acquired={blankRan} onAcquire={acquireBlank} feedback={feedback} onFinish={finishBlank} onClose={() => setModal(null)} />}
    {modal === 'evidence' && <ThermalEvidenceModal feedback={feedback} onFinish={finishEvidence} onClose={() => setModal(null)} />}
    {modal === 'complete' && <TgaCompleteModal scores={scores} elapsedMinutes={minute - (15 * 60 + 8)} logCount={log.length} exceptionCount={log.filter((event) => event.type === 'exception').length} onDeck={() => setModal('deck')} onClose={() => setModal(null)} />}
    {logOpen && <LedgerDrawer log={log} onClose={() => setLogOpen(false)} />}
  </main>;
}

function getTgaAction(phase: number, actions: (() => void)[]) {
  return [
    { tag: 'NEXT STEP', title: 'The no-sample check failed', metric: 'Sample testing blocked', body: 'No sample was loaded, so the drift must come from the setup or the instrument.', label: 'REVIEW THE EMPTY-PAN CHECK', fn: actions[0], tone: 'warn' },
    { tag: 'NEXT STEP', title: 'The pans may be mixed up', metric: '2 pan types', body: 'Match the physical pans to the method before running another test.', label: 'CHECK THE PANS', fn: actions[1], tone: 'warn' },
    { tag: 'NEXT STEP', title: 'Run one empty test', metric: 'Ready', body: 'Use the matching empty pans to prove the setup is working.', label: 'RUN THE EMPTY TEST', fn: actions[2], tone: 'ready' },
    { tag: 'IN PROGRESS', title: 'The sample is heating', metric: 'Running', body: 'Finish the acquisition to inspect the result.', label: 'COMPLETE TEST', fn: actions[3], tone: 'run' },
    { tag: 'NEXT STEP', title: 'The gas change may have caused the signal', metric: 'One overlapping event', body: 'The mass signal changed at the same moment as the purge flow. Compare both before blaming the material.', label: 'REVIEW THE RESULT', fn: actions[4], tone: 'warn' },
    { tag: 'MISSION COMPLETE', title: 'The result is safely held for a repeat', metric: '4 / 4', body: 'You fixed the setup and did not overclaim an uncertain result.', label: 'VIEW SUMMARY', fn: actions[5], tone: 'ready' },
  ][phase] ?? { tag: 'MISSION COMPLETE', title: 'Thermal evidence safely held', metric: '4 / 4', body: 'The instrument path is controlled.', label: 'VIEW SUMMARY', fn: actions[5], tone: 'ready' };
}

function BaselineModal({ setChecks, physicalChecks, ran, setRan, clearFeedback, feedback, appendLog, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; physicalChecks: string[]; ran: boolean; setRan: (value: boolean) => void; clearFeedback: () => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['ambient', 'Start near room temperature', 'The comparison needs the same starting temperature.', 'FURNACE'], ['purge', 'Check the gas and flow', 'A gas-flow change can alter the reading.', 'PURGE'], ['empty', 'Inspect both empty pans', 'Residue, damage, or mixed pans can shift a no-sample reading.', 'PAN']];
  const run = () => { clearFeedback(); setChecks({ ambient: true, purge: true, empty: true }); setRan(true); appendLog('qc', 'The repeated empty-pan check failed again and was saved.', 8); };
  return <ModalShell title="Review the failed empty-pan check" kicker="STEP 1 · MACHINE CHECK" onClose={onClose} wide><div className="modal-grid scenario-bench-grid"><div><p className="modal-intro">The machine drifted with no sample loaded. Repeat and preserve the failure before changing the setup.</p><div className="evidence-brief">{items.map(([key, title, , hotspot]) => { const observed = physicalChecks.includes(hotspot); return <article key={key} className={observed ? 'observed' : ''} aria-label={`${title}; ${observed ? 'observed in the 3D walkaround' : 'not yet observed in the 3D walkaround'}`}><i>{observed ? '✓' : '•'}</i><div><b>{title}</b><small>{observed ? 'Observed in 3D' : 'Not inspected'}</small></div></article>; })}</div><button className="modal-run" type="button" disabled={ran} onClick={run}>{ran ? 'FAILED CHECK SAVED' : 'REPEAT EMPTY-PAN CHECK'}</button>{!ran && <button className="blank-release-shortcut" type="button" onClick={() => onFinish(false)}>Hide the drift with software zero</button>}</div><div className="instrument-console"><div className="panel-heading"><span>EMPTY-PAN CHECK</span><b>NO SAMPLE LOADED</b></div><TgaTrace baseline ran={ran} /><div className="result-box"><span>RESULT</span><b>{ran ? 'FAILED AGAIN' : 'NOT RUN'}</b><span>EVIDENCE</span><b>{ran ? 'SAVED' : 'NONE'}</b></div>{ran && <div className="decision-stack"><p className="mini-label">NEXT STEP</p><button type="button" onClick={() => onFinish(true)}>Inspect the physical pans</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Zero the display and continue</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function PanModal({ scanned, setScanned, feedback, appendLog, onFinish, onClose }: { scanned: boolean; setScanned: (value: boolean) => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const scan = () => { setScanned(true); appendLog('lineage', 'The pan check found one platinum pan and one aluminum pan.', 3); };
  return <ModalShell title="Match the sample pans" kicker="STEP 2 · PHYSICAL CHECK" onClose={onClose} wide><p className="modal-intro">The method expects two matching platinum pans. Check what is actually loaded.</p><div className="record-compare"><article><span>METHOD EXPECTS</span><b>PLATINUM / PLATINUM</b><div className="barcode" /></article><i>≠</i><article className={scanned ? 'exception-record' : ''}><span>LOADED PANS</span><b>{scanned ? 'PLATINUM / ALUMINUM' : 'NOT CHECKED'}</b><div className="pan-pair-visual"><i /><i className={scanned ? 'mismatch' : ''} /></div></article></div>{!scanned ? <button className="modal-run" type="button" onClick={scan}>CHECK BOTH PANS</button> : <div className="decision-stack horizontal"><button type="button" onClick={() => onFinish(true)}>Set aside the mixed pair</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Copy the old ID into the record</button></div>}{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function BlankControlModal({ setChecks, acquired, onAcquire, feedback, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; acquired: boolean; onAcquire: () => void; feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['pair', 'Two matching platinum pans are loaded'], ['condition', 'Both empty pans are clean and undamaged'], ['method', 'The gas flow and heating method are saved']];
  const acquire = () => { setChecks({ pair: true, condition: true, method: true }); onAcquire(); };
  return <ModalShell title="Run the empty-pan test" kicker="STEP 3 · SETUP TEST" onClose={onClose} wide><div className="modal-grid scenario-bench-grid"><div><p className="modal-intro">The pans now match. Run one empty test to prove the setup is stable.</p><div className="evidence-brief">{items.map(([key, title]) => <article key={key}><i>•</i><div><b>{title}</b></div></article>)}</div><button className="modal-run" type="button" disabled={acquired} onClick={acquire}>{acquired ? 'EMPTY TEST PASSED' : 'RUN EMPTY-PAN TEST'}</button>{!acquired && <button className="blank-release-shortcut" type="button" onClick={() => onFinish(false)}>Skip the empty test</button>}</div><div className="instrument-console"><div className="panel-heading"><span>EMPTY-PAN TEST</span><b>MATCHED PANS</b></div><TgaBlankTrace acquired={acquired} /><div className="result-box"><span>SETUP</span><b>MATCHED</b><span>TEST RESULT</span><b>{acquired ? 'PASSED' : 'NOT RUN'}</b></div>{acquired && <div className="decision-stack"><button type="button" onClick={() => onFinish(true)}>Allow sample testing</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function TgaBlankTrace({ acquired }: { acquired: boolean }) {
  return <svg className="tga-trace-chart blank-control-chart" viewBox="0 0 440 190" role="img" aria-label={acquired ? 'Passing empty-pan mass and heat-flow test with stable gas flow' : 'Empty-pan test awaiting acquisition'}>
    {[35,75,115,155].map((y) => <line key={y} className="trace-grid" x1="28" y1={y} x2="424" y2={y} />)}{[88,168,248,328,408].map((x) => <line key={x} className="trace-grid" x1={x} y1="18" x2={x} y2="168" />)}
    <rect className="blank-band mass" x="28" y="33" width="396" height="20" /><rect className="blank-band heat" x="28" y="111" width="396" height="22" />
    <text x="8" y="45">MASS</text><text x="8" y="124">DSC</text><text x="8" y="159">N₂</text>
    {acquired ? <><path className="blank-mass" d="M28 43 C105 42 173 45 244 43 S357 44 424 42" /><path className="blank-heat" d="M28 122 C105 124 184 121 252 123 S355 120 424 122" /><path className="blank-purge" d="M28 157 C142 156 262 158 424 157" /></> : <><path className="blank-awaiting" d="M28 43H424M28 122H424M28 157H424" /><text x="226" y="91" textAnchor="middle">ACQUISITION HELD</text></>}
    {acquired && <text className="blank-pass" x="416" y="28" textAnchor="end">EMPTY-PAN TEST · PASS</text>}
  </svg>;
}

function ThermalEvidenceModal({ feedback, onFinish, onClose }: { feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  return <ModalShell title="Review the unusual thermal result" kicker="STEP 4 · RESULT CHECK" onClose={onClose} wide><div className="decision-question"><span>DECISION</span><b>Did the material change, or did the gas-flow change disturb the reading?</b></div><div className="evidence-grid"><div className="trace-panel"><div className="panel-heading"><span>MASS + HEAT FLOW + GAS FLOW</span><b>EVENT OVERLAP</b></div><TgaTrace /><div className="axis"><span>START</span><b>TEMPERATURE</b><span>END</span></div></div><div className="report-panel"><div className="panel-heading"><span>EVENT ORDER</span><b>COMPARE TIMING</b></div><div className="report-metric"><span>Mass change</span><b>WITH GAS CHANGE</b></div><div className="report-metric"><span>Heat-flow event</span><b>LATER</b></div><div className="report-status warn-status">CAUSE NOT PROVEN</div><p>The mass change overlaps the gas-flow change.</p></div></div><div className="ai-proposal"><div><span>NEXT-RUN SUGGESTION</span><h3>Lower the heating temperature</h3><p>Assumes the mass event came from the material.</p></div></div><div className="decision-stack horizontal evidence-actions"><button type="button" onClick={() => onFinish(true)}>Repeat with stable gas flow</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Change the temperature now</button></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function TgaTrace({ baseline = false, ran = true }: { baseline?: boolean; ran?: boolean }) {
  return <svg className="tga-trace-chart" viewBox="0 0 440 190" role="img" aria-label={baseline ? 'Simulated failed empty-pan mass and heat-flow check' : 'Simulated mass, heat-flow, and gas-flow traces with an overlapping event'}>
    {[35, 75, 115, 155].map((y) => <line key={y} className="trace-grid" x1="28" y1={y} x2="424" y2={y} />)}
    {[88, 168, 248, 328, 408].map((x) => <line key={x} className="trace-grid" x1={x} y1="18" x2={x} y2="168" />)}
    <text x="8" y="39">MASS</text><text x="8" y="119">DSC</text>{!baseline && <text x="8" y="159">N₂</text>}
    {ran && <><path className="trace-mass" d={baseline ? 'M28 42 C120 41 215 45 300 48 S380 52 424 55' : 'M28 38 C110 38 178 40 238 43 L252 71 C305 74 357 76 424 80'} /><path className="trace-dsc" d={baseline ? 'M28 128 C120 126 220 123 310 119 S390 114 424 111' : 'M28 128 C145 128 232 126 270 119 C292 92 314 91 338 123 C365 128 394 128 424 127'} />{!baseline && <path className="trace-purge" d="M28 157 H236 L250 144 L263 159 H424" />}{!baseline && <line className="event-marker" x1="249" y1="18" x2="249" y2="168" />}{!baseline && <text className="event-label" x="257" y="28">COUPLED EVENT</text>}</>}
  </svg>;
}

function TgaCompleteModal({ scores, elapsedMinutes, logCount, exceptionCount, onDeck, onClose }: { scores: Scores; elapsedMinutes: number; logCount: number; exceptionCount: number; onDeck: () => void; onClose: () => void }) {
  return <ModalShell title="Mission debrief" kicker="MISSION COMPLETE" onClose={onClose}><p className="modal-intro">You saved the failed no-sample reading, matched the pans, proved the empty setup, and refused to overclaim an uncertain result.</p><DebriefVisual scenario="tga" scores={scores} elapsedMinutes={elapsedMinutes} logCount={logCount} exceptionCount={exceptionCount} /><div className="lesson-card"><b>What changed in the lab</b><p>The mixed pans are set aside, the matched pair passed its empty test, and the uncertain result is waiting for a controlled repeat.</p></div><button className="modal-run" type="button" onClick={onDeck}>CHOOSE ANOTHER MISSION</button></ModalShell>;
}

function Task({ number, title, note, status, onClick }: { number: string; title: string; note: string; status: 'done' | 'active' | 'pending'; onClick?: () => void }) {
  const content = <><span>{status === 'done' ? '✓' : number}</span><div><b>{title}</b><small>{note}</small></div></>;
  return <li className={status}>{onClick ? <button type="button" onClick={onClick}>{content}</button> : content}</li>;
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

function LedgerDrawer({ log, onClose }: { log: LogItem[]; onClose: () => void }) { return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="ledger-drawer" role="dialog" aria-modal="true" aria-label="Event ledger" onClick={(event) => event.stopPropagation()}><header><div><p className="section-kicker">RUN RECORD</p><h2>What happened</h2></div><button type="button" onClick={onClose} aria-label="Close event ledger">×</button></header><p className="drawer-intro">A time-ordered record of the no-sample check, pan identity, native traces, and decisions.</p><ol>{[...log].reverse().map((item, index) => <li key={`${item.time}-${index}`}><time>{item.time}</time><i className={item.type}>{item.type}</i><p>{item.text}</p></li>)}</ol></aside></div>; }
