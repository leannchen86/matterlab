import { fieldGuide } from './sim-data';

export function FieldGuideModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation"><section className="modal-card wide" role="dialog" aria-modal="true" aria-label="Lab systems atlas"><header><div><p className="section-kicker">CAMPAIGN SYSTEMS + CHARACTERIZATION</p><h2>Lab systems atlas</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header><p className="modal-intro">The operating map for this lab. Trace a material from physical asset to governed evidence, then decide what the autonomous campaign may try next.</p><CampaignLoopMap /><AccessBoundaryMap /><div className="guide-grid">{fieldGuide.map((item) => <article key={item.term}><AtlasEquipmentGlyph term={item.term} /><div><b>{item.term}</b><p>{item.role}</p><small>{item.atBench}</small></div></article>)}</div></section></div>;
}

function CampaignLoopMap() {
  const steps = [
    ['01', 'DESIGN', 'composition + objective'],
    ['02', 'PREPARE', 'weigh + bind identity'],
    ['03', 'SYNTHESIZE', 'robot + furnace'],
    ['04', 'MEASURE', 'XRD · SEM · TGA · BET'],
    ['05', 'LEARN', 'gate evidence + propose'],
  ];
  const faults = ['QC DRIFT', 'QUEUE STARVED', 'CELL FAULT', 'UTILITY HOLD', 'CONTAMINATION', 'MODEL HOLD'];
  return <div className="campaign-loop-map" aria-label="Materials campaign loop from experimental design through synthesis, measurement, and learning"><header><span>CAMPAIGN LOOP</span><b>MAKE → MEASURE → DECIDE → REPEAT</b></header><div className="campaign-steps">{steps.map(([number, title, detail], index) => <article key={number}><i>{number}</i><b>{title}</b><small>{detail}</small>{index < steps.length - 1 && <em>→</em>}</article>)}</div><footer><span>FAILURE SIGNALS</span>{faults.map((fault) => <b key={fault}>{fault}</b>)}</footer></div>;
}

function AccessBoundaryMap() {
  const layers = [
    { icon: '◫', code: 'PHYSICAL', title: 'ASSET + SAMPLE', detail: 'observe · identify · control' },
    { icon: '⌁', code: 'MES / SCADA / HMI', title: 'EXECUTION + LIVE STATE', detail: 'moves · alarms · permissives' },
    { icon: '✓', code: 'LES / LIMS', title: 'GOVERNED RECORD', detail: 'method · lineage · native data' },
    { icon: '◇', code: 'AI PLANNER', title: 'PROPOSED NEXT', detail: 'recommend · never self-release' },
  ];
  return <div className="access-boundary-map" aria-label="Operator access boundary from physical asset to AI planner">
    <header><span>PLAYER CONTROL BOUNDARY</span><b>PHYSICAL TRUTH → AI-ELIGIBLE EVIDENCE</b></header>
    <div>{layers.map((layer, index) => <article key={layer.code} className={index === 3 ? 'ai-boundary' : ''}><i>{layer.icon}</i><span>{layer.code}</span><b>{layer.title}</b><small>{layer.detail}</small>{index < layers.length - 1 && <em>→</em>}</article>)}</div>
    <footer><span>YOU CAN OBSERVE · OPERATE · HOLD · RELEASE</span><i /><b>AI CAN PROPOSE · CANNOT OVERRIDE GATES</b></footer>
  </div>;
}

function AtlasEquipmentGlyph({ term }: { term: string }) {
  const kind = term.startsWith('LIMS') ? 'lims' : term.startsWith('MES') ? 'scada' : term.startsWith('SEM') ? 'sem' : term.startsWith('TGA') ? 'tga' : term;
  return <svg className={`atlas-equipment-glyph atlas-${kind.toLowerCase().replaceAll(' / ', '-')}`} viewBox="0 0 120 68" aria-hidden="true">
    <rect className="atlas-glyph-frame" x="1" y="1" width="118" height="66" rx="2" />
    <path className="atlas-grid-lines" d="M8 16H112M8 31H112M8 46H112M29 8V60M60 8V60M91 8V60" />
    {kind === 'lims' && <><rect x="12" y="18" width="28" height="34" rx="2" /><path d="M17 25h18M17 31h13M17 37h16M17 43h10" /><path className="atlas-accent" d="M50 23h18v9H50zm0 15h18v9H50zm29-15h28v24H79zM68 27h11m-11 15h11" /><path className="atlas-signal" d="M84 31h17M84 36h11M84 41h14" /></>}
    {kind === 'scada' && <><rect x="10" y="17" width="42" height="36" rx="2" /><circle cx="20" cy="28" r="4" /><circle cx="34" cy="28" r="4" /><path d="M17 42h27M17 47h18" /><rect className="atlas-accent" x="61" y="17" width="48" height="36" rx="2" /><path className="atlas-signal" d="M66 43l8-7 7 3 8-17 7 11 9-5" /><path d="M67 48h37M67 23h10" /></>}
    {kind === 'XRD' && <><path d="M13 52V18h39v34M20 45h25M32 44V27" /><path className="atlas-accent" d="M20 36a12 12 0 0 1 24 0M20 36h7m10 0h7M32 28v8" /><path className="atlas-signal" d="M60 51h48M63 49c5 0 5-22 10-22s4 15 9 15 4-9 9-9 4 12 10 12 4-5 7-5" /><text x="63" y="20">2θ</text></>}
    {kind === 'sem' && <><path d="M25 13h28v11H25zm6 11h16v13l9 8v9H22v-9l9-8z" /><circle className="atlas-accent" cx="39" cy="45" r="5" /><path className="atlas-signal" d="M65 51h44M67 48v-7h5v7h7V25h5v23h7V34h5v14h7V20h5v28" /><text x="66" y="16">EDS</text></>}
    {kind === 'tga' && <><rect x="11" y="23" width="39" height="31" rx="3" /><path d="M18 23v-7h25v7M23 34h15v12H23zM31 16v-6" /><path className="atlas-accent" d="M31 10h24m0 0 8 5m-8-5-8 5" /><path className="atlas-signal" d="M61 48h48M63 30h45M64 44c8 0 8-3 15-3s7-17 13-17 5 18 15 18" /><text x="65" y="20">Δm / q</text></>}
    {kind === 'BET' && <><path d="M14 16h8v22c0 6 12 6 12 0V16h8m8 0h8v22c0 6 12 6 12 0V16h8" /><path className="atlas-accent" d="M9 45h74v13H9zM16 49h60" /><path className="atlas-signal" d="M89 55h22M91 50c3-18 7-25 18-30M91 50c4-10 10-12 18-13" /><text x="88" y="16">p/p₀</text></>}
    <circle className="atlas-live-dot" cx="110" cy="9" r="2.5" />
  </svg>;
}
