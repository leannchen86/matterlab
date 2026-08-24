'use client';

import { useEffect, useState } from 'react';
import { campaignSpecs as recipes, getCampaignIdentity, getCampaignSpec } from './campaign-spec';

type CampaignResult = { runNumber: number; candidate: string; measured: string; gap: string; objectiveMet: boolean; elapsed: number };

type CampaignRun = {
  stage: number;
  selected: string;
  elapsed: number;
  insight: number;
  message: string;
  runNumber: number;
  history: CampaignResult[];
};

const initialRun: CampaignRun = {
  stage: 0,
  selected: 'C-42',
  elapsed: 0,
  insight: 248,
  runNumber: 42,
  history: [],
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

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mattershift:campaign-state', { detail: run }));
  }, [run]);

  const recipe = getCampaignSpec(run.selected);
  const currentRunNumber = Number(run.runNumber ?? 42);
  const history = Array.isArray(run.history) ? run.history : [];
  const adaptiveUnlocked = history.length >= 2;
  const availableRecipes = adaptiveUnlocked ? recipes : recipes.filter((candidate) => candidate.id !== 'A-29');
  const identity = getCampaignIdentity(currentRunNumber);
  const fault = run.stage === 2 ? 'cell' : run.stage === 4 ? 'queue' : run.stage === 6 ? 'qc' : null;
  const primary = getPrimaryAction(run.stage, identity.runId);

  const advance = () => {
    if (run.stage === 0) updateRun({ stage: 1, message: `${recipe.id} released as ${identity.runId}. Powder prep has the governed formulation.` });
    else if (run.stage >= 7) {
      const archivedHistory = history.some((result) => result.runNumber === currentRunNumber)
        ? history
        : [...history, { runNumber: currentRunNumber, candidate: recipe.id, measured: recipe.measured, gap: recipe.gap, objectiveMet: recipe.objectiveMet, elapsed: run.elapsed }];
      updateRun({ ...initialRun, insight: run.insight, selected: run.selected, runNumber: currentRunNumber + 1, history: archivedHistory, message: `${identity.runId} archived. Select the next candidate.` });
    }
  };

  const rejectShortcut = (kind: 'robot' | 'furnace') => {
    updateRun({ message: kind === 'robot'
      ? 'Command blocked: bypassing the cleanliness witness would make contamination indistinguishable from material behavior.'
      : `Command blocked: shortening another run violates its governed thermal profile. ${identity.runId} remains queued.` });
  };

  const viewInLab = () => {
    const stationId = run.stage <= 1 ? 'PREP-01' : run.stage <= 3 ? 'ROBO-02' : run.stage <= 5 ? 'FURN-04' : 'XRD-03';
    onClose();
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mattershift:return-to-lab', { detail: { stationId } })));
  };

  return <div className="modal-backdrop campaign-backdrop" role="presentation">
    <section className="modal-card campaign-control" role="dialog" aria-modal="true" aria-label="Materials campaign control">
      <header>
        <div><p className="section-kicker">SANDBOX CAMPAIGN · MAT-{identity.suffix}</p><h2>Materials campaign control</h2></div>
        <button type="button" onClick={onClose} aria-label="Close dialog">×</button>
      </header>

      <div className="campaign-hud">
        <div><span>OBJECTIVE</span><b>Target phase ≥ 96%</b></div>
        <div><span>LAB CLOCK</span><b>+{run.elapsed} min</b></div>
        <div><span>INSIGHT</span><b>{run.insight} RP</b></div>
        <div><span>FURNACE-LIMITED RATE</span><b>{recipe.throughput}</b></div>
        <div className={fault ? 'hud-alert' : ''}><span>ACTIVE CONSTRAINT</span><b>{fault === 'cell' ? 'ROBOT CELL' : fault === 'queue' ? 'FURNACE QUEUE' : fault === 'qc' ? 'XRD QC' : 'NONE'}</b></div>
      </div>

      <div className="campaign-workspace">
        <aside className="campaign-designer">
          <div className="campaign-panel-head"><div><span>EXPERIMENT DESIGN</span><b>{adaptiveUnlocked ? 'ADAPTIVE CANDIDATES' : 'AI CANDIDATES'}</b></div><em>{String(availableRecipes.length).padStart(2, '0')}</em></div>
          <div className="campaign-design-space" aria-label="Composition and temperature design space">
            <svg viewBox="0 0 320 180" role="img" aria-label={`${recipe.id} selected in the materials design space`}>
              <defs><radialGradient id="campaignHalo"><stop offset="0" stopColor="#4dd5ed" stopOpacity=".24" /><stop offset="1" stopColor="#4dd5ed" stopOpacity="0" /></radialGradient></defs>
              <path className="campaign-contour" d="M28 142 C72 64 126 34 191 42 C249 49 280 85 292 132" />
              <path className="campaign-contour faint" d="M51 144 C91 82 135 61 184 64 C229 67 257 93 270 132" />
              <path className="campaign-boundary" d="M40 144 L153 31 L286 144 Z" />
              <circle cx="105" cy="107" r="5" /><circle cx="142" cy="78" r="5" /><circle cx="217" cy="120" r="5" />
              {history.slice(-6).map((result, index) => {
                const measuredSpec = getCampaignSpec(result.candidate);
                const offset = (index % 3) * 4 - 4;
                return <g key={`${result.runNumber}-${result.candidate}`}>
                  <circle className={`campaign-result-point ${result.objectiveMet ? 'hit' : 'miss'}`} cx={measuredSpec.point[0] + offset} cy={measuredSpec.point[1] + 13 + Math.floor(index / 3) * 5} r="5" />
                  <text className="campaign-result-label" x={measuredSpec.point[0] + offset + 7} y={measuredSpec.point[1] + 17 + Math.floor(index / 3) * 5}>{result.measured}</text>
                </g>;
              })}
              <circle className="proposal-halo" cx={recipe.point[0]} cy={recipe.point[1]} r="24" />
              <circle className="campaign-proposal" cx={recipe.point[0]} cy={recipe.point[1]} r="7" />
              <path className="proposal-cross" d={`M${recipe.point[0] - 12} ${recipe.point[1]}h24M${recipe.point[0]} ${recipe.point[1] - 12}v24`} />
              <text x="24" y="160">Ca-rich</text><text x="145" y="23">TEMPERATURE</text><text x="265" y="160">Ti-rich</text>
              <text className="proposal-label" x={recipe.point[0] + 12} y={recipe.point[1] - 10}>{recipe.id}</text>
            </svg>
            <footer><span><i /> PRIOR</span><span><i className="proposal" /> PROPOSED</span><b>{history.length} RUNS · UNCERTAINTY {recipe.uncertainty}</b></footer>
          </div>
          <div className="candidate-list">
            {availableRecipes.map((candidate) => {
              const measured = [...history].reverse().find((result) => result.candidate === candidate.id);
              return <button key={candidate.id} type="button" className={`${candidate.id === run.selected ? 'active ' : ''}${candidate.id === 'A-29' ? 'learned' : ''}`} disabled={run.stage > 0} onClick={() => updateRun({ selected: candidate.id, message: `${candidate.id} selected. Review its synthesis envelope before release.` })}>
                <span>{candidate.id}</span><div><b>{candidate.name}</b><small>{candidate.formula}</small></div><em>{measured ? `${measured.measured}% ${measured.objectiveMet ? '✓' : '·'}` : candidate.prediction}</em>
              </button>;
            })}
            {!adaptiveUnlocked && <div className="candidate-lock"><span>◇</span><div><b>ADAPTIVE SLOT LOCKED</b><small>retain 2 qualified results</small></div><em>{history.length} / 2</em></div>}
          </div>
          <div className="recipe-envelope"><span>SYNTHESIS ENVELOPE</span><div><b>{recipe.temperature}</b><small>calcination</small></div><div><b>{recipe.dwell}</b><small>dwell</small></div><div><b>{recipe.prediction}</b><small>predicted phase</small></div></div>
          {history.length > 0 && <div className="campaign-history"><span>MODEL MEMORY</span>{history.slice(-3).map((result) => <div key={result.runNumber}><b>RUN-{String(result.runNumber).padStart(3, '0')}</b><i>{result.candidate}</i><em className={result.objectiveMet ? 'hit' : 'miss'}>{result.measured}%</em></div>)}</div>}
        </aside>

        <section className="campaign-routing">
          <div className="campaign-panel-head"><div><span>LIVE MATERIAL ROUTE</span><b>{identity.runId} · {recipe.id}</b></div><em>{String(Math.min(run.stage + 1, 8)).padStart(2, '0')} / 08</em></div>
          <div className="route-board">
            <RouteCell code="PREP-01" label="PREP" cycle="12 MIN" state={routeState(run.stage, 1, 2)} current={run.stage === 1} job={run.stage >= 1 ? identity.runId : 'OPEN'} />
            <RouteCell code="ROBO-02" label="SYNTHESIZE" cycle="14 MIN" state={run.stage === 2 ? 'fault' : routeState(run.stage, 3, 4)} current={run.stage === 3} job={run.stage === 2 ? 'CELL FAULT' : run.stage >= 3 ? identity.runId : 'WAIT'} />
            <RouteCell code="FURN-04" label="CALCINE" cycle={`${recipe.thermalMinutes} MIN`} state={run.stage === 4 ? 'queued' : routeState(run.stage, 5, 6)} current={run.stage === 5} job={run.stage === 4 ? 'Q 01' : run.stage >= 5 ? identity.runId : 'RUN-039'} />
            <RouteCell code="XRD-03" label="MEASURE" cycle="18 MIN" state={run.stage === 6 ? 'fault' : routeState(run.stage, 6, 7)} current={run.stage === 6} job={run.stage === 6 ? 'QC HOLD' : run.stage >= 7 ? identity.runId : 'RUN-038'} />
            <RouteCell code="MODEL" label="LEARN" cycle="GATED" state={run.stage >= 7 ? 'complete' : 'waiting'} current={false} job={run.stage >= 7 ? `+${recipe.insightReward} RP` : 'EVIDENCE'} />
          </div>

          <div className={`constraint-console ${fault ? `fault-${fault}` : run.stage >= 7 ? recipe.objectiveMet ? 'result-hit' : 'result-miss' : ''}`}>
            <div className="constraint-signal"><span>{fault ? 'BOTTLENECK DETECTED' : run.stage >= 7 ? recipe.objectiveMet ? 'VALID RESULT · TARGET MET' : 'VALID RESULT · TARGET MISSED' : 'ROUTE STATUS'}</span><b>{fault === 'cell' ? 'ROBO-02 / CLEANLINESS' : fault === 'queue' ? 'FURN-04 / CAPACITY 1 OF 1' : fault === 'qc' ? 'XRD-03 / CONTROL DUE' : run.stage >= 7 ? `${recipe.measured}% · GAP ${recipe.gap}` : 'FLOW NOMINAL'}</b><i /></div>
            <div className="constraint-visual" aria-label="Campaign queue visualization">
              <span className="queue-axis">QUEUE</span>
              <div className={`queue-token token-a ${run.stage >= 4 ? 'visible' : ''}`}>{identity.suffix}</div>
              <div className={`queue-token token-b ${run.stage === 4 ? 'visible' : ''}`}>{String(currentRunNumber + 1).padStart(3, '0')}</div>
              <div className={`machine-aperture ${fault ? 'held' : ''}`}><i /><b>{fault ? 'HOLD' : 'READY'}</b></div>
              <em>{fault === 'queue' ? '62 min wait' : fault === 'cell' ? '18 min recovery' : fault === 'qc' ? 'reference first' : run.stage >= 7 ? recipe.objectiveMet ? 'objective achieved' : 'valid negative result' : 'no active delay'}</em>
            </div>
            <p>{run.message}</p>
          </div>

          <div className="campaign-timeline" aria-label="Equipment schedule">
            <header><span>EQUIPMENT SCHEDULE</span><b>NOW</b><i>+2 H</i><i>+4 H</i><i>+6 H</i></header>
            <div><span>ROBO-02</span><i className="bar robot" /><b>{identity.runId}</b></div>
            <div><span>FURN-04</span><i className="bar furnace" /><b>RUN-039</b><i className="bar furnace queued" /><b>{identity.suffix}</b></div>
            <div><span>XRD-03</span><i className="bar xrd" /><b>REF</b><i className="bar xrd queued" /><b>{identity.suffix}</b></div>
          </div>
        </section>
      </div>

      <footer className="campaign-actions">
        <div><span>PLAYER COMMAND</span><b>{run.stage >= 7 ? `${recipe.id} · ${recipe.measured}% · ${recipe.gap}` : primary.hint}</b></div>
        {run.stage === 2 && <button type="button" className="secondary" onClick={() => rejectShortcut('robot')}>BYPASS WITNESS</button>}
        {run.stage === 4 && <button type="button" className="secondary" onClick={() => rejectShortcut('furnace')}>SHORTEN RUN-039</button>}
        <button type="button" onClick={run.stage > 0 && run.stage < 7 ? viewInLab : advance}>{primary.label}<span>→</span></button>
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

function getPrimaryAction(stage: number, runId: string) {
  return [
    { label: 'QUEUE GOVERNED RUN', hint: 'Release the selected recipe to PREP-01' },
    { label: 'OPERATE PREP-01', hint: 'Walk down the setup, then prove the preparation controls' },
    { label: 'RECOVER ROBO-02', hint: 'Inspect, clean, and qualify the gripper at the cell' },
    { label: 'OPERATE ROBO-02', hint: 'Prove the carrier and execute six-position dosing' },
    { label: 'OPERATE FURN-04', hint: 'Verify occupancy, Q01, and the physical hold location' },
    { label: 'START FURN-04 PROFILE', hint: 'Prove the load and start the governed thermal cycle' },
    { label: 'QUALIFY XRD-03', hint: `Run the Si control before measuring ${runId}` },
    { label: 'START NEXT CAMPAIGN', hint: 'AI-eligible result · objective missed by 0.2 percentage point' },
  ][stage] ?? { label: 'START NEXT CAMPAIGN', hint: 'Clear the completed lane' };
}
