'use client';

import { useState } from 'react';

type Recipe = {
  id: string;
  name: string;
  formula: string;
  temperature: string;
  dwell: string;
  prediction: string;
  uncertainty: string;
  point: [number, number];
};

type CampaignRun = {
  stage: number;
  selected: string;
  elapsed: number;
  insight: number;
  message: string;
};

const recipes: Recipe[] = [
  { id: 'C-42', name: 'Ca-rich edge', formula: 'Ca₀.₅₂Ti₀.₄₈O₃', temperature: '980 °C', dwell: '4.0 h', prediction: '96.4%', uncertainty: '±1.9%', point: [196, 70] },
  { id: 'Z-17', name: 'Zr-doped', formula: 'CaTi₀.₉₆Zr₀.₀₄O₃', temperature: '1,020 °C', dwell: '3.5 h', prediction: '97.1%', uncertainty: '±2.6%', point: [230, 91] },
  { id: 'D-08', name: 'Low-energy', formula: 'CaTiO₃', temperature: '900 °C', dwell: '6.0 h', prediction: '94.8%', uncertainty: '±1.2%', point: [166, 112] },
];

const initialRun: CampaignRun = {
  stage: 0,
  selected: 'C-42',
  elapsed: 0,
  insight: 248,
  message: 'Select a candidate and release one governed experiment into the lab.',
};

const storageKey = 'mattershift-campaign-v2';

export function CampaignControlModal({ onClose }: { onClose: () => void }) {
  const [run, setRun] = useState<CampaignRun>(() => {
    if (typeof window === 'undefined') return initialRun;
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved ? { ...initialRun, ...JSON.parse(saved) } : initialRun;
    } catch {
      return initialRun;
    }
  });

  const updateRun = (patch: Partial<CampaignRun>) => {
    setRun((current) => {
      const next = { ...current, ...patch };
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* no-op */ }
      return next;
    });
  };

  const recipe = recipes.find((candidate) => candidate.id === run.selected) ?? recipes[0];
  const fault = run.stage === 2 ? 'cell' : run.stage === 4 ? 'queue' : run.stage === 6 ? 'qc' : null;
  const primary = getPrimaryAction(run.stage);

  const advance = () => {
    if (run.stage === 0) updateRun({ stage: 1, message: `${recipe.id} released as RUN-042. Powder prep has the governed formulation.` });
    else if (run.stage === 1) updateRun({ stage: 2, elapsed: 12, message: 'Prep is complete. ROBO-02 stopped on a gripper cleanliness fault before dosing.' });
    else if (run.stage === 2) updateRun({ stage: 3, elapsed: run.elapsed + 18, insight: run.insight - 8, message: 'Gripper cleaned and witness coupon passed. Robot synthesis resumed with lineage intact.' });
    else if (run.stage === 3) updateRun({ stage: 4, elapsed: run.elapsed + 14, message: 'Carrier assembled. FURN-04 is occupied by RUN-039; RUN-042 is now queue constrained.' });
    else if (run.stage === 4) updateRun({ stage: 5, elapsed: run.elapsed + 62, message: 'RUN-039 cooled and unloaded. RUN-042 entered the validated 980 °C profile.' });
    else if (run.stage === 5) updateRun({ stage: 6, elapsed: run.elapsed + 94, message: 'Thermal cycle complete. XRD release is held because the Si reference is overdue.' });
    else if (run.stage === 6) updateRun({ stage: 7, elapsed: run.elapsed + 18, insight: run.insight + 46, message: 'Reference passed at +0.01° 2θ. RUN-042 measured 95.8% target phase: valid evidence, but 0.2 percentage point below objective.' });
    else updateRun({ ...initialRun, insight: run.insight, selected: run.selected, message: 'Campaign lane cleared. Select the next candidate.' });
  };

  const rejectShortcut = (kind: 'robot' | 'furnace') => {
    updateRun({ message: kind === 'robot'
      ? 'Command blocked: bypassing the cleanliness witness would make contamination indistinguishable from material behavior.'
      : 'Command blocked: shortening another run violates its governed thermal profile. RUN-042 remains queued.' });
  };

  return <div className="modal-backdrop campaign-backdrop" role="presentation">
    <section className="modal-card campaign-control" role="dialog" aria-modal="true" aria-label="Materials campaign control">
      <header>
        <div><p className="section-kicker">SANDBOX CAMPAIGN · MAT-042</p><h2>Materials campaign control</h2></div>
        <button type="button" onClick={onClose} aria-label="Close dialog">×</button>
      </header>

      <div className="campaign-hud">
        <div><span>OBJECTIVE</span><b>Target phase ≥ 96%</b></div>
        <div><span>LAB CLOCK</span><b>+{run.elapsed} min</b></div>
        <div><span>INSIGHT</span><b>{run.insight} RP</b></div>
        <div><span>LAB THROUGHPUT</span><b>{run.stage >= 7 ? '1.9' : '1.4'} runs / h</b></div>
        <div className={fault ? 'hud-alert' : ''}><span>ACTIVE CONSTRAINT</span><b>{fault === 'cell' ? 'ROBOT CELL' : fault === 'queue' ? 'FURNACE QUEUE' : fault === 'qc' ? 'XRD QC' : 'NONE'}</b></div>
      </div>

      <div className="campaign-workspace">
        <aside className="campaign-designer">
          <div className="campaign-panel-head"><div><span>EXPERIMENT DESIGN</span><b>AI CANDIDATES</b></div><em>03</em></div>
          <div className="campaign-design-space" aria-label="Composition and temperature design space">
            <svg viewBox="0 0 320 180" role="img" aria-label={`${recipe.id} selected in the materials design space`}>
              <defs><radialGradient id="campaignHalo"><stop offset="0" stopColor="#4dd5ed" stopOpacity=".24" /><stop offset="1" stopColor="#4dd5ed" stopOpacity="0" /></radialGradient></defs>
              <path className="campaign-contour" d="M28 142 C72 64 126 34 191 42 C249 49 280 85 292 132" />
              <path className="campaign-contour faint" d="M51 144 C91 82 135 61 184 64 C229 67 257 93 270 132" />
              <path className="campaign-boundary" d="M40 144 L153 31 L286 144 Z" />
              <circle cx="105" cy="107" r="5" /><circle cx="142" cy="78" r="5" /><circle cx="217" cy="120" r="5" />
              <circle className="proposal-halo" cx={recipe.point[0]} cy={recipe.point[1]} r="24" />
              <circle className="campaign-proposal" cx={recipe.point[0]} cy={recipe.point[1]} r="7" />
              <path className="proposal-cross" d={`M${recipe.point[0] - 12} ${recipe.point[1]}h24M${recipe.point[0]} ${recipe.point[1] - 12}v24`} />
              <text x="24" y="160">Ca-rich</text><text x="145" y="23">TEMPERATURE</text><text x="265" y="160">Ti-rich</text>
              <text className="proposal-label" x={recipe.point[0] + 12} y={recipe.point[1] - 10}>{recipe.id}</text>
            </svg>
            <footer><span><i /> MEASURED</span><span><i className="proposal" /> PROPOSED</span><b>UNCERTAINTY {recipe.uncertainty}</b></footer>
          </div>
          <div className="candidate-list">
            {recipes.map((candidate) => <button key={candidate.id} type="button" className={candidate.id === run.selected ? 'active' : ''} disabled={run.stage > 0} onClick={() => updateRun({ selected: candidate.id, message: `${candidate.id} selected. Review its synthesis envelope before release.` })}>
              <span>{candidate.id}</span><div><b>{candidate.name}</b><small>{candidate.formula}</small></div><em>{candidate.prediction}</em>
            </button>)}
          </div>
          <div className="recipe-envelope"><span>SYNTHESIS ENVELOPE</span><div><b>{recipe.temperature}</b><small>calcination</small></div><div><b>{recipe.dwell}</b><small>dwell</small></div><div><b>{recipe.prediction}</b><small>predicted phase</small></div></div>
        </aside>

        <section className="campaign-routing">
          <div className="campaign-panel-head"><div><span>LIVE MATERIAL ROUTE</span><b>RUN-042 · {recipe.id}</b></div><em>{String(Math.min(run.stage + 1, 8)).padStart(2, '0')} / 08</em></div>
          <div className="route-board">
            <RouteCell code="PREP-01" label="PREP" cycle="12 MIN" state={routeState(run.stage, 1, 2)} current={run.stage === 1} job={run.stage >= 1 ? 'RUN-042' : 'OPEN'} />
            <RouteCell code="ROBO-02" label="SYNTHESIZE" cycle="14 MIN" state={run.stage === 2 ? 'fault' : routeState(run.stage, 3, 4)} current={run.stage === 3} job={run.stage === 2 ? 'CELL FAULT' : run.stage >= 3 ? 'RUN-042' : 'WAIT'} />
            <RouteCell code="FURN-04" label="CALCINE" cycle="94 MIN" state={run.stage === 4 ? 'queued' : routeState(run.stage, 5, 6)} current={run.stage === 5} job={run.stage === 4 ? 'Q 01' : run.stage >= 5 ? 'RUN-042' : 'RUN-039'} />
            <RouteCell code="XRD-03" label="MEASURE" cycle="18 MIN" state={run.stage === 6 ? 'fault' : routeState(run.stage, 6, 7)} current={run.stage === 6} job={run.stage === 6 ? 'QC HOLD' : run.stage >= 7 ? 'RUN-042' : 'RUN-038'} />
            <RouteCell code="MODEL" label="LEARN" cycle="GATED" state={run.stage >= 7 ? 'complete' : 'waiting'} current={false} job={run.stage >= 7 ? '+46 RP' : 'EVIDENCE'} />
          </div>

          <div className={`constraint-console ${fault ? `fault-${fault}` : run.stage >= 7 ? 'result-miss' : ''}`}>
            <div className="constraint-signal"><span>{fault ? 'BOTTLENECK DETECTED' : run.stage >= 7 ? 'VALID RESULT · TARGET MISSED' : 'ROUTE STATUS'}</span><b>{fault === 'cell' ? 'ROBO-02 / CLEANLINESS' : fault === 'queue' ? 'FURN-04 / CAPACITY 1 OF 1' : fault === 'qc' ? 'XRD-03 / CONTROL DUE' : run.stage >= 7 ? '95.8% · GAP −0.2 pp' : 'FLOW NOMINAL'}</b><i /></div>
            <div className="constraint-visual" aria-label="Campaign queue visualization">
              <span className="queue-axis">QUEUE</span>
              <div className={`queue-token token-a ${run.stage >= 4 ? 'visible' : ''}`}>042</div>
              <div className={`queue-token token-b ${run.stage === 4 ? 'visible' : ''}`}>043</div>
              <div className={`machine-aperture ${fault ? 'held' : ''}`}><i /><b>{fault ? 'HOLD' : 'READY'}</b></div>
              <em>{fault === 'queue' ? '62 min wait' : fault === 'cell' ? '18 min recovery' : fault === 'qc' ? 'reference first' : run.stage >= 7 ? 'valid negative result' : 'no active delay'}</em>
            </div>
            <p>{run.message}</p>
          </div>

          <div className="campaign-timeline" aria-label="Equipment schedule">
            <header><span>EQUIPMENT SCHEDULE</span><b>NOW</b><i>+30</i><i>+60</i><i>+90 MIN</i></header>
            <div><span>ROBO-02</span><i className="bar robot" /><b>RUN-042</b></div>
            <div><span>FURN-04</span><i className="bar furnace" /><b>RUN-039</b><i className="bar furnace queued" /><b>042</b></div>
            <div><span>XRD-03</span><i className="bar xrd" /><b>REF</b><i className="bar xrd queued" /><b>042</b></div>
          </div>
        </section>
      </div>

      <footer className="campaign-actions">
        <div><span>PLAYER COMMAND</span><b>{primary.hint}</b></div>
        {run.stage === 2 && <button type="button" className="secondary" onClick={() => rejectShortcut('robot')}>BYPASS WITNESS</button>}
        {run.stage === 4 && <button type="button" className="secondary" onClick={() => rejectShortcut('furnace')}>SHORTEN RUN-039</button>}
        <button type="button" onClick={advance}>{primary.label}<span>→</span></button>
      </footer>
    </section>
  </div>;
}

function RouteCell({ code, label, cycle, state, current, job }: { code: string; label: string; cycle: string; state: string; current: boolean; job: string }) {
  return <article className={`route-cell state-${state} ${current ? 'current' : ''}`}>
    <header><span>{code}</span><i>{state === 'complete' ? '✓' : state === 'fault' ? '!' : state === 'queued' ? 'Q' : '·'}</i></header>
    <div className="route-machine"><i /><i /><b /></div>
    <h3>{label}</h3><small>{cycle}</small><em>{job}</em>
  </article>;
}

function routeState(stage: number, active: number, complete: number) {
  if (stage >= complete) return 'complete';
  if (stage === active) return 'active';
  return 'waiting';
}

function getPrimaryAction(stage: number) {
  return [
    { label: 'QUEUE GOVERNED RUN', hint: 'Release the selected recipe to PREP-01' },
    { label: 'ADVANCE 12 MIN', hint: 'Allow powder preparation to complete' },
    { label: 'CLEAN + QUALIFY GRIPPER', hint: 'Recover the robot without losing sample context' },
    { label: 'COMPLETE ROBOT DOSING', hint: 'Assemble and transfer the crucible carrier' },
    { label: 'HOLD QUEUE + ADVANCE 62 MIN', hint: 'Respect the active furnace profile' },
    { label: 'COMPLETE THERMAL CYCLE', hint: 'Retain temperature, atmosphere, and carrier history' },
    { label: 'RUN SI REFERENCE FIRST', hint: 'Restore measurement control before the specimen' },
    { label: 'START NEXT CAMPAIGN', hint: 'AI-eligible result · objective missed by 0.2 percentage point' },
  ][stage] ?? { label: 'START NEXT CAMPAIGN', hint: 'Clear the completed lane' };
}
