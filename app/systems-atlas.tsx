const steps = [
  { number: '01', title: 'Follow the objective', body: 'The highlighted mission step and action button always point to the same next task.' },
  { number: '02', title: 'Inspect the evidence', body: 'Open the relevant machine, sample, or result and look for the signal that does not fit.' },
  { number: '03', title: 'Choose and test', body: 'Make a decision, see what constraint it affects, and retry immediately if it fails.' },
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
  return <div className="modal-backdrop" role="presentation">
    <section className="modal-card wide quick-guide" role="dialog" aria-modal="true" aria-label="How to play MatterShift">
      <header>
        <div><p className="section-kicker">QUICK GUIDE</p><h2>How to play MatterShift</h2></div>
        <button type="button" onClick={onClose} aria-label="Close dialog">×</button>
      </header>
      <p className="modal-intro">Follow one objective, inspect the evidence, and make the next decision. Free exploration is always available in the 3D lab. All incidents and outcomes are fictional simulation content.</p>
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
