import { useEffect } from 'react';

const steps = [
  { number: '01', title: 'Observe the symptom', body: 'Read the machine state, sample label, graph, or alarm. Do not assume the computer record is correct.' },
  { number: '02', title: 'Run the smallest useful test', body: 'Tests consume simulated lab time. Use the result—not the instruction text—to diagnose the problem.' },
  { number: '03', title: 'Make the call', body: 'Choose what to release, hold, repeat, or investigate. Unsupported actions are blocked and remain in the run record.' },
  { number: '04', title: 'Watch the lab change', body: 'Equipment state, mission time, records, and the next available action update after every accepted decision.' },
];

const rules = [
  ['XRD MACHINE CHECK', 'A silicon reference must be within ±0.05° 2θ. A passing summary does not erase an unexplained peak.'],
  ['SAMPLE IDENTITY', 'The physical label and preparation record must agree. Never copy identity from a neighboring sample.'],
  ['BET ANALYZER', 'A repair ticket is not a machine check. ALU-21 should read 173–191 m²/g.'],
  ['INTERRUPTED HEATING', 'A sample that completed only part of its heating cycle is not comparable with a normal completed run.'],
  ['TGA / DSC SETUP', 'Use matching pans and prove the empty baseline before interpreting a sample signal.'],
  ['GAS CHANGE', 'A passing reference proves the analyzer only after the new gas connection was checked.'],
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
    <section className="modal-card wide quick-guide" role="dialog" aria-modal="true" aria-label="MatterShift field manual">
      <header>
        <div><p className="section-kicker">OPTIONAL REFERENCE</p><h2>MatterShift field manual</h2></div>
        <button type="button" onClick={onClose} aria-label="Close dialog">×</button>
      </header>
      <p className="modal-intro">Use this when you need a rule or term. The mission itself shows the symptom and the result; this manual does not advance the simulation.</p>
      <div className="quick-guide-steps">
        {steps.map((step) => <article key={step.number}><i>{step.number}</i><div><b>{step.title}</b><p>{step.body}</p></div></article>)}
      </div>
      <div className="quick-guide-tip"><span>GOOD TO KNOW</span><b>Amber means attention. Cyan means active. Green means ready or complete.</b></div>
      <div className="field-rules">
        <p className="section-kicker">DECISION RULES</p>
        <div>{rules.map(([title, body]) => <article key={title}><b>{title}</b><p>{body}</p></article>)}</div>
      </div>
      <div className="beginner-glossary">
        <p className="section-kicker">PLAIN-LANGUAGE GLOSSARY</p>
        <div>{terms.map(([term, meaning]) => <article key={term}><b>{term}</b><p>{meaning}</p></article>)}</div>
      </div>
    </section>
  </div>;
}
