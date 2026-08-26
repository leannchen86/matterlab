import { useEffect } from 'react';

const steps = [
  { number: '01', title: 'Look', body: 'Inspect the equipment and read the current symptom.' },
  { number: '02', title: 'Test', body: 'Run the smallest check that could change your mind.' },
  { number: '03', title: 'Decide', body: 'Move forward only when the evidence supports it.' },
];

const terms = [
  ['XRD', 'Shows which crystal phases are in a material.'],
  ['SEM / EDS', 'Magnifies a sample and identifies elements in a small area.'],
  ['TGA', 'Tracks mass changes while a sample is heated.'],
  ['BET', 'Estimates surface area using gas adsorption.'],
];

export function SystemsAtlasModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation">
    <section className="modal-card wide quick-guide" role="dialog" aria-modal="true" aria-label="Quick help">
      <header>
        <div><p className="section-kicker">OPTIONAL</p><h2>Quick help</h2></div>
        <button type="button" onClick={onClose} aria-label="Close dialog">×</button>
      </header>
      <p className="modal-intro">The active mission always shows your next usable action.</p>
      <div className="quick-guide-steps">
        {steps.map((step) => <article key={step.number}><i>{step.number}</i><div><b>{step.title}</b><p>{step.body}</p></div></article>)}
      </div>
      <div className="quick-guide-tip"><span>COLORS</span><b>Amber needs attention · cyan is active · green is ready.</b></div>
      <div className="beginner-glossary">
        <p className="section-kicker">EQUIPMENT</p>
        <div>{terms.map(([term, meaning]) => <article key={term}><b>{term}</b><p>{meaning}</p></article>)}</div>
      </div>
    </section>
  </div>;
}
