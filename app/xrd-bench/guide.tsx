'use client';

// The newcomer layer: an intro card, words that explain themselves when tapped, and the guide line under the bench.
import { createContext, useContext, type ReactNode } from 'react';
import { ARIA, WORD } from './copy';
import { GOAL_LINE, INTRO_LINES, LEGEND } from './gloss';
import type { GoalStep } from './view';

/** A word and its plain meaning. */
export type Gloss = { readonly word: string; readonly line: string };
type GlossApi = { readonly shown?: Gloss; readonly show: (gloss: Gloss, toggle?: boolean) => void };

export const GlossContext = createContext<GlossApi>({ show: () => {} });

/** Shows a meaning on the guide line when a choice is picked, as a tap on its word would. */
export const useGloss = () => useContext(GlossContext).show;

/** A word that explains itself on tap; a second tap on the same word clears the meaning. */
export function Term({ word, line, className, children }: { readonly word: string; readonly line: string; readonly className?: string; readonly children?: ReactNode }) {
  const { shown, show } = useContext(GlossContext);
  const on = shown?.word === word && shown.line === line;
  return <button type="button" className={className ? `xb-term ${className}` : 'xb-term'} data-on={on || undefined} onClick={() => show({ word, line }, true)}>{children ?? word}</button>;
}

/** The one line under the bench: a tapped word's meaning, else the next step until the first call. */
export function GuideLine({ gloss, step }: { readonly gloss?: Gloss; readonly step?: GoalStep }) {
  if (!gloss && !step) return null;
  // The legend names the plot marks only once a fit draws them.
  const legend = !gloss && (step === 'misfit' || step === 'decide');
  return <footer className="xb-guide" role="status">
    {gloss ? <p><b>{gloss.word}</b> {gloss.line}</p> : step && <p>{GOAL_LINE[step]}</p>}
    {legend && <p className="xb-legend" aria-hidden="true">
      <span><i data-mark="band" />{LEGEND.misfit}</span>
      <span><i data-mark="missing">▼</i>{LEGEND.missing}</span>
      <span><i data-mark="lines" />{LEGEND.lines}</span>
    </p>}
  </footer>;
}

const INTRO_KEY = 'matterlab-xrd-intro-v1';
/** Where storage is blocked the intro still shows once per page load. */
let introDone = false;

export function introSeen() {
  if (introDone) return true;
  try {
    return window.localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen() {
  introDone = true;
  try {
    window.localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // The module flag keeps it closed for this visit.
  }
}

// A made-up pattern: four peaks on a flat background, drawn once.
const PEAKS: readonly (readonly [number, number])[] = [[44, 42], [96, 20], [150, 50], [202, 18]];
const TRACE = Array.from({ length: 961 }, (_, index) => {
  const x = index / 4;
  const y = PEAKS.reduce((sum, [centre, height]) => sum + height * Math.exp(-(((x - centre) / 3.2) ** 2)), 0);
  return `${x},${(62 - y).toFixed(1)}`;
}).join(' ');

/** Peaks with two reference barcodes under them; the last peak has no barcode and stays amber. */
function IntroPicture() {
  return <svg className="xb-intro-picture" viewBox="0 0 240 96" aria-hidden="true">
    <rect x="192" y="6" width="20" height="58" fill="var(--xb-amber)" opacity=".16" />
    <polyline points={TRACE} fill="none" stroke="var(--plot-observed)" strokeWidth="1.5" strokeLinejoin="round" />
    <g stroke="var(--xb-cyan)" strokeWidth="2">
      <line x1="44" y1="72" x2="44" y2="80" />
      <line x1="150" y1="72" x2="150" y2="80" />
    </g>
    <line x1="96" y1="86" x2="96" y2="94" stroke="var(--xb-violet)" strokeWidth="2" />
    <text x="202" y="88" fill="var(--xb-amber)" fontSize="12" textAnchor="middle">?</text>
  </svg>;
}

export function IntroCard({ onStart }: { readonly onStart: () => void }) {
  return <div className="xb-intro" role="group" aria-label={ARIA.intro}>
    <div className="xb-intro-card">
      <IntroPicture />
      <p className="xb-line xb-muted">Schematic pattern</p>
      <ol>{INTRO_LINES.map((line) => <li key={line}>{line}</li>)}</ol>
      <button type="button" className="xb-primary" onClick={onStart}>{WORD.start}</button>
    </div>
  </div>;
}
