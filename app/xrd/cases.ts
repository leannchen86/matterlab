// Sample cases: what the submission record says, what inspection can reveal, and the hidden synthesis history behind each
// powder. Histories never reach the analysis or the player before a call is committed; the diffractometer and the
// follow-up instruments read the powder they produce, and only their observations reach the screen.
import type { ElementSymbol } from './elements.ts';
import type { Grind, MountRecord, SpikeKind, Specimen } from './measure.ts';
import { synthesize, type SynthesisHistory } from './synthesis.ts';

export type Cue = {
  readonly id: string;
  /** Where the note lives, e.g. MILL LOG. */
  readonly label: string;
  /** What inspection finds, in one line. */
  readonly text: string;
  /** Elements the note documents. */
  readonly elements?: readonly ElementSymbol[];
};

export type Objective = {
  readonly label: string;
  /** Phases the synthesis is meant to produce. */
  readonly targets: readonly string[];
  /** Intended Zr on the Ti site in mol%, for a solid solution. */
  readonly zrMolPercent?: number;
};

export type SampleRecord = {
  readonly code: string;
  readonly title: string;
  readonly objective: Objective;
  readonly facts: readonly string[];
  /** Fields the record leaves blank. */
  readonly missing: readonly string[];
  /** What the requester expects: hypotheses, not evidence. */
  readonly hypotheses: readonly string[];
  /** Elements listed on the submission form, which can be incomplete. */
  readonly elements: readonly ElementSymbol[];
};

export type LoadedMount = { readonly method: MountRecord['method']; readonly grind: Grind; readonly spike: SpikeKind; readonly spikeFraction: number; readonly spin: boolean };

export type SampleCase = {
  readonly record: SampleRecord;
  readonly cues: readonly Cue[];
  /** Powder in the jar in grams. */
  readonly powderG: number;
  /** Mount the sample queue already loaded, which can be scanned straight away. */
  readonly queueMount: LoadedMount;
  /** Hidden. */
  readonly history: SynthesisHistory;
  /** Hidden: non-crystalline share of the powder. */
  readonly amorphousFraction: number;
};

const QUEUE: LoadedMount = { method: 'front', grind: 'hand', spike: 'none', spikeFraction: 0, spin: false };

/** 0.1 mol CaCO₃ and 0.1 mol TiO₂, fired at the standard program. */
const BASE: SynthesisHistory = {
  precursors: [{ material: 'CaCO3', massG: 10.009 }, { material: 'TiO2', massG: 7.987 }],
  carbonateMoisture: 0,
  titania: { polymorph: 'rutile', d50Um: 0.5 },
  calcination: { temperatureC: 1250, hours: 12, regrinds: 1, bed: 'open' },
  storage: { hours: 24, relativeHumidity: 35 },
};

const CATIO3: Objective = { label: 'Single-phase CaTiO₃', targets: ['catio3'] };
const STOICHIOMETRIC = 'CaCO₃ + rutile TiO₂, 1:1';
const STANDARD_FIRE = '1250 °C · 12 h · 1 regrind';

export const CASES: readonly SampleCase[] = [
  {
    record: { code: 'S-101', title: 'CaTiO₃ batch A', objective: CATIO3, facts: [STOICHIOMETRIC, STANDARD_FIRE], missing: [], hypotheses: ['Fully reacted'], elements: ['Ca', 'Ti'] },
    cues: [{ id: 'furnace', label: 'FURNACE LOG', text: 'Program completed without alarms.' }],
    powderG: 1,
    queueMount: QUEUE,
    history: BASE,
    amorphousFraction: 0.01,
  },
  {
    record: { code: 'S-117', title: 'CaTiO₃ batch B', objective: CATIO3, facts: [STOICHIOMETRIC, STANDARD_FIRE], missing: ['Carbonate drying'], hypotheses: ['Fully reacted'], elements: ['Ca', 'Ti'] },
    cues: [{ id: 'balance', label: 'BALANCE LOG', text: 'CaCO₃ weighed from an open jar, not dried.' }],
    powderG: 1,
    queueMount: QUEUE,
    history: { ...BASE, carbonateMoisture: 0.012 },
    amorphousFraction: 0.01,
  },
  {
    record: { code: 'S-123', title: 'CaTiO₃ sintered', objective: CATIO3, facts: [STOICHIOMETRIC, '1350 °C · 24 h · 1 regrind'], missing: ['Mount preparation'], hypotheses: ['Fully reacted'], elements: ['Ca', 'Ti'] },
    cues: [{ id: 'queue', label: 'QUEUE NOTE', text: 'Loaded as received: gritty, not ground.' }],
    powderG: 0.6,
    queueMount: { ...QUEUE, grind: 'as-received' },
    history: { ...BASE, calcination: { temperatureC: 1350, hours: 24, regrinds: 1, bed: 'open' } },
    amorphousFraction: 0.005,
  },
  {
    record: {
      code: 'S-130',
      title: 'Zr8 CaTi₀.₉₂Zr₀.₀₈O₃',
      objective: { label: 'Zr8 in solution, single phase', targets: ['catio3'], zrMolPercent: 8 },
      facts: ['CaCO₃ + TiO₂ + ZrO₂', '1150 °C · 6 h · no regrind'],
      missing: ['ZrO₂ particle size'],
      hypotheses: ['Zr dissolved'],
      elements: ['Ca', 'Ti', 'Zr'],
    },
    cues: [{ id: 'precursor', label: 'PRECURSOR SHEET', text: 'ZrO₂ d50 about 4 µm, used as supplied.' }],
    powderG: 1,
    queueMount: QUEUE,
    history: {
      ...BASE,
      precursors: [{ material: 'CaCO3', massG: 10.009 }, { material: 'TiO2', massG: 0.092 * 79.866 }, { material: 'ZrO2', massG: 0.008 * 123.218 }],
      zirconia: { d50Um: 4 },
      calcination: { temperatureC: 1150, hours: 6, regrinds: 0, bed: 'open' },
      storage: { hours: 12, relativeHumidity: 30 },
    },
    amorphousFraction: 0.01,
  },
  {
    record: { code: 'S-142', title: 'CaTiO₃ low fire', objective: CATIO3, facts: [STOICHIOMETRIC, '950 °C · 2 h · covered crucible'], missing: ['Storage'], hypotheses: ['Fully reacted'], elements: ['Ca', 'Ti'] },
    cues: [{ id: 'shelf', label: 'SHELF TAG', text: 'Open jar on a humid shelf for 6 weeks.' }],
    powderG: 1,
    queueMount: QUEUE,
    history: { ...BASE, calcination: { temperatureC: 950, hours: 2, regrinds: 0, bed: 'covered' }, storage: { hours: 1000, relativeHumidity: 70 } },
    amorphousFraction: 0.02,
  },
  {
    record: { code: 'S-156', title: 'CaTiO₃ batch C', objective: CATIO3, facts: ['CaCO₃ + rutile TiO₂', STANDARD_FIRE], missing: ['Weighed masses'], hypotheses: ['Fully reacted'], elements: ['Ca', 'Ti'] },
    cues: [{ id: 'balance', label: 'BALANCE LOG', text: 'CaCO₃ 10.81 g, TiO₂ 7.99 g.' }],
    powderG: 1,
    queueMount: QUEUE,
    history: { ...BASE, precursors: [{ material: 'CaCO3', massG: 10.009 * 1.08 }, { material: 'TiO2', massG: 7.987 }] },
    amorphousFraction: 0.01,
  },
  {
    record: { code: 'S-163', title: 'CaTiO₃ milled', objective: CATIO3, facts: [STOICHIOMETRIC, 'Milled, then 1150 °C · 4 h'], missing: ['Mill jar and media'], hypotheses: ['Fully reacted'], elements: ['Ca', 'Ti'] },
    cues: [{ id: 'mill', label: 'MILL LOG', text: '12 h in a zirconia jar with zirconia balls.', elements: ['Zr'] }],
    powderG: 1,
    queueMount: QUEUE,
    history: { ...BASE, zirconia: { d50Um: 10 }, milling: { media: 'zirconia', minutes: 720 }, calcination: { temperatureC: 1150, hours: 4, regrinds: 0, bed: 'open' }, storage: { hours: 12, relativeHumidity: 30 } },
    amorphousFraction: 0.01,
  },
];

export const CASE_CODES: readonly string[] = CASES.map((sample) => sample.record.code);

export function sampleCase(code: string): SampleCase {
  const sample = CASES.find((item) => item.record.code === code);
  if (!sample) throw new Error(`Unknown sample ${code}`);
  return sample;
}

/** Hidden: the powder in the jar. */
export function specimenFor(sample: SampleCase): Specimen {
  return { phases: synthesize(sample.history), amorphousFraction: sample.amorphousFraction };
}
