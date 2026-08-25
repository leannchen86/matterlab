'use client';

import { useEffect, useMemo, useState } from 'react';
import { DebriefVisual } from './debrief-visual';
import { CampaignControlModal } from './campaign-control';
import { SystemsAtlasModal } from './systems-atlas';
import { LabViewport } from './lab-viewport';
import { MissionTelemetry } from './mission-ui';
import { ShiftDeckModal, type ScenarioId } from './scenario-shifts';
import { baseStations, type Station } from './sim-data';
import { StationAccess } from './station-access';

type Scores = { safety: number; traceability: number; integrity: number; uptime: number };
type LogItem = { time: string; type: string; text: string };
type Modal = 'deck' | 'guide' | 'campaign' | 'campaign-facility' | 'baseline' | 'pan' | 'blank' | 'evidence' | 'complete' | null;

const tasks = [
  { title: 'Review the failed check', pending: 'Reading is off by +0.28 mg', done: 'Failed check saved' },
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
  const [log, setLog] = useState<LogItem[]>([
    { time: '14:52', type: 'handoff', text: 'TGA-01 empty-pan baseline exceeded the mass-offset criterion; method release held.' },
    { time: '15:03', type: 'system', text: 'WO-2987 assigned to TECH-07 with PANSET-14 identity unresolved.' },
  ]);
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
    if (station.id !== 'TGA-01') return station;
    if (phase === 0) return { ...station, state: 'BASELINE HOLD', tone: 'warn', meta: 'Empty-pan offset · +0.28 mg', technicianView: ['Furnace: 28 °C', 'Purge N₂: stable', 'Mass offset: +0.28 mg', 'Method release: held'] };
    if (phase < 3) return { ...station, state: 'METHOD HOLD', tone: 'hold', meta: phase === 1 ? 'Pan-set reconciliation required' : 'Matched pans loaded · blank pending', technicianView: ['Pan set: PANSET-14', `Pair state: ${phase >= 2 ? 'matched' : 'mixed alloy'}`, 'Purge N₂: 60 mL/min', 'Blank: awaiting run'] };
    if (phase === 3) return { ...station, state: 'ANALYZING', tone: 'run', meta: 'LOT-91-T · thermal program active', technicianView: ['Program: THM-208 rev 4', 'Sample mass: 12.84 mg', 'Purge N₂: stable', 'Progress: 64%'] };
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
    if (!correct) { penalize('integrity', 16); setFeedback('A software zero would hide the failed baseline without explaining its physical cause. The action is blocked.'); appendLog('exception', 'Attempted digital zero of a failed thermal baseline before pan-set reconciliation; release blocked.', 2); return; }
    setPhase(1); reward({ integrity: scores.integrity + 12, uptime: scores.uptime + 8 }); appendLog('decision', 'Failed empty-pan baseline retained; method held and physical pan-set inspection opened.', 2); window.setTimeout(() => setModal(null), 650);
  };
  const finishPan = (correct: boolean) => {
    if (!correct) { penalize('traceability', 18); setFeedback('Copying the prior pan ID would create a plausible record for a physically mixed pair. The action is blocked.'); appendLog('exception', 'Prior pan-set identity selected without reconciling the mixed Pt/Al pair; association blocked.', 2); return; }
    setPhase(2); reward({ traceability: scores.traceability + 14, integrity: scores.integrity + 6 }); appendLog('lineage', 'Mixed pan pair set aside. Matching platinum PANSET-14 loaded for method THM-208.', 2); window.setTimeout(() => setModal(null), 650);
  };
  const acquireBlank = () => { setFeedback(''); setBlankRan(true); appendLog('measurement', 'PANSET-14 paired-pan blank acquired with mass, heat-flow, temperature, purge, and method revision channels retained.', 14); };
  const finishBlank = (correct: boolean) => {
    if (!correct) { penalize('integrity', 13); setFeedback('Matched pan identity is necessary, but it does not prove current mass and heat-flow baselines. Material release remains blocked.'); appendLog('exception', 'LOT-91-T release attempted from pan identity alone without a current paired-pan blank; release blocked.', 2); return; }
    setPhase(3); setSelectedId('TGA-01'); reward({ uptime: scores.uptime + 6, integrity: scores.integrity + 6 }); appendLog('qc', 'Paired-pan blank completed at +0.03 mg mass offset and +0.04 mW heat-flow slope inside method criteria; LOT-91-T released.', 2); setFeedback(''); setModal(null);
  };
  const advance = () => { setPhase(4); appendLog('result', 'TGA/DSC run completed; native mass, heat-flow, temperature, purge, and method channels linked.', 58); setFeedback(''); setModal('evidence'); };
  const finishEvidence = (correct: boolean) => {
    if (!correct) { penalize('integrity', 17); setFeedback('The temperature change treats a gas-flow overlap as sample behavior before a repeat exists.'); appendLog('exception', 'Temperature change attempted before resolving the gas-flow overlap; suggestion held.', 3); return; }
    setPhase(5); reward({ integrity: scores.integrity + 12, traceability: scores.traceability + 5 }); appendLog('decision', 'Gas-flow overlap flagged; temperature change held and matched-pan repeat queued.', 5); setModal('complete'); setFeedback('');
  };

  const actions = [() => open('baseline'), () => open('pan'), () => open('blank'), advance, () => open('evidence'), () => open('complete')];
  const action = getTgaAction(phase, actions);

  return <main className="shell scenario-shell scenario-tga" style={{ '--scenario-accent': '#e2a64f' } as React.CSSProperties}>
    <header className="topbar"><div className="brand-block"><span className="brand-mark">M<span>²</span></span><div><p className="eyebrow">Explore · experiment · learn</p><h1>MATTERSHIFT</h1></div></div><div className="shift-readout"><span className="live-dot" /><div><b>SIMULATION READY</b><small>{formatTime(minute)} · FICTIONAL LAB</small></div></div><div className="header-actions"><button className="campaign-button" type="button" onClick={() => setModal('campaign')}>ADVANCED MODE</button><button className="deck-button" type="button" onClick={() => setModal('deck')}>SCENARIOS <span>5</span></button><button type="button" onClick={() => setModal('guide')}>FIELD MANUAL</button><button type="button" onClick={() => setLogOpen(true)}>RUN LOG <span>{log.length}</span></button></div></header>
    <div className="workspace"><aside className="left-rail"><section className="rail-section shift-card"><p className="section-kicker">CURRENT MISSION</p><div className="wo-title"><span>WO-2987</span><em>{phase === 4 ? 'REVIEW GATE' : phase >= 5 ? 'CLOSED' : 'QC HOLD'}</em></div><h2>Fix the thermal-analysis baseline</h2><p>Correct the setup, match the sample pans, and decide whether the result is trustworthy.</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-meta"><span>{completed} / 4 tasks</span><span>{progress}%</span></div><MissionTelemetry elapsedMinutes={minute - (15 * 60 + 8)} blockedAttempts={log.filter((event) => event.type === 'exception').length} evidenceCount={Math.max(0, log.length - 2)} /></section><section className="rail-section"><p className="section-kicker">MISSION STEPS</p><ol className="task-list">{tasks.map((task, index) => { const done = index === 3 ? phase >= 5 : phase > index; const active = !done && (index === phase || (index === 3 && (phase === 3 || phase === 4))); const actionsForTask = [() => open('baseline'), () => open('pan'), () => open('blank'), () => phase === 3 ? advance() : open('evidence')]; return <Task key={task.title} number={`0${index + 1}`} title={task.title} note={done ? task.done : task.pending} status={done ? 'done' : active ? 'active' : 'pending'} onClick={active ? actionsForTask[index] : undefined} />; })}</ol></section></aside>
      <section className="lab-view"><div className="lab-heading"><div><p className="section-kicker">EXPLORE THE LAB</p><h2>Select a station to see what it does</h2></div><div className="legend"><span><i className="ready" />ready</span><span><i className="run" />active</span><span><i className="warn" />attention</span></div></div><LabViewport stations={stations} selectedId={selectedId} phase={phase} scenarioId="tga" inspectionState={physicalInspections} onInspectionChange={recordInspection} onSelect={setSelectedId} /></section>
      <aside className="right-rail"><section className={`rail-section alert-card tone-${action.tone}`}><div className="alert-head"><span>{action.tag}</span><b>{phase >= 5 ? 'CLOSED' : phase === 4 ? 'REVIEW' : 'ACTIVE'}</b></div><h2>{action.title}</h2><div className="metric-row"><span>Current state</span><strong>{action.metric}</strong></div><p>{action.body}</p><button className="primary-action" type="button" onClick={action.fn}>{action.label}<span>→</span></button></section><section className="rail-section station-inspector"><div className="section-title-row"><p className="section-kicker">SELECTED EQUIPMENT · SIMULATED</p><span className={selected.tone}>{selected.state}</span></div><div className="station-identity"><b>{selected.id}</b><h2>{selected.name}</h2></div><div className="readout-list">{selected.technicianView.map((item) => { const [key, value] = item.split(': '); return <div key={item}><span>{key}</span><b>{value}</b></div>; })}</div><StationAccess station={selected} scenarioId="tga" physicalChecks={physicalInspections[selected.id] ?? []} /></section><section className="rail-section score-panel"><div className="section-title-row"><p className="section-kicker">MISSION SCORE</p><span>STARTS AT 100</span></div><Score label="Safety" value={scores.safety} /><Score label="Traceability" value={scores.traceability} /><Score label="Data integrity" value={scores.integrity} /><Score label="Lab uptime" value={scores.uptime} /></section><section className="rail-section lineage-card"><div className="section-title-row"><p className="section-kicker">EVIDENCE CHAIN</p><span>SIM</span></div><div className="lineage-flow"><span>LOT-91-T</span><i>→</i><span>PANSET-14</span><i>→</i><span>{phase >= 5 ? 'REPEAT' : phase >= 2 ? 'MATCH' : 'HOLD'}</span></div><p>{phase >= 5 ? 'The original result is saved and a repeat is queued.' : phase >= 2 ? 'The sample, matching pans, and method agree.' : 'The physical pan pair still needs to be checked.'}</p></section></aside></div>
    {modal === 'deck' && <ShiftDeckModal active="tga" onChoose={onSwitch} onClose={() => setModal(null)} />}
    {modal === 'guide' && <SystemsAtlasModal onClose={() => setModal(null)} />}
    {(modal === 'campaign' || modal === 'campaign-facility') && <CampaignControlModal autoOpenFacility={modal === 'campaign-facility'} onClose={() => setModal(null)} />}
    {modal === 'baseline' && <BaselineModal checks={checks} setChecks={setChecks} ran={ran} setRan={setRan} feedback={feedback} appendLog={appendLog} onFinish={finishBaseline} onClose={() => setModal(null)} />}
    {modal === 'pan' && <PanModal scanned={scanned} setScanned={setScanned} feedback={feedback} appendLog={appendLog} onFinish={finishPan} onClose={() => setModal(null)} />}
    {modal === 'blank' && <BlankControlModal checks={blankChecks} setChecks={setBlankChecks} acquired={blankRan} onAcquire={acquireBlank} feedback={feedback} onFinish={finishBlank} onClose={() => setModal(null)} />}
    {modal === 'evidence' && <ThermalEvidenceModal feedback={feedback} onFinish={finishEvidence} onClose={() => setModal(null)} />}
    {modal === 'complete' && <TgaCompleteModal scores={scores} elapsedMinutes={minute - (15 * 60 + 8)} logCount={log.length} exceptionCount={log.filter((event) => event.type === 'exception').length} onDeck={() => setModal('deck')} onClose={() => setModal(null)} />}
    {logOpen && <LedgerDrawer log={log} onClose={() => setLogOpen(false)} />}
  </main>;
}

function getTgaAction(phase: number, actions: (() => void)[]) {
  return [
    { tag: 'NEXT STEP', title: 'The empty-pan check failed', metric: 'Needs review', body: 'Find out whether the setup—not the sample—caused the bad reading.', label: 'CHECK THE BASELINE', fn: actions[0], tone: 'warn' },
    { tag: 'NEXT STEP', title: 'The pans may be mixed up', metric: '2 pan types', body: 'Match the physical pans to the method before running another test.', label: 'CHECK THE PANS', fn: actions[1], tone: 'warn' },
    { tag: 'NEXT STEP', title: 'Run one empty test', metric: 'Ready', body: 'Use the matching empty pans to prove the setup is working.', label: 'RUN THE EMPTY TEST', fn: actions[2], tone: 'ready' },
    { tag: 'IN PROGRESS', title: 'The sample is heating', metric: '64%', body: 'Complete the simulated acquisition to inspect the result.', label: 'COMPLETE TEST · 58 MIN', fn: actions[3], tone: 'run' },
    { tag: 'NEXT STEP', title: 'The result may include a gas-flow artifact', metric: 'One unusual change', body: 'Compare the signals before treating the change as real sample behavior.', label: 'REVIEW THE RESULT', fn: actions[4], tone: 'warn' },
    { tag: 'MISSION COMPLETE', title: 'The result is safely held for a repeat', metric: '4 / 4', body: 'You fixed the setup and did not overclaim an uncertain result.', label: 'VIEW SUMMARY', fn: actions[5], tone: 'ready' },
  ][phase] ?? { tag: 'MISSION COMPLETE', title: 'Thermal evidence safely held', metric: '4 / 4', body: 'The instrument path is controlled.', label: 'VIEW SUMMARY', fn: actions[5], tone: 'ready' };
}

function BaselineModal({ setChecks, ran, setRan, feedback, appendLog, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; ran: boolean; setRan: (value: boolean) => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['ambient', 'Start near room temperature', 'The comparison needs the same starting temperature.'], ['purge', 'Check the gas and flow', 'A gas-flow change can alter the reading.'], ['empty', 'Inspect both empty pans', 'Residue, damage, or mixed pans can shift the baseline.']];
  const run = () => { setChecks({ ambient: true, purge: true, empty: true }); setRan(true); appendLog('qc', 'TGA-01 empty-pan repeat retained: +0.28 mg offset with +0.42 mW baseline slope.', 8); };
  return <ModalShell title="Review the failed empty-pan check" kicker="STEP 1 · MACHINE CHECK" onClose={onClose} wide><div className="modal-grid scenario-bench-grid"><div><p className="modal-intro">The machine drifted with no sample loaded. Choose between an eight-minute repeat or a software zero that consumes no lab time.</p><div className="evidence-brief">{items.map(([key, title, note]) => <article key={key}><i>•</i><div><b>{title}</b><small>{note}</small></div></article>)}</div><button className="modal-run" type="button" disabled={ran} onClick={run}>{ran ? 'FAILED CHECK SAVED' : 'REPEAT EMPTY-PAN CHECK · 8 MIN'}</button>{!ran && <button className="blank-release-shortcut" type="button" onClick={() => onFinish(false)}>Apply software zero · 0 min</button>}</div><div className="instrument-console"><div className="panel-heading"><span>MASS (mg) + HEAT FLOW (mW) VS TIME</span><b>PAN POSITIONS A / B</b></div><TgaTrace baseline ran={ran} /><div className="result-box"><span>MASS OFFSET</span><b>{ran ? '+0.28 mg' : '—'}</b><span>HEAT-FLOW SLOPE</span><b>{ran ? '+0.42 mW' : '—'}</b></div>{ran && <div className="decision-stack"><p className="mini-label">CHOOSE THE NEXT STATE</p><button type="button" onClick={() => onFinish(true)}>Save the failure and inspect the pans</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Zero the displayed offset and continue</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function PanModal({ scanned, setScanned, feedback, appendLog, onFinish, onClose }: { scanned: boolean; setScanned: (value: boolean) => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const scan = () => { setScanned(true); appendLog('lineage', 'PANSET-14 scan found Pt method record but one physical Al pan in the paired positions.', 3); };
  return <ModalShell title="Match the sample pans" kicker="STEP 2 · PHYSICAL CHECK" onClose={onClose} wide><p className="modal-intro">The method expects two platinum pans. Scan what is physically loaded and compare it with the record.</p><div className="record-compare"><article><span>EXPECTED PAIR</span><b>THM-208 · REV 4</b><div className="barcode" /><p>PLATINUM / PLATINUM<br />PANSET-14</p></article><i>≠</i><article className={scanned ? 'exception-record' : ''}><span>WHAT IS LOADED</span><b>{scanned ? 'PLATINUM / ALUMINUM' : 'AWAITING SCAN'}</b><div className="pan-pair-visual"><i /><i className={scanned ? 'mismatch' : ''} /></div><p>{scanned ? 'POSITION A: Pt · POSITION B: Al' : 'Read both pan IDs and material marks.'}</p></article></div>{!scanned ? <button className="modal-run" type="button" onClick={scan}>SCAN BOTH PANS</button> : <div className="decision-stack horizontal"><button type="button" onClick={() => onFinish(true)}>Set aside the mixed pair and load PANSET-14</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Copy the old pan ID into the record</button></div>}{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function BlankControlModal({ setChecks, acquired, onAcquire, feedback, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; acquired: boolean; onAcquire: () => void; feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['pair', 'PANSET-14 Pt/Pt identity linked'], ['condition', 'Both empty positions clean + undamaged'], ['method', 'Purge trend + method revision retained']];
  const acquire = () => { setChecks({ pair: true, condition: true, method: true }); onAcquire(); };
  return <ModalShell title="Run the empty-pan test" kicker="STEP 3 · SETUP TEST" onClose={onClose} wide><div className="modal-grid scenario-bench-grid"><div><p className="modal-intro">The pans now match. Run one empty test to prove both measurement channels are stable.</p><div className="evidence-brief">{items.map(([key, title]) => <article key={key}><i>•</i><div><b>{title}</b><small>{key === 'pair' ? 'The physical pans and method agree.' : key === 'condition' ? 'Residue or damage would ruin the comparison.' : 'The gas flow and heating program are saved with the result.'}</small></div></article>)}</div><button className="modal-run" type="button" disabled={acquired} onClick={acquire}>{acquired ? 'EMPTY TEST SAVED' : 'RUN EMPTY-PAN TEST · 14 MIN'}</button>{!acquired && <button className="blank-release-shortcut" type="button" onClick={() => onFinish(false)}>Skip because the pans match · 0 min</button>}</div><div className="instrument-console"><div className="panel-heading"><span>MASS (mg) + HEAT FLOW (mW) VS TIME</span><b>THM-208 · REV 4</b></div><TgaBlankTrace acquired={acquired} /><div className="result-box"><span>MASS OFFSET</span><b>{acquired ? '+0.03 mg' : '—'}</b><span>HEAT-FLOW SLOPE</span><b>{acquired ? '+0.04 mW' : '—'}</b></div>{acquired && <div className="blank-verdict"><span>TEST RESULT</span><b>MASS + HEAT FLOW PASS</b><i>READY</i></div>}{acquired && <div className="decision-stack"><button type="button" onClick={() => onFinish(true)}>Save test + release sample · 2 min</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}<p className="concept-note">Simulation only · real pan preparation and limits depend on the method and instrument.</p></ModalShell>;
}

function TgaBlankTrace({ acquired }: { acquired: boolean }) {
  return <svg className="tga-trace-chart blank-control-chart" viewBox="0 0 440 190" role="img" aria-label={acquired ? 'Accepted paired-pan TGA mass and DSC heat-flow blank with stable purge trace' : 'Paired-pan blank channels awaiting acquisition'}>
    {[35,75,115,155].map((y) => <line key={y} className="trace-grid" x1="28" y1={y} x2="424" y2={y} />)}{[88,168,248,328,408].map((x) => <line key={x} className="trace-grid" x1={x} y1="18" x2={x} y2="168" />)}
    <rect className="blank-band mass" x="28" y="33" width="396" height="20" /><rect className="blank-band heat" x="28" y="111" width="396" height="22" />
    <text x="8" y="45">MASS</text><text x="8" y="124">DSC</text><text x="8" y="159">N₂</text>
    {acquired ? <><path className="blank-mass" d="M28 43 C105 42 173 45 244 43 S357 44 424 42" /><path className="blank-heat" d="M28 122 C105 124 184 121 252 123 S355 120 424 122" /><path className="blank-purge" d="M28 157 C142 156 262 158 424 157" /></> : <><path className="blank-awaiting" d="M28 43H424M28 122H424M28 157H424" /><text x="226" y="91" textAnchor="middle">ACQUISITION HELD</text></>}
    {acquired && <text className="blank-pass" x="416" y="28" textAnchor="end">COUPLED BLANK · PASS</text>}
  </svg>;
}

function ThermalEvidenceModal({ feedback, onFinish, onClose }: { feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  return <ModalShell title="Review the unusual thermal result" kicker="STEP 4 · RESULT CHECK" onClose={onClose} wide><div className="decision-question"><span>DECISION</span><b>Which event should the next experiment test?</b></div><div className="evidence-grid"><div className="trace-panel"><div className="panel-heading"><span>MASS + HEAT FLOW + GAS FLOW</span><b>TGA-01 · LOT-91-T</b></div><TgaTrace /><div className="axis"><span>25 °C</span><b>TEMPERATURE</b><span>800 °C</span></div></div><div className="report-panel"><div className="panel-heading"><span>EVENT TIMING</span><b>method rev 4</b></div><div className="report-metric"><span>Mass change</span><b>412.0 °C</b></div><div className="report-metric"><span>Gas-flow change</span><b>412.5 °C</b></div><div className="report-metric"><span>Heat-flow event</span><b>438 °C</b></div><div className="report-status warn-status">CAUSE NOT PROVEN</div><p>The mass and gas-flow changes are 0.5 °C apart. The heat-flow event occurs 26 °C later.</p></div></div><div className="ai-proposal"><div><span>AUTOMATED SUGGESTION · SIMULATED</span><h3>Lower the material’s heating temperature by 25 °C</h3><p>Generated from the 412.0 °C mass event.</p></div><b>WAITING</b></div><div className="decision-stack horizontal evidence-actions"><button type="button" onClick={() => onFinish(true)}>Repeat while controlling the gas-flow change</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Lower temperature from the 412 °C event</button></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function TgaTrace({ baseline = false, ran = true }: { baseline?: boolean; ran?: boolean }) {
  return <svg className="tga-trace-chart" viewBox="0 0 440 190" role="img" aria-label={baseline ? 'Simulated failed TGA and DSC empty-pan baseline' : 'Simulated TGA, DSC, and purge traces with a coupled event'}>
    {[35, 75, 115, 155].map((y) => <line key={y} className="trace-grid" x1="28" y1={y} x2="424" y2={y} />)}
    {[88, 168, 248, 328, 408].map((x) => <line key={x} className="trace-grid" x1={x} y1="18" x2={x} y2="168" />)}
    <text x="8" y="39">MASS</text><text x="8" y="119">DSC</text>{!baseline && <text x="8" y="159">N₂</text>}
    {ran && <><path className="trace-mass" d={baseline ? 'M28 42 C120 41 215 45 300 48 S380 52 424 55' : 'M28 38 C110 38 178 40 238 43 L252 71 C305 74 357 76 424 80'} /><path className="trace-dsc" d={baseline ? 'M28 128 C120 126 220 123 310 119 S390 114 424 111' : 'M28 128 C145 128 232 126 270 119 C292 92 314 91 338 123 C365 128 394 128 424 127'} />{!baseline && <path className="trace-purge" d="M28 157 H236 L250 144 L263 159 H424" />}{!baseline && <line className="event-marker" x1="249" y1="18" x2="249" y2="168" />}{!baseline && <text className="event-label" x="257" y="28">COUPLED EVENT</text>}</>}
  </svg>;
}

function TgaCompleteModal({ scores, elapsedMinutes, logCount, exceptionCount, onDeck, onClose }: { scores: Scores; elapsedMinutes: number; logCount: number; exceptionCount: number; onDeck: () => void; onClose: () => void }) {
  return <ModalShell title="Mission debrief" kicker="WO-2987 · COMPLETE" onClose={onClose}><p className="modal-intro">You saved the failed baseline, matched the pans, proved the empty setup, and refused to overclaim an uncertain result.</p><DebriefVisual scenario="tga" scores={scores} elapsedMinutes={elapsedMinutes} logCount={logCount} exceptionCount={exceptionCount} /><div className="lesson-card"><b>What changed in the lab</b><p>The mixed pans are set aside, PANSET-14 passed its empty test, and the gas-overlap result is waiting for a controlled repeat.</p></div><button className="modal-run" type="button" onClick={onDeck}>CHOOSE ANOTHER MISSION</button></ModalShell>;
}

function Task({ number, title, note, status, onClick }: { number: string; title: string; note: string; status: 'done' | 'active' | 'pending'; onClick?: () => void }) {
  const content = <><span>{status === 'done' ? '✓' : number}</span><div><b>{title}</b><small>{note}</small></div></>;
  return <li className={status}>{onClick ? <button type="button" onClick={onClick}>{content}</button> : content}</li>;
}

function Score({ label, value }: { label: string; value: number }) { return <div className="score-row"><div><span>{label}</span><b>{value}</b></div><div className="score-track"><i style={{ width: `${value}%` }} /></div></div>; }

function ModalShell({ title, kicker, children, onClose, wide = false }: { title: string; kicker: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation"><section className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</section></div>;
}

function LedgerDrawer({ log, onClose }: { log: LogItem[]; onClose: () => void }) { return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="ledger-drawer" role="dialog" aria-modal="true" aria-label="Event ledger" onClick={(event) => event.stopPropagation()}><header><div><p className="section-kicker">RUN RECORD</p><h2>Event ledger</h2></div><button type="button" onClick={onClose} aria-label="Close event ledger">×</button></header><p className="drawer-intro">A chronological record of physical checks, baseline control, pan identity, native traces, and operator decisions.</p><ol>{[...log].reverse().map((item, index) => <li key={`${item.time}-${index}`}><time>{item.time}</time><i className={item.type}>{item.type}</i><p>{item.text}</p></li>)}</ol></aside></div>; }
