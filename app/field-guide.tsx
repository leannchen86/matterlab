import { fieldGuide, sources } from './sim-data';

export function FieldGuideModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation"><section className="modal-card wide" role="dialog" aria-modal="true" aria-label="Technician field guide"><header><div><p className="section-kicker">SYSTEMS + CHARACTERIZATION</p><h2>Technician field guide</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header><p className="modal-intro">A compact map of what the terms in the job descriptions mean at the bench. This simulation is conceptual training, not an operating procedure.</p><AccessBoundaryMap /><div className="guide-grid">{fieldGuide.map((item) => <article key={item.term}><b>{item.term}</b><p>{item.role}</p><small>{item.atBench}</small></article>)}</div><div className="source-list"><p className="mini-label">RESEARCH SOURCES</p>{sources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label}<span>↗</span></a>)}</div></section></div>;
}

function AccessBoundaryMap() {
  const layers = [
    { icon: '◫', code: 'PHYSICAL', title: 'ASSET + SAMPLE', detail: 'observe · identify · control' },
    { icon: '⌁', code: 'MES / SCADA / HMI', title: 'EXECUTION + LIVE STATE', detail: 'moves · alarms · permissives' },
    { icon: '✓', code: 'LES / LIMS', title: 'GOVERNED RECORD', detail: 'method · lineage · native data' },
    { icon: '◇', code: 'AI PLANNER', title: 'PROPOSED NEXT', detail: 'recommend · never self-release' },
  ];
  return <div className="access-boundary-map" aria-label="Technician access boundary from physical asset to AI planner">
    <header><span>TECHNICIAN ACCESS BOUNDARY</span><b>PHYSICAL TRUTH → AI-ELIGIBLE EVIDENCE</b></header>
    <div>{layers.map((layer, index) => <article key={layer.code} className={index === 3 ? 'ai-boundary' : ''}><i>{layer.icon}</i><span>{layer.code}</span><b>{layer.title}</b><small>{layer.detail}</small>{index < layers.length - 1 && <em>→</em>}</article>)}</div>
    <footer><span>TECH-07 CAN OBSERVE · ATTEST · HOLD · RELEASE WITHIN ROLE</span><i /><b>AI CAN PROPOSE · CANNOT OVERRIDE GATES</b></footer>
  </div>;
}
