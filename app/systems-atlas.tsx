import { useEffect } from 'react';

const steps = [
  { number: '01', title: 'Follow the highlighted step', body: 'The mission list and large action button point to the same required task.' },
  { number: '02', title: 'Use the evidence screen', body: 'Run the check, compare what changed, and look for the signal that does not fit.' },
  { number: '03', title: 'Make a decision', body: 'Wrong choices are safely blocked. Read the reason, then try again.' },
];

const terms = [
  ['XRD', 'Shows which crystal phases are in a material.'],
  ['SEM / EDS', 'Magnifies the sample and shows which elements are present.'],
  ['TGA / DSC', 'Tracks how a sample changes while it is heated.'],
  ['BET', 'Estimates surface area using gas adsorption.'],
  ['Lab records', 'Keep the sample, machine, and result connected.'],
  ['AI planner', 'Suggests the next experiment; you decide whether the evidence is trustworthy.'],
];

export function SystemsAtlasModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation">
    <section className="modal-card wide quick-guide" role="dialog" aria-modal="true" aria-label="How to play MatterShift">
      <header>
        <div><p className="section-kicker">QUICK GUIDE</p><h2>How to play MatterShift</h2></div>
        <button type="button" onClick={onClose} aria-label="Close dialog">×</button>
      </header>
      <p className="modal-intro">Follow one objective, inspect its evidence, and make the next decision. Walking around and opening equipment controls are optional. All incidents and outcomes are fictional simulation content.</p>
      <div className="quick-guide-steps">
        {steps.map((step) => <article key={step.number}><i>{step.number}</i><div><b>{step.title}</b><p>{step.body}</p></div></article>)}
      </div>
      <div className="quick-guide-tip"><span>GOOD TO KNOW</span><b>Amber means attention. Cyan means active. Green means ready or complete.</b></div>
      <div className="beginner-glossary">
        <p className="section-kicker">PLAIN-LANGUAGE GLOSSARY</p>
        <div>{terms.map(([term, meaning]) => <article key={term}><b>{term}</b><p>{meaning}</p></article>)}</div>
      </div>
    </section>
  </div>;
}
