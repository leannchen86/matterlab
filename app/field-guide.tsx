import { fieldGuide } from './sim-data';

export function FieldGuideModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation"><section className="modal-card wide" role="dialog" aria-modal="true" aria-label="Lab operations field guide"><header><div><p className="section-kicker">CAMPAIGN SYSTEMS + CHARACTERIZATION</p><h2>Lab operations field guide</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header><p className="modal-intro">Your in-world reference for turning a material idea into trustworthy evidence. Explore the equipment, preserve what physically happened, and decide what the next experiment should be.</p><CampaignLoopMap /><AccessBoundaryMap /><div className="guide-grid">{fieldGuide.map((item) => <article key={item.term}><b>{item.term}</b><p>{item.role}</p><small>{item.atBench}</small></article>)}</div></section></div>;
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
