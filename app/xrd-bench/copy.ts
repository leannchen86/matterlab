// Every word the bench shows, kept short and in one place.
// A node test imports this module through view.ts, so its imports carry .ts extensions like the core.
import type { Comparison, FeatureKind, PhaseStatus } from '../xrd/analysis.ts';
import type { ElementSource } from '../xrd/context.ts';
import type { Debrief, DebriefRowId, Grade, LabError, Limitation, TruthBand, Unexplained } from '../xrd/lab.ts';
import type { Grind, MountRecord, ProgramId, SpikeKind } from '../xrd/measure.ts';
import { catalogPhase } from '../xrd/phases.ts';

export const PROGRAM_LABEL: Readonly<Record<ProgramId, string>> = { survey: 'SURVEY', standard: 'STANDARD', slow: 'SLOW', wide: 'WIDE', targeted: 'TARGET' };
export const PROGRAM_ORDER: readonly ProgramId[] = ['survey', 'standard', 'slow', 'wide', 'targeted'];
/** Sweep animation per program; counts already exist when it starts. */
export const SWEEP_MS: Readonly<Record<ProgramId, number>> = { survey: 1500, targeted: 1500, wide: 2000, standard: 3000, slow: 5000 };

export const GRIND_LABEL: Readonly<Record<Grind, string>> = { 'as-received': 'AS RECEIVED', hand: 'HAND', extended: 'EXTENDED' };
export const METHOD_LABEL: Readonly<Record<MountRecord['method'], string>> = { front: 'FRONT', back: 'BACK' };
export const SPIKE_LABEL: Readonly<Record<SpikeKind, string>> = { none: 'NONE', silicon: 'Si', corundum: 'Al₂O₃' };

/** What a run repeats or changes, next to its program. */
export const RUN_WORD = { rescan: 'RESCAN', mount: 'NEW MOUNT', aliquot: 'NEW ALIQUOT' } as const;

/** Words on the bench's controls and lines. */
export const WORD = {
  // Top bar and workspace
  shiftOver: 'SHIFT OVER',
  minLeft: 'MIN LEFT',
  min: 'MIN',
  g: 'G',
  skip: 'SKIP',
  scanning: 'SCANNING',
  fit: 'FIT',
  fitting: 'FITTING',
  fitFailed: 'FIT FAILED',
  noFit: 'NO FIT',
  notProof: 'FIT, NOT PROOF',
  noLines: 'NO LIBRARY LINES',
  target: 'TARGET',
  add: 'ADD',
  max: 'MAX',
  seen: 'SEEN',
  absent: 'ABSENT',
  looksLike: 'LOOKS LIKE',
  unsupported: 'UNSUPPORTED',
  remove: 'REMOVE',
  noRun: 'NO RUN',
  noFlags: 'NO FLAGS',
  flags: 'FLAGS',
  unset: 'UNSET',
  committed: 'COMMITTED',
  // DATA
  scan: 'SCAN',
  rescan: 'RESCAN',
  prep: 'PREP',
  runs: 'RUNS',
  more: 'MORE',
  holdPlot: 'HOLD PLOT',
  checkOnly: 'CHECK ONLY',
  zero: 'ZERO',
  unchecked: 'UNCHECKED',
  checkZero: 'CHECK ZERO',
  zeroPrep: 'Si STANDARD',
  queue: 'QUEUE',
  jar: 'JAR',
  aliquot: 'ALIQUOT',
  same: 'SAME',
  new: 'NEW',
  grind: 'GRIND',
  spin: 'SPIN',
  off: 'OFF',
  on: 'ON',
  load: 'LOAD',
  spike: 'SPIKE',
  mount: 'MOUNT',
  overlay: 'OVERLAY',
  rerunOn: 'RERUN ON',
  // SUPPORT
  limits: 'LIMITS',
  refs: 'REFS',
  tests: 'TESTS',
  search: 'SEARCH',
  record: 'RECORD',
  all: 'ALL',
  addTo: 'ADD TO',
  useSpike: 'USE SPIKE',
  useZero: 'USE ZERO',
  send: 'SEND',
  readyIn: 'READY IN',
  wait: 'WAIT',
  noSteps: 'NO STEPS',
  hiddenBy: 'HIDDEN BY',
  noHeavy: 'NO HEAVY ELEMENTS',
  // AIM
  expected: 'EXPECTED',
  blank: 'BLANK',
  read: 'READ',
  // DECIDE
  basis: 'BASIS',
  noneLeft: 'NONE LEFT',
  left: 'LEFT',
  claim: 'CLAIM',
  fromBasis: 'FROM THE BASIS',
  unexplained: 'UNEXPLAINED',
  next: 'NEXT',
  running: 'RUNNING',
  hold: 'HOLD TO COMMIT',
  pressAgain: 'PRESS AGAIN TO COMMIT',
  fitBasis: 'FIT A BASIS',
  claimPhase: 'CLAIM A PHASE',
  sayLeft: 'SAY WHAT IS LEFT',
  pickNext: 'PICK NEXT',
  // Debrief
  reviewing: 'REVIEWING',
  inPowder: 'IN THE POWDER',
  claimed: 'CLAIMED',
  notClaimed: 'NOT CLAIMED',
  aimMet: 'AIM MET',
  aimMissed: 'AIM MISSED',
  wouldWork: 'WOULD WORK',
  none: 'NONE',
  nextSample: 'NEXT SAMPLE',
  newShift: 'NEW SHIFT',
  close: 'CLOSE',
} as const;

/** Labels read by assistive technology only. */
export const ARIA = {
  bench: 'XRD bench',
  sample: 'Sample',
  close: 'Close bench',
  pattern: 'Pattern',
  runs: 'Runs',
  sheets: 'Bench',
  program: 'Program',
  basis: 'Basis',
  next: 'Next',
  particles: 'Particles',
  references: 'References',
  fitOptions: 'Fit options',
  clearProbe: 'Clear probe',
  libraryLines: 'Library lines',
  showLines: 'Show lines',
  notOnRecord: 'Elements not on record',
  internalStandard: 'Internal standard',
  strongestPeak: 'Strongest net peak',
  resultReady: 'Result ready',
  addReference: (slot: string) => `Add reference to ${slot}`,
  add: (formula: string) => `Add ${formula}`,
  particle: (index: number) => `Particle ${index}`,
  slotsLeft: (left: number, total: number) => `${left} of ${total} slots left`,
  strength: (relative: number) => (relative >= 0.5 ? 'strong line' : relative >= 0.15 ? 'medium line' : 'weak line'),
  plot: (run: string, code: string) => `${run} pattern of ${code}. Tap to probe an angle; drag to pan; pinch or scroll to zoom; hold or right-click to set a target.`,
} as const;

/** Mount tag in the notebook's order, `M2 · FRONT · HAND · SPIN`. A queue mount shows only `M1 · QUEUE`. */
export function mountTag(mount: Pick<MountRecord, 'index' | 'grind' | 'method' | 'spike' | 'spin' | 'preparedBy'>) {
  if (mount.preparedBy === 'queue') return `M${mount.index} · ${WORD.queue}`;
  const parts = [`M${mount.index}`, METHOD_LABEL[mount.method], GRIND_LABEL[mount.grind]];
  if (mount.spin) parts.push(WORD.spin);
  if (mount.spike !== 'none') parts.push(`${SPIKE_LABEL[mount.spike]} ${WORD.spike}`);
  return parts.join(' · ');
}

export function phaseLabel(id: string) {
  if (id === 'rutile') return 'TiO₂ R';
  if (id === 'anatase') return 'TiO₂ A';
  return catalogPhase(id).reference.formula;
}

/** Where a sample stands in the sample menu; never a grade. */
export type SampleStatus = 'new' | 'started' | 'ready' | 'committed';
export const SAMPLE_STATUS: Readonly<Record<SampleStatus, string>> = { new: 'NEW', started: 'STARTED', ready: 'RESULT READY', committed: 'COMMITTED' };

export const SHEET_LABEL: Readonly<Record<'data' | 'support' | 'aim' | 'decide', string>> = { data: 'DATA', support: 'SUPPORT', aim: 'AIM', decide: 'DECIDE' };
export const TEST_LABEL = { tga: 'TGA', sem: 'SEM/EDS' } as const;
export const SOURCE_WORD: Readonly<Record<ElementSource, string>> = { record: 'RECORD', notebook: 'NOTE', eds: 'EDS' };
export const ARTEFACT_WORD = { tape: 'TAPE', stub: 'STUB' } as const;

export const LIMIT_COPY: Readonly<Record<Limitation, { readonly word: string; readonly line: string }>> = {
  counts: { word: 'LOW COUNTS', line: 'Strongest peak under 3000 counts' },
  sampling: { word: 'COARSE STEPS', line: 'Steps too coarse for the peaks' },
  grains: { word: 'GRAIN EFFECTS', line: 'Intensities off: grains or orientation' },
  unexplained: { word: 'UNEXPLAINED', line: 'Signal no chip explains' },
  position: { word: 'SHIFTED LINES', line: 'Peaks off calculated angles' },
  broad: { word: 'BROAD MISFIT', line: 'Broad signal no chip explains' },
  'missing-lines': { word: 'MISSING LINES', line: 'Predicted lines not seen' },
  overlap: { word: 'OVERLAP', line: 'Chips this scan cannot separate' },
};
export const DATA_LIMITS: readonly Limitation[] = ['counts', 'sampling', 'grains'];
export const unsupportedLine = (element: string) => `No record, note or EDS for ${element}`;

export const STATUS_WORD: Readonly<Record<PhaseStatus, string>> = { required: 'REQUIRED', overlapped: 'OVERLAPPED', 'not-required': 'NOT REQUIRED', 'not-detected': 'NOT SEEN' };
export const FEATURE_WORD: Readonly<Record<FeatureKind, string>> = { unexplained: 'UNEXPLAINED', position: 'SHIFTED', intensity: 'INTENSITY', broad: 'BROAD' };
export const COMPARISON_WORD: Readonly<Record<Comparison, string>> = { 'much-better': 'B MUCH BETTER', better: 'B BETTER', similar: 'B SIMILAR', worse: 'B WORSE', 'much-worse': 'B MUCH WORSE' };

export const ERROR_WORD: Readonly<Record<LabError, string>> = {
  'unknown-sample': 'NO SAMPLE',
  committed: 'COMMITTED',
  'no-time': 'NO TIME',
  'no-powder': 'NO POWDER',
  'no-capacity': 'NO SLOTS',
  'already-requested': 'SENT',
  'cannot-ungrind': 'CANNOT UNGRIND',
  'cannot-unspike': 'SPIKED',
  'unknown-run': 'NO RUN',
  'unknown-interpretation': 'FIT A BASIS',
  'no-candidates': 'ADD A PHASE',
  'not-in-library': 'NOT IN SEARCH',
  'no-spike': 'NO SPIKE',
  'no-standard': 'NO ZERO CHECK',
  'not-in-basis': 'CLAIM FROM BASIS',
  invalid: 'INVALID',
};

export const UNEXPLAINED_LABEL: Readonly<Record<Unexplained, string>> = { none: 'NONE', reference: 'NO REFERENCE', measurement: 'WEAK DATA' };
export const ROW_LABEL: Readonly<Record<DebriefRowId, string>> = { measurement: SHEET_LABEL.data, support: SHEET_LABEL.support, identity: SHEET_LABEL.aim, decision: SHEET_LABEL.decide };
export const BAND_LABEL: Readonly<Record<TruthBand, string>> = { major: 'MAJOR', minor: 'MINOR', trace: 'TRACE' };
export const GRADE_WORD: Readonly<Record<Grade, string>> = { good: 'GOOD', mixed: 'MIXED', poor: 'POOR' };

const counted = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

/** `64 MIN · 2 SCANS · 1 TEST · 5 EXPLANATIONS TRIED` */
export function debriefCounts(report: Pick<Debrief, 'minutes' | 'scans' | 'followUps'>, tried: number) {
  return [`${report.minutes} MIN`, counted(report.scans, 'SCAN', 'SCANS'), counted(report.followUps, 'TEST', 'TESTS'), `${counted(tried, 'EXPLANATION', 'EXPLANATIONS')} TRIED`].join(' · ');
}

export const formatCounts = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `${Math.round(value)}`);
