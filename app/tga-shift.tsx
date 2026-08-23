'use client';

import { useEffect, useMemo, useState } from 'react';
import { DebriefVisual } from './debrief-visual';
import { CampaignControlModal } from './campaign-control';
import { useCampaignStation } from './campaign-context';
import { FieldGuideModal } from './field-guide';
import { LabViewport } from './lab-viewport';
import { PlannerPanel, ShiftDeckModal, type ScenarioId } from './scenario-shifts';
import { baseStations, type Station } from './sim-data';
import { StationAccess } from './station-access';

type Scores = { safety: number; traceability: number; integrity: number; uptime: number };
type LogItem = { time: string; type: string; text: string };
type Modal = 'deck' | 'guide' | 'campaign' | 'baseline' | 'pan' | 'blank' | 'evidence' | 'complete' | null;

const tasks = [
  { title: 'Read thermal-analysis handoff', pending: 'QC-621 assigned', done: 'Baseline context read' },
  { title: 'Disposition baseline excursion', pending: '+0.28 mg offset', done: 'Failed baseline retained' },
  { title: 'Reconcile governed pan set', pending: 'PANSET-14 unresolved', done: 'Matched pair bound' },
  { title: 'Run paired-pan blank', pending: 'Awaiting release', done: 'Blank inside criterion' },
  { title: 'Review coupled thermal event', pending: 'AI proposal queued', done: 'Artifact recheck assigned' },
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
  const [scores, setScores] = useState<Scores>({ safety: 96, traceability: 80, integrity: 72, uptime: 68 });
  const [physicalInspections, setPhysicalInspections] = useState<Record<string, string[]>>({});

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
    return { ...station, state: phase >= 5 ? 'RECHECK QUEUED' : 'REVIEW', tone: 'warn', meta: 'Mass step coincides with purge transient', technicianView: ['Mass onset: 412 °C', 'Heat-flow event: 438 °C', 'Purge transient: 412.5 °C', `AI eligibility: ${phase >= 5 ? 'held' : 'review'}`] };
  }), [phase]);

  const selectedBase = stations.find((station) => station.id === selectedId) ?? stations[6];
  const selected = useCampaignStation(selectedBase);
  const completed = phase >= 5 ? 5 : phase + 1;
  const progress = Math.round(completed / 5 * 100);
  const appendLog = (type: string, text: string, add = 0) => { const next = minute + add; setMinute(next); setLog((items) => [...items, { time: formatTime(next), type, text }]); };
  const penalize = (key: keyof Scores, amount: number) => setScores((value) => ({ ...value, [key]: Math.max(0, value[key] - amount) }));
  const reward = (updates: Partial<Scores>) => setScores((value) => ({ safety: Math.min(100, updates.safety ?? value.safety), traceability: Math.min(100, updates.traceability ?? value.traceability), integrity: Math.min(100, updates.integrity ?? value.integrity), uptime: Math.min(100, updates.uptime ?? value.uptime) }));
  const recordInspection = (stationId: string, inspectionChecks: string[]) => {
    const wasComplete = (physicalInspections[stationId]?.length ?? 0) === 3;
    setPhysicalInspections((current) => ({ ...current, [stationId]: inspectionChecks }));
    if (!wasComplete && inspectionChecks.length === 3) appendLog('inspection', `${stationId} physical walkaround completed; ${inspectionChecks.join(', ')} linked to the local-console evidence gate.`, 1);
  };
  const open = (next: Modal) => { setFeedback(''); if (next === 'baseline') { setChecks({}); setRan(false); } setModal(next); setSelectedId('TGA-01'); };

  const finishBaseline = (correct: boolean) => {
    if (!correct) { penalize('integrity', 16); setFeedback('A software zero would hide the failed baseline without explaining its physical cause. The action is blocked.'); appendLog('exception', 'Attempted digital zero of a failed thermal baseline before pan-set reconciliation; release blocked.', 2); return; }
    setPhase(1); reward({ integrity: scores.integrity + 12, uptime: scores.uptime + 8 }); appendLog('decision', 'Failed empty-pan baseline retained; method held and physical pan-set inspection opened.', 4); window.setTimeout(() => setModal(null), 650);
  };
  const finishPan = (correct: boolean) => {
    if (!correct) { penalize('traceability', 18); setFeedback('Copying the prior pan ID would create a plausible record for a physically mixed pair. The action is blocked.'); appendLog('exception', 'Prior pan-set identity selected without reconciling the mixed Pt/Al pair; association blocked.', 2); return; }
    setPhase(2); reward({ traceability: scores.traceability + 14, integrity: scores.integrity + 6 }); appendLog('lineage', 'Mixed pan pair quarantined; governed Pt/Pt PANSET-14 loaded and bound to method THM-208.', 7); window.setTimeout(() => setModal(null), 650);
  };
  const acquireBlank = () => { setFeedback(''); setBlankRan(true); appendLog('measurement', 'PANSET-14 paired-pan blank acquired with mass, heat-flow, temperature, purge, and method revision channels retained.', 14); };
  const finishBlank = (correct: boolean) => {
    if (!correct) { penalize('integrity', 13); setFeedback('Matched pan identity is necessary, but it does not prove current mass and heat-flow baselines. Material release remains blocked.'); appendLog('exception', 'LOT-91-T release attempted from pan identity alone without a current paired-pan blank; release blocked.', 2); return; }
    setPhase(3); setSelectedId('TGA-01'); reward({ uptime: scores.uptime + 6, integrity: scores.integrity + 6 }); appendLog('qc', 'Paired-pan blank completed at +0.03 mg mass offset and +0.04 mW heat-flow slope inside method criteria; LOT-91-T released.', 2); setFeedback(''); setModal(null);
  };
  const advance = () => { setPhase(4); appendLog('result', 'TGA/DSC run completed; native mass, heat-flow, temperature, purge, and method channels linked.', 58); setFeedback(''); setModal('evidence'); };
  const finishEvidence = (correct: boolean) => {
    if (!correct) { penalize('integrity', 17); setFeedback('The proposed temperature change treats a purge-coupled step as material behavior before repeat evidence exists.'); appendLog('exception', 'AI calcination change accepted before resolving purge-coupled mass discontinuity; proposal held.', 3); return; }
    setPhase(5); reward({ integrity: scores.integrity + 12, traceability: scores.traceability + 5 }); appendLog('decision', 'Purge-coupled event flagged; AI proposal held and matched-pan repeat queued with full trace retained.', 5); setModal('complete'); setFeedback('');
  };

  const actions = [() => open('baseline'), () => open('pan'), () => open('blank'), advance, () => open('evidence'), () => open('complete')];
  const action = getTgaAction(phase, actions);

  return <main className="shell scenario-shell scenario-tga" style={{ '--scenario-accent': '#e2a64f' } as React.CSSProperties}>
    <header className="topbar"><div className="brand-block"><span className="brand-mark">M<span>²</span></span><div><p className="eyebrow">Materials operations simulator</p><h1>SHIFT CONSOLE <span>{'// LAB 04'}</span></h1></div></div><div className="shift-readout"><span className="live-dot" /><div><b>DAY SHIFT</b><small>{formatTime(minute)} · MENLO PARK SIM</small></div></div><div className="header-actions"><button className="campaign-button" type="button" onClick={() => setModal('campaign')}>CAMPAIGN LAB</button><button className="deck-button" type="button" onClick={() => setModal('deck')}>SHIFT DECK <span>5</span></button><button type="button" onClick={() => setModal('guide')}>FIELD GUIDE</button><button type="button" onClick={() => setLogOpen(true)}>EVENT LEDGER <span>{log.length}</span></button><div className="operator-chip"><span>LC</span><b>TECH-07</b></div></div></header>
    <div className="workspace"><aside className="left-rail"><section className="rail-section shift-card"><p className="section-kicker">ACTIVE WORK ORDER</p><div className="wo-title"><span>WO-2987</span><em>{phase === 4 ? 'REVIEW GATE' : phase >= 5 ? 'CLOSED' : 'QC HOLD'}</em></div><h2>Thermal-analysis release</h2><p>Restore TGA/DSC measurement control, reconcile the physical pan set, and keep a purge-coupled artifact from steering synthesis.</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-meta"><span>{completed} / 5 tasks</span><span>{progress}%</span></div></section><section className="rail-section"><p className="section-kicker">SHIFT CHECKLIST</p><ol className="task-list">{tasks.map((task, index) => { const done = index === 4 ? phase >= 5 : phase >= index; const active = !done && index === phase + 1 || index === 4 && phase === 4; const fn = index === 1 ? () => open('baseline') : index === 2 ? () => open('pan') : index === 3 ? () => open('blank') : index === 4 ? (phase === 3 ? advance : () => open('evidence')) : undefined; return <Task key={task.title} number={`0${index + 1}`} title={task.title} note={done ? task.done : task.pending} status={done ? 'done' : active ? 'active' : 'pending'} onClick={active ? fn : undefined} />; })}</ol></section><section className="rail-section handoff-note"><div className="section-title-row"><p className="section-kicker">SHIFT HANDOFF</p><span>3 SIGNALS</span></div><div className="handoff-grid"><div><span>BASELINE</span><b>+0.28 mg</b><small>criterion exceeded</small></div><div><span>PAN SET</span><b>14</b><small>identity unresolved</small></div><div><span>PURGE</span><b>N₂</b><small>trend available</small></div></div></section><section className="rail-section system-boundary"><p className="section-kicker">RECORD PATH</p><div><span>HMI</span><i>balance, furnace + purge state</i></div><div><span>LES</span><i>pan selection + method execution</i></div><div><span>LIMS</span><i>sample, pan set + native traces</i></div></section></aside>
      <section className="lab-view"><div className="lab-heading"><div><p className="section-kicker">LIVE FACILITY MAP</p><h2>High-throughput materials bay</h2></div><div className="legend"><span><i className="ready" />ready</span><span><i className="run" />active</span><span><i className="warn" />attention</span></div></div><LabViewport stations={stations} selectedId={selectedId} phase={phase} scenarioId="tga" inspectionState={physicalInspections} onInspectionChange={recordInspection} onSelect={setSelectedId} /><footer className="facility-footer"><div><span>ENV</span><b>22.0 °C</b><small>40% RH</small></div><div><span>EXHAUST</span><b>NORMAL</b><small>−12 Pa</small></div><div><span>GAS DETECTION</span><b>NORMAL</b><small>6 / 6 online</small></div><div><span>OPEN WORK</span><b>{phase >= 3 ? '9' : '11'}</b><small>{phase >= 2 ? '1' : '2'} waiting release</small></div></footer></section>
      <aside className="right-rail"><section className={`rail-section alert-card tone-${action.tone}`}><div className="alert-head"><span>{action.tag}</span><b>{phase >= 5 ? 'CLOSED' : phase === 4 ? 'REVIEW' : 'ACTIVE'}</b></div><h2>{action.title}</h2><div className="metric-row"><span>Current state</span><strong>{action.metric}</strong></div><p>{action.body}</p><button className="primary-action" type="button" onClick={action.fn}>{action.label}<span>→</span></button></section><section className="rail-section station-inspector"><div className="section-title-row"><p className="section-kicker">STATION INSPECTOR</p><span className={selected.tone}>{selected.state}</span></div><div className="station-identity"><b>{selected.id}</b><h2>{selected.name}</h2></div><div className="readout-list">{selected.technicianView.map((item) => { const [key, value] = item.split(': '); return <div key={item}><span>{key}</span><b>{value}</b></div>; })}</div><p className="mini-label">OUTPUTS</p><div className="tag-list">{selected.dataProducts.map((item) => <span key={item}>{item}</span>)}</div><StationAccess station={selected} scenarioId="tga" physicalChecks={physicalInspections[selected.id] ?? []} /></section><PlannerPanel scenario="tga" phase={phase} /><section className="rail-section score-panel"><div className="section-title-row"><p className="section-kicker">SHIFT HEALTH</p><span>LIVE</span></div><Score label="Safety" value={scores.safety} /><Score label="Traceability" value={scores.traceability} /><Score label="Data integrity" value={scores.integrity} /><Score label="Lab uptime" value={scores.uptime} /></section><section className="rail-section lineage-card"><div className="section-title-row"><p className="section-kicker">EVIDENCE CHAIN</p><span>LIVE</span></div><div className="lineage-flow"><span>LOT-91-T</span><i>→</i><span>PANSET-14</span><i>→</i><span>{phase >= 5 ? 'REPEAT' : phase >= 2 ? 'BOUND' : 'HOLD'}</span></div><p>{phase >= 5 ? 'Native traces retained; AI change held pending repeat.' : phase >= 2 ? 'Sample, governed pan pair, and method agree.' : 'Physical pan identity requires reconciliation.'}</p></section></aside></div>
    {modal === 'deck' && <ShiftDeckModal active="tga" onChoose={onSwitch} onClose={() => setModal(null)} />}
    {modal === 'guide' && <FieldGuideModal onClose={() => setModal(null)} />}
    {modal === 'campaign' && <CampaignControlModal onClose={() => setModal(null)} />}
    {modal === 'baseline' && <BaselineModal checks={checks} setChecks={setChecks} ran={ran} setRan={setRan} feedback={feedback} appendLog={appendLog} onFinish={finishBaseline} onClose={() => setModal(null)} />}
    {modal === 'pan' && <PanModal scanned={scanned} setScanned={setScanned} feedback={feedback} appendLog={appendLog} onFinish={finishPan} onClose={() => setModal(null)} />}
    {modal === 'blank' && <BlankControlModal checks={blankChecks} setChecks={setBlankChecks} acquired={blankRan} onAcquire={acquireBlank} feedback={feedback} onFinish={finishBlank} onClose={() => setModal(null)} />}
    {modal === 'evidence' && <ThermalEvidenceModal feedback={feedback} onFinish={finishEvidence} onClose={() => setModal(null)} />}
    {modal === 'complete' && <TgaCompleteModal scores={scores} logCount={log.length} exceptionCount={log.filter((event) => event.type === 'exception').length} onDeck={() => setModal('deck')} onClose={() => setModal(null)} />}
    {logOpen && <LedgerDrawer log={log} onClose={() => setLogOpen(false)} />}
  </main>;
}

function getTgaAction(phase: number, actions: (() => void)[]) {
  return [
    { tag: 'MEASUREMENT CONTROL', title: 'Empty-pan baseline failed', metric: '+0.28 mg', body: 'The method cannot be released until the failed baseline is retained and its physical setup is reconciled.', label: 'OPEN BASELINE REVIEW', fn: actions[0], tone: 'warn' },
    { tag: 'PAN IDENTITY', title: 'Mixed pan pair suspected', metric: 'PANSET-14', body: 'Method and physical pan materials must agree before a new blank or specimen run.', label: 'RECONCILE PAN SET', fn: actions[1], tone: 'warn' },
    { tag: 'VERIFICATION READY', title: 'Matched-pan blank available', metric: '0 specimens', body: 'Run the governed empty-pan pair under the method atmosphere before releasing material.', label: 'RUN PAIRED-PAN BLANK', fn: actions[2], tone: 'ready' },
    { tag: 'THERMAL ANALYSIS', title: 'LOT-91-T in execution', metric: '64%', body: 'Mass, heat flow, temperature, purge, and method context are being retained together.', label: 'ADVANCE TO RESULT', fn: actions[3], tone: 'run' },
    { tag: 'RESULT REVIEW', title: 'Mass step aligns with purge transient', metric: '412 °C', body: 'The event may not be material behavior. Review coupled channels before the planner changes synthesis.', label: 'REVIEW THERMAL EVENT', fn: actions[4], tone: 'warn' },
    { tag: 'SHIFT COMPLETE', title: 'Thermal evidence safely held', metric: '5 / 5', body: 'The instrument path is controlled and the unresolved event remains visible without steering the optimizer.', label: 'VIEW DEBRIEF', fn: actions[5], tone: 'ready' },
  ][phase] ?? { tag: 'SHIFT COMPLETE', title: 'Thermal evidence safely held', metric: '5 / 5', body: 'The instrument path is controlled.', label: 'VIEW DEBRIEF', fn: actions[5], tone: 'ready' };
}

function BaselineModal({ checks, setChecks, ran, setRan, feedback, appendLog, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; ran: boolean; setRan: (value: boolean) => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['ambient', 'Confirm furnace near ambient', 'A baseline comparison requires a known thermal start state.'], ['purge', 'Verify purge identity + trend', 'Atmosphere and flow history are result context, not a display-only value.'], ['empty', 'Inspect both empty pan positions', 'Residue, damage, or a mismatched pair can bias the measurement path.']];
  const all = items.every(([key]) => checks[key]);
  const run = () => { setRan(true); appendLog('qc', 'TGA-01 empty-pan repeat retained: +0.28 mg offset with +0.42 mW baseline slope.', 8); };
  return <ModalShell title="TGA/DSC baseline disposition" kicker="QC + HMI · TGA-01" onClose={onClose} wide><div className="modal-grid scenario-bench-grid"><div><p className="modal-intro">The empty-pan baseline is outside the release criterion. Verify the physical start state, retain the repeat, then disposition the method without masking the excursion.</p><div className="check-stack">{items.map(([key, title, note]) => <label key={key} className={checks[key] ? 'checked' : ''}><input type="checkbox" checked={Boolean(checks[key])} onChange={() => setChecks((value) => ({ ...value, [key]: !value[key] }))} /><span>{checks[key] ? '✓' : ''}</span><div><b>{title}</b><small>{note}</small></div></label>)}</div><button className="modal-run" type="button" disabled={!all || ran} onClick={run}>{ran ? 'BASELINE RETAINED' : 'REPEAT EMPTY-PAN BASELINE · 8 MIN'}</button></div><div className="instrument-console"><div className="panel-heading"><span>COUPLED BASELINE CHANNELS</span><b>PAN POSITIONS A / B</b></div><TgaTrace baseline ran={ran} /><div className="result-box"><span>MASS OFFSET</span><b>{ran ? '+0.28 mg' : '—'}</b><span>HEAT-FLOW SLOPE</span><b>{ran ? '+0.42 mW' : '—'}</b></div>{ran && <div className="decision-stack"><p className="mini-label">DISPOSITION</p><button type="button" onClick={() => onFinish(true)}>Retain failure · inspect pan set</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Digitally zero · release method</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function PanModal({ scanned, setScanned, feedback, appendLog, onFinish, onClose }: { scanned: boolean; setScanned: (value: boolean) => void; feedback: string; appendLog: (type: string, text: string, add?: number) => void; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const scan = () => { setScanned(true); appendLog('lineage', 'PANSET-14 scan found Pt method record but one physical Al pan in the paired positions.', 3); };
  return <ModalShell title="Pan-set identity reconciliation" kicker="MATERIAL CONTROL · PANSET-14" onClose={onClose} wide><p className="modal-intro">Pan material, geometry, condition, and pair identity belong to the measurement context. Compare the governed method record with the physical carousel.</p><div className="record-compare"><article><span>LES / METHOD RECORD</span><b>THM-208 · REV 4</b><div className="barcode" /><p>PAIR: PT / PT<br />PANSET-14<br />BASELINE LINK REQUIRED</p></article><i>≠</i><article className={scanned ? 'exception-record' : ''}><span>PHYSICAL / CAROUSEL</span><b>{scanned ? 'PT / AL MIXED' : 'AWAITING SCAN'}</b><div className="pan-pair-visual"><i /><i className={scanned ? 'mismatch' : ''} /></div><p>{scanned ? 'POSITION A: Pt · POSITION B: Al' : 'Read both pan IDs and material marks.'}</p></article></div>{!scanned ? <button className="modal-run" type="button" onClick={scan}>SCAN PAN PAIR</button> : <div className="decision-stack horizontal"><button type="button" onClick={() => onFinish(true)}>Quarantine mixed pair · load PANSET-14</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Copy prior pair ID into record</button></div>}{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function BlankControlModal({ checks, setChecks, acquired, onAcquire, feedback, onFinish, onClose }: { checks: Record<string, boolean>; setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; acquired: boolean; onAcquire: () => void; feedback: string; onFinish: (correct: boolean) => void; onClose: () => void }) {
  const items = [['pair', 'PANSET-14 Pt/Pt identity linked'], ['condition', 'Both empty positions clean + undamaged'], ['method', 'Purge trend + method revision retained']];
  const ready = items.every(([key]) => checks[key]);
  return <ModalShell title="Paired-pan blank verification" kicker="MEASUREMENT CONTROL · TGA-01 / PANSET-14" onClose={onClose} wide><div className="modal-grid scenario-bench-grid"><div><p className="modal-intro">A governed pan pair restores identity. A current blank establishes whether the coupled mass and heat-flow channels are actually in control.</p><div className="check-stack">{items.map(([key, title]) => <label key={key} className={checks[key] ? 'checked' : ''}><input type="checkbox" checked={Boolean(checks[key])} onChange={() => setChecks((value) => ({ ...value, [key]: !value[key] }))} /><span>{checks[key] ? '✓' : ''}</span><div><b>{title}</b><small>{key === 'pair' ? 'Physical pair, LES method, and LIMS association agree.' : key === 'condition' ? 'Residue or damage would invalidate the empty-pan comparison.' : 'Atmosphere and program context travel with the blank.'}</small></div></label>)}</div><button className="modal-run" type="button" disabled={!ready || acquired} onClick={onAcquire}>{acquired ? 'COUPLED BLANK RETAINED' : 'ACQUIRE PAIRED-PAN BLANK'}</button>{!acquired && <button className="blank-release-shortcut" type="button" onClick={() => onFinish(false)}>Release from matched pan identity only</button>}</div><div className="instrument-console"><div className="panel-heading"><span>COUPLED BLANK CHANNELS</span><b>THM-208 · REV 4</b></div><TgaBlankTrace acquired={acquired} /><div className="result-box"><span>MASS OFFSET</span><b>{acquired ? '+0.03 mg' : '—'}</b><span>HEAT-FLOW SLOPE</span><b>{acquired ? '+0.04 mW' : '—'}</b></div>{acquired && <div className="blank-verdict"><span>METHOD CRITERIA</span><b>MASS + HEAT FLOW PASS</b><i>IN CONTROL</i></div>}{acquired && <div className="decision-stack"><button type="button" onClick={() => onFinish(true)}>Retain blank · release LOT-91-T</button></div>}</div></div>{feedback && <p className="feedback bad">{feedback}</p>}<p className="concept-note">Conceptual training · actual pan conditioning, purge, temperature program, and acceptance limits remain method-specific.</p></ModalShell>;
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
  return <ModalShell title="Coupled thermal-event review" kicker="RESULT GATE · RUN THM-208-41" onClose={onClose} wide><div className="evidence-grid"><div className="trace-panel"><div className="panel-heading"><span>TGA + DSC + PURGE</span><b>TGA-01 · LOT-91-T</b></div><TgaTrace /><div className="axis"><span>25 °C</span><b>TEMPERATURE</b><span>800 °C</span></div></div><div className="report-panel"><div className="panel-heading"><span>COUPLED CHANNEL REVIEW</span><b>method rev 4</b></div><div className="report-metric"><span>Mass-step onset</span><b>412.0 °C</b></div><div className="report-metric"><span>Purge transient</span><b>412.5 °C</b></div><div className="report-metric"><span>Heat-flow event</span><b>438 °C</b></div><div className="report-status warn-status">CAUSALITY UNRESOLVED</div><p>Temporal alignment is evidence for review, not proof of material behavior.</p></div></div><div className="ai-proposal"><div><span>AI PLANNER · PROPOSED NEXT RUN</span><h3>Lower calcination peak by 25 °C</h3><p>Inferred decomposition onset: 412 °C · confidence 0.79</p></div><b>READY</b></div><div className="decision-stack horizontal evidence-actions"><button type="button" onClick={() => onFinish(true)}>Flag coupled event · queue matched-pan repeat</button><button type="button" className="secondary" onClick={() => onFinish(false)}>Accept AI temperature change</button></div>{feedback && <p className="feedback bad">{feedback}</p>}</ModalShell>;
}

function TgaTrace({ baseline = false, ran = true }: { baseline?: boolean; ran?: boolean }) {
  return <svg className="tga-trace-chart" viewBox="0 0 440 190" role="img" aria-label={baseline ? 'Simulated failed TGA and DSC empty-pan baseline' : 'Simulated TGA, DSC, and purge traces with a coupled event'}>
    {[35, 75, 115, 155].map((y) => <line key={y} className="trace-grid" x1="28" y1={y} x2="424" y2={y} />)}
    {[88, 168, 248, 328, 408].map((x) => <line key={x} className="trace-grid" x1={x} y1="18" x2={x} y2="168" />)}
    <text x="8" y="39">MASS</text><text x="8" y="119">DSC</text>{!baseline && <text x="8" y="159">N₂</text>}
    {ran && <><path className="trace-mass" d={baseline ? 'M28 42 C120 41 215 45 300 48 S380 52 424 55' : 'M28 38 C110 38 178 40 238 43 L252 71 C305 74 357 76 424 80'} /><path className="trace-dsc" d={baseline ? 'M28 128 C120 126 220 123 310 119 S390 114 424 111' : 'M28 128 C145 128 232 126 270 119 C292 92 314 91 338 123 C365 128 394 128 424 127'} />{!baseline && <path className="trace-purge" d="M28 157 H236 L250 144 L263 159 H424" />}{!baseline && <line className="event-marker" x1="249" y1="18" x2="249" y2="168" />}{!baseline && <text className="event-label" x="257" y="28">COUPLED EVENT</text>}</>}
  </svg>;
}

function TgaCompleteModal({ scores, logCount, exceptionCount, onDeck, onClose }: { scores: Scores; logCount: number; exceptionCount: number; onDeck: () => void; onClose: () => void }) {
  const total = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / 4);
  return <ModalShell title="Campaign debrief" kicker="WO-2987 · COMPLETE" onClose={onClose}><div className="debrief-score"><span>RUN RATING</span><b>{total}</b><i>/ 100</i></div><p className="modal-intro">You retained a failed baseline, reconciled the governed pan pair, restored measurement control, and stopped a purge-coupled artifact from changing synthesis.</p><DebriefVisual scenario="tga" scores={scores} exceptionCount={exceptionCount} /><div className="debrief-grid"><span>Safety<b>{scores.safety}</b></span><span>Traceability<b>{scores.traceability}</b></span><span>Data integrity<b>{scores.integrity}</b></span><span>Uptime<b>{scores.uptime}</b></span></div><div className="lesson-card"><b>System insight</b><p>Thermal curves only become scientific evidence when pan identity, atmosphere, baseline state, sample mass, and coupled channels remain linked.</p></div><p className="debrief-meta">{logCount} run events captured · baseline and native traces retained</p><button className="modal-run" type="button" onClick={onDeck}>CHOOSE ANOTHER INCIDENT</button></ModalShell>;
}

function Task({ number, title, note, status, onClick }: { number: string; title: string; note: string; status: 'done' | 'active' | 'pending'; onClick?: () => void }) {
  const content = <><span>{status === 'done' ? '✓' : number}</span><div><b>{title}</b><small>{note}</small></div></>;
  return <li className={status}>{onClick ? <button type="button" onClick={onClick}>{content}</button> : content}</li>;
}

function Score({ label, value }: { label: string; value: number }) { return <div className="score-row"><div><span>{label}</span><b>{value}</b></div><div className="score-track"><i style={{ width: `${value}%` }} /></div></div>; }

function ModalShell({ title, kicker, children, onClose, wide = false }: { title: string; kicker: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) { return <div className="modal-backdrop" role="presentation"><section className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</section></div>; }

function LedgerDrawer({ log, onClose }: { log: LogItem[]; onClose: () => void }) { return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="ledger-drawer" role="dialog" aria-modal="true" aria-label="Event ledger" onClick={(event) => event.stopPropagation()}><header><div><p className="section-kicker">RUN RECORD</p><h2>Event ledger</h2></div><button type="button" onClick={onClose}>×</button></header><p className="drawer-intro">A chronological record of physical checks, baseline control, pan identity, native traces, and operator decisions.</p><ol>{[...log].reverse().map((item, index) => <li key={`${item.time}-${index}`}><time>{item.time}</time><i className={item.type}>{item.type}</i><p>{item.text}</p></li>)}</ol></aside></div>; }
