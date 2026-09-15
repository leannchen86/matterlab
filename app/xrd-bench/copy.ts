// Every word the bench shows about the science, kept short and in one place.
import type { Comparison, FeatureKind, PhaseStatus } from '../xrd/analysis';
import type { DebriefRowId, LabError, Limitation, TruthBand, Unexplained } from '../xrd/lab';
import type { Grind, MountRecord, ProgramId, SpikeKind } from '../xrd/measure';
import { catalogPhase } from '../xrd/phases';

export const PROGRAM_LABEL: Readonly<Record<ProgramId, string>> = { survey: 'SURVEY', standard: 'STANDARD', slow: 'SLOW', wide: 'WIDE', targeted: 'TARGET' };
export const PROGRAM_ORDER: readonly ProgramId[] = ['survey', 'standard', 'slow', 'wide', 'targeted'];
/** Sweep animation per program; counts already exist when it starts. */
export const SWEEP_MS: Readonly<Record<ProgramId, number>> = { survey: 1500, targeted: 1500, wide: 2000, standard: 3000, slow: 5000 };

export const GRIND_LABEL: Readonly<Record<Grind, string>> = { 'as-received': 'NONE', hand: 'HAND', extended: 'LONG' };
export const SPIKE_LABEL: Readonly<Record<SpikeKind, string>> = { none: 'NONE', silicon: 'Si', corundum: 'Al₂O₃' };

export function mountLabel(mount: Pick<MountRecord, 'grind' | 'method' | 'spike' | 'spin'>) {
  const parts = [mount.grind === 'as-received' ? 'unground' : mount.grind === 'extended' ? 'long grind' : 'hand', mount.method];
  if (mount.spin) parts.push('spin');
  if (mount.spike !== 'none') parts.push(`${SPIKE_LABEL[mount.spike]} spike`);
  return parts.join(' · ');
}

export function phaseLabel(id: string) {
  if (id === 'rutile') return 'TiO₂ R';
  if (id === 'anatase') return 'TiO₂ A';
  return catalogPhase(id).reference.formula;
}

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

export const STATUS_WORD: Readonly<Record<PhaseStatus, string>> = { required: 'REQUIRED', overlapped: 'OVERLAPPED', 'not-required': 'NOT REQUIRED', 'not-detected': 'NOT DETECTED' };
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
export const ROW_LABEL: Readonly<Record<DebriefRowId, string>> = { measurement: 'DATA', support: 'SUPPORT', identity: 'AIM', decision: 'DECIDE' };
export const BAND_LABEL: Readonly<Record<TruthBand, string>> = { major: 'MAJOR', minor: 'MINOR', trace: 'TRACE' };

export const formatCounts = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `${Math.round(value)}`);
