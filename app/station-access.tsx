'use client';

import { useState } from 'react';
import type { Station } from './sim-data';

type Tab = 'hmi' | 'les' | 'lims' | 'cmms';
type ScenarioId = 'xrd' | 'bet' | 'furnace';

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
};

export function StationAccess({ station, scenarioId = 'xrd', physicalChecks = [] }: { station: Station; scenarioId?: ScenarioId; physicalChecks?: string[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('hmi');
  const [completed, setCompleted] = useState<Record<Tab, boolean>>({ hmi: false, les: false, lims: false, cmms: false });
  const profile = profiles[station.id] ?? profiles['XRD-03'];
  const finish = () => setCompleted((current) => ({ ...current, [tab]: true }));

  return <>
    <button className="station-access-button" type="button" onClick={() => setOpen(true)}><span>⌁</span><b>OPEN LOCAL CONSOLE</b><i>{physicalChecks.length === 3 ? 'WALK ✓ · ' : `WALK ${physicalChecks.length}/3 · `}HMI · LES · LIMS · CMMS</i><em>→</em></button>
    {open && <div className="modal-backdrop station-console-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section className="modal-card wide station-console" role="dialog" aria-modal="true" aria-label={`${station.name} local station console`}>
        <header><div><p className="section-kicker">LOCAL STATION ACCESS · {profile.controller}</p><h2>{station.id} / {station.name}</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></header>
        <div className="console-shell">
          <nav className="console-nav" aria-label="Station systems">
            {Object.entries(TAB_META).map(([id, meta]) => <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id as Tab)}>
              <span>{meta.icon}</span><b>{meta.label}</b><small>{meta.sub}</small>{completed[id as Tab] && <i>✓</i>}
            </button>)}
          </nav>
          <div className="console-main">
            <div className="console-statusbar"><span><i className="online" />PLC ONLINE</span><span>ROLE <b>TECH-07</b></span><span>WALK <b>{physicalChecks.length}/3</b></span><span><i className={station.tone === 'warn' ? 'alarm' : station.tone === 'off' ? '' : 'online'} />{station.state}</span></div>
            {tab === 'hmi' && <HmiView station={station} profile={profile} physicalChecks={physicalChecks} complete={completed.hmi} onComplete={finish} />}
            {tab === 'les' && <LesView station={station} profile={profile} complete={completed.les} onComplete={finish} />}
            {tab === 'lims' && <LimsView profile={profile} scenarioId={scenarioId} complete={completed.lims} onComplete={finish} />}
            {tab === 'cmms' && <CmmsView profile={profile} complete={completed.cmms} onComplete={finish} />}
          </div>
        </div>
      </section>
    </div>}
  </>;
}

function HmiView({ station, profile, physicalChecks, complete, onComplete }: { station: Station; profile: typeof profiles[string]; physicalChecks: string[]; complete: boolean; onComplete: () => void }) {
  const releaseBlocked = station.tone === 'warn' || station.tone === 'off' || station.tone === 'hold';
  const walkaroundComplete = physicalChecks.length === 3;
  return <div className="console-view hmi-view">
    <div className="console-view-head"><div><p className="section-kicker">HMI / SCADA</p><h3>Equipment state + permissives</h3></div><span>REFRESH 250 ms</span></div>
    <div className="hmi-layout">
      <div className="instrument-mimic"><InstrumentMimic stationId={station.id} tone={station.tone} /><div className="mimic-caption"><span>ASSET MIMIC</span><b>{station.id}</b><i>{station.state}</i></div></div>
      <div className="live-readouts">{station.technicianView.map((item, index) => { const [key, value = '—'] = item.split(': '); return <div key={item}><span>{key}</span><b>{value}</b><i style={{ width: `${58 + index * 9}%` }} /></div>; })}</div>
      <div className="permissive-panel"><p className="mini-label">START PERMISSIVES</p>{profile.safe.map((item) => <div key={item}><i className="ok">✓</i><span>{item}</span><b>TRUE</b></div>)}<div><i className={walkaroundComplete ? 'ok' : 'attention'}>{walkaroundComplete ? '✓' : '!'}</i><span>physical walkaround evidence</span><b>{walkaroundComplete ? 'TRUE' : 'HOLD'}</b></div><div><i className={releaseBlocked ? 'attention' : 'ok'}>{releaseBlocked ? '!' : '✓'}</i><span>quality / service release</span><b>{releaseBlocked ? 'HOLD' : 'TRUE'}</b></div></div>
    </div>
    <ConsoleAction complete={complete} disabled={!walkaroundComplete} idle={walkaroundComplete ? 'RUN SAFE-STATE CHECK' : 'WALKAROUND REQUIRED'} done="SAFE STATE ATTESTED" note={complete ? 'Attestation staged for the LES record.' : walkaroundComplete ? 'Physical state is linked; quality or service holds remain independent.' : `${physicalChecks.length}/3 physical inspection points linked. Use 3D focus mode.`} onClick={onComplete} />
  </div>;
}

function LesView({ station, profile, complete, onComplete }: { station: Station; profile: typeof profiles[string]; complete: boolean; onComplete: () => void }) {
  const active = station.tone === 'run' ? 2 : station.tone === 'warn' ? 1 : 0;
  return <div className="console-view">
    <div className="console-view-head"><div><p className="section-kicker">LES / METHOD EXECUTION</p><h3>Guided work + operator attestations</h3></div><span>REV 8.4 · EFFECTIVE</span></div>
    <div className="les-layout"><div className="procedure-rail">{profile.method.map((step, index) => <div key={step} className={index < active ? 'done' : index === active ? 'active' : ''}><span>{index < active ? '✓' : `0${index + 1}`}</span><i /><div><b>{step}</b><small>{index < active ? 'evidence attached' : index === active ? 'technician action' : 'blocked by sequence'}</small></div><em>{index < active ? 'COMPLETE' : index === active ? 'ACTIVE' : 'WAIT'}</em></div>)}</div><aside className="method-card"><span>METHOD</span><b>{station.id}-OPS-08</b><div><i />controlled copy</div><div><i />training current</div><div><i />instrument matched</div><small>Electronic signature will bind the operator, method revision, timestamp, and asset.</small></aside></div>
    <ConsoleAction complete={complete} idle="ATTEST ACTIVE STEP" done="STEP ATTESTED" note={complete ? 'Operator + method revision bound to this execution.' : 'Attestation does not bypass the physical verification.'} onClick={onComplete} />
  </div>;
}

function LimsView({ profile, scenarioId, complete, onComplete }: { profile: typeof profiles[string]; scenarioId: ScenarioId; complete: boolean; onComplete: () => void }) {
  return <div className="console-view">
    <div className="console-view-head"><div><p className="section-kicker">LIMS / SAMPLE IDENTITY</p><h3>Physical item ↔ digital record</h3></div><span>CHAIN LOCKED</span></div>
    <div className="lims-layout"><div className="lims-chain">{profile.sample.map((item, index) => <div key={item}><span>{['SOURCE', 'SPECIMEN / RUN', 'DATASET'][index]}</span><b>{item}</b><Barcode seed={index + item.length} /><small>{index === 0 ? 'received + released' : index === 1 ? 'asset association' : 'native result package'}</small></div>)}</div><div className="lineage-connector"><i /><i /><span>{scenarioId === 'furnace' ? 'CENSORED' : scenarioId === 'bet' ? 'RECONCILE' : 'QC HOLD'}</span></div><aside className="lims-facts"><p className="mini-label">REQUIRED LINKS</p><div><span>lot / batch</span><b>BOUND</b></div><div><span>operator</span><b>TECH-07</b></div><div><span>method revision</span><b>08</b></div><div><span>raw file hash</span><b>READY</b></div></aside></div>
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

function InstrumentMimic({ stationId, tone }: { stationId: string; tone: Station['tone'] }) {
  const accent = tone === 'warn' ? '#f4b95f' : tone === 'run' ? '#4dd5ed' : '#51e19a';
  return <svg viewBox="0 0 520 270" role="img" aria-label={`${stationId} live equipment mimic`} style={{ '--mimic': accent } as React.CSSProperties}>
    <defs><linearGradient id="metal" x1="0" x2="1"><stop stopColor="#536575" /><stop offset=".5" stopColor="#1b2b3b" /><stop offset="1" stopColor="#7b8992" /></linearGradient><pattern id="mgrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#1d3145" strokeWidth="1" /></pattern></defs>
    <rect width="520" height="270" fill="#071019" /><rect width="520" height="270" fill="url(#mgrid)" opacity=".75" />
    {stationId === 'XRD-03' && <g transform="translate(98 22)"><rect width="320" height="220" rx="22" fill="url(#metal)" stroke="#8094a2" /><rect x="45" y="30" width="215" height="140" rx="16" fill="#091820" stroke="#38586a" /><path d="M92 140 A75 75 0 0 1 239 140" fill="none" stroke="#8298a6" strokeWidth="13" /><circle cx="165" cy="140" r="13" fill="#d8e2e5" /><path d="M95 90 L165 140 235 78" fill="none" stroke="var(--mimic)" strokeWidth="2" /><rect x="75" y="55" width="35" height="54" rx="4" fill="#b4c1c6" transform="rotate(-28 92 82)" /><rect x="222" y="46" width="40" height="62" rx="4" fill="#566b7a" transform="rotate(30 242 77)" /><rect x="70" y="187" width="105" height="18" fill="#07161d" /><path d="M76 198 L95 190 115 201 135 186 162 196" fill="none" stroke="var(--mimic)" strokeWidth="2" /></g>}
    {stationId === 'SEM-01' && <g transform="translate(135 18)"><path d="M120 8 H170 L185 68 H105 Z" fill="#b9c5c9" /><rect x="124" y="0" width="42" height="70" fill="url(#metal)" /><path d="M92 62 H198 L225 112 H66 Z" fill="#667986" /><ellipse cx="145" cy="154" rx="105" ry="72" fill="url(#metal)" stroke="#a3b3ba" strokeWidth="3" /><circle cx="145" cy="154" r="48" fill="#071018" stroke="#375467" /><path d="M145 45 V154" stroke="var(--mimic)" strokeWidth="2" /><circle cx="145" cy="154" r="6" fill="var(--mimic)" /><rect x="265" y="55" width="92" height="82" fill="#101f2b" stroke="#3a5266" /><g fill="#91a6ad">{Array.from({ length: 12 }, (_, i) => <circle key={i} cx={278 + (i % 4) * 21} cy={70 + Math.floor(i / 4) * 23} r={2 + i % 3} />)}</g></g>}
    {stationId === 'BET-02' && <g transform="translate(80 18)"><rect width="300" height="225" rx="10" fill="url(#metal)" stroke="#647b89" /><rect x="42" y="24" width="210" height="150" rx="5" fill="#081820" stroke="#355062" />{[74, 120, 166, 212].map((x, i) => <g key={x}><path d={`M${x} 48 V135`} stroke="#c5d7da" strokeWidth="5" /><circle cx={x} cy="146" r="13" fill={i === 2 ? '#6c7d88' : 'var(--mimic)'} opacity={i === 2 ? .65 : .9} /><path d={`M${x} 48 V35 H150`} fill="none" stroke="#8398a3" /></g>)}<circle cx="360" cy="158" r="55" fill="#526978" stroke="#8599a2" /><rect x="347" y="68" width="26" height="82" fill="#6d8290" /><path d="M270 45 Q360 42 360 88" fill="none" stroke="var(--mimic)" strokeWidth="3" /></g>}
    {stationId === 'FURN-04' && <g transform="translate(115 18)"><rect width="290" height="225" rx="8" fill="url(#metal)" stroke="#85939a" /><rect x="46" y="34" width="190" height="125" rx="5" fill="#120c09" stroke="#9ca7aa" strokeWidth="4" /><rect x="62" y="50" width="158" height="93" fill="#7a341b" /><circle cx="141" cy="96" r="54" fill="#f28f43" opacity=".55" /><rect x="57" y="180" width="115" height="24" fill="#07171d" /><path d="M67 196 H113" stroke="var(--mimic)" strokeWidth="3" /><path d="M250 55 V145" stroke="#c0c8c9" strokeWidth="7" /></g>}
    {stationId === 'ROBO-02' && <g transform="translate(80 10)"><path d="M30 230 H395" stroke="#7f642d" strokeWidth="5" /><path d="M30 15 V230 M395 15 V230 M30 65 H395 M30 180 H395" stroke="#9a772c" strokeWidth="5" opacity=".85" /><ellipse cx="195" cy="220" rx="70" ry="22" fill="#304457" /><path d="M195 210 L165 146 L245 94 L310 133" fill="none" stroke="#d8e0e2" strokeWidth="25" strokeLinecap="round" strokeLinejoin="round" /><g fill="#5e7180" stroke="#a8b6bc" strokeWidth="3"><circle cx="165" cy="146" r="18" /><circle cx="245" cy="94" r="18" /><circle cx="310" cy="133" r="16" /></g><circle cx="310" cy="133" r="7" fill="var(--mimic)" /><path d="M316 139 l22 16 m-25 -12 l8 26" stroke="#a8b6bc" strokeWidth="6" /></g>}
    {stationId === 'PREP-01' && <g transform="translate(80 25)"><rect x="20" width="275" height="190" fill="url(#metal)" stroke="#82929c" /><rect x="55" y="25" width="205" height="105" fill="#0c1c24" stroke="#547081" /><rect x="65" y="35" width="185" height="85" fill="#78a5b0" opacity=".12" />{[95, 130, 165].map((x, i) => <g key={x}><rect x={x} y="87" width="20" height="33" fill={['#d2b269', '#c77c62', '#8db8c3'][i]} /><rect x={x + 3} y="80" width="14" height="8" fill="#d3dcde" /></g>)}<rect x="325" y="95" width="100" height="86" rx="5" fill="#293d4e" /><rect x="342" y="111" width="66" height="28" fill="#07171d" /><path d="M350 128 H394" stroke="var(--mimic)" strokeWidth="3" /><ellipse cx="375" cy="77" rx="52" ry="10" fill="#bbc5c8" /></g>}
    <g transform="translate(18 18)"><circle r="5" fill="var(--mimic)" /><text x="12" y="4" fill="#8fa3b3" fontSize="10" fontFamily="monospace">LIVE / {stationId}</text></g>
  </svg>;
}
