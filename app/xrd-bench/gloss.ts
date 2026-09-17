// Plain meanings for a newcomer, one short line each, shown when a word is tapped or a choice is picked.
// They say what a word stands for, never what a sample holds: no numbers and no verdicts.
// A node test imports this module, so its imports carry .ts extensions like the core.
import type { FeatureKind, PhaseStatus } from '../xrd/analysis.ts';
import type { Decision, DebriefRowId, Unexplained } from '../xrd/lab.ts';
import type { ProgramId } from '../xrd/measure.ts';
import type { GoalStep } from './view.ts';

/** The three lines on the intro card, in reading order. */
export const INTRO_LINES: readonly string[] = [
  'Each kind of crystal scatters X-rays into its own barcode of peaks',
  'Scan a powder, add reference barcodes, and FIT them to its peaks',
  'Peaks nothing explains are clues. Decide knowing what a scan can miss',
];

/** The bench's one next step for a newcomer, until the first call is committed. */
export const GOAL_LINE: Readonly<Record<GoalStep, string>> = {
  scan: 'Scan the powder to get its pattern',
  probe: 'Tap a peak to see which barcodes could explain it',
  add: 'ADD a barcode whose lines sit on the peaks',
  fit: 'Press FIT to test whether these barcodes explain the pattern',
  misfit: 'Amber marks show where the fit and the peaks disagree',
  decide: 'No peak is left unexplained. SUPPORT lists what a scan can miss',
};

/** Legend for the plot marks, shown beside a goal line once a fit is drawn. */
export const LEGEND = { misfit: 'fit disagrees', missing: 'expected peak missing', lines: 'barcode lines' } as const;

export const GLOSS = {
  sheet: {
    data: 'Prepare the powder and scan it. Every scan uses some of the shift',
    support: 'What a fit cannot settle, the reference barcodes, and other tests',
    aim: 'What this batch was meant to be, and what its record says',
    decide: 'Name what is in the powder and what happens to the batch',
  },
  status: {
    required: 'The fit gets clearly worse without it',
    overlapped: 'The fit needs it, but its peaks sit under other phases',
    'not-required': 'The fit barely changes without it',
    'not-detected': 'The fit gave it no share of the pattern',
  } satisfies Record<PhaseStatus, string>,
  lines: {
    seen: 'Its expected peaks that showed up in this scan',
    shared: 'Its peaks under another phase: evidence neither way',
    absent: 'Peaks it should give here that the scan does not show',
  },
  reach: {
    small: 'A small amount would show in this scan. Still not proof it is absent',
    large: 'Only a large amount would show in this scan, so it may be hiding',
    none: 'Its peaks all sit under other phases, so this scan cannot show it',
  },
  spacing: {
    zr: 'A rough Zr estimate using the simulated lattice expansion',
    checkZero: 'Peak positions can mislead until the zero is checked',
  },
  feature: {
    unexplained: 'Signal no barcode in this fit accounts for',
    position: 'Peaks off their barcode positions: a changed crystal or angle offset',
    intensity: 'Peak heights off: grain size or grains lying one way',
    broad: 'A wide misfit no barcode explains',
  } satisfies Record<FeatureKind, string>,
  unexplained: {
    none: 'You say the fit leaves nothing unexplained',
    reference: 'Something is there that no reference in the library matches',
    measurement: 'The data are too weak to say what is left',
  } satisfies Record<Unexplained, string>,
  decision: {
    release: 'Pass the batch on as it is',
    recalcine: 'Fire it again so an unfinished reaction can complete',
    'regrind-recalcine': 'Grind and fire again, for starting grains that never met',
    'adjust-stoichiometry': 'Remake it from powders weighed in the right ratio',
    'change-media': 'Grind with agate, if the grinding media left material behind',
    'hold-reference': 'Hold the batch until a reference for the unknown is found',
  } satisfies Record<Decision, string>,
  program: {
    survey: 'A quick look over the usual angles',
    standard: 'Finer steps and more counts, so weak peaks stand out',
    slow: 'The longest scan and the most counts, for the faintest peaks',
    wide: 'A quick look over a wider range of angles',
    targeted: 'A short, close look around one peak you picked',
  } satisfies Record<ProgramId, string>,
  row: {
    measurement: 'Were the scans good enough for the call?',
    support: 'Did what you said was left match the evidence?',
    identity: 'Did the phases you claimed match the powder?',
    decision: 'Did the batch decision meet the aim?',
  } satisfies Record<DebriefRowId, string>,
  word: {
    shift: 'Time left in the shift. Scans and tests use it up',
    time: 'The dot colour shows how much of the shift an action uses',
    jar: 'Powder left for this sample. Mounts and tests use some',
    fit: 'Scale the chosen barcodes to the pattern and see what is left over',
    notProof: 'A better fit favours an explanation. It never proves one',
    looksLike: 'This scan cannot tell these phases apart',
    unsupported: 'No record, note or EDS puts this element in the sample',
    zero: 'The instrument angle offset. Checking it removes one position error',
    aliquot: 'Rescoop the same portion, or take fresh powder from the jar',
    grind: 'Finer grinding gives more grains, so peak heights come out truer',
    spin: 'Spinning the holder brings more grains into the beam',
    load: 'How powder goes in. Back loading helps stop grains lying one way',
    spike: 'A known powder mixed in, whose peaks pin the angle scale',
    search: 'Offer references from elements on record, or the whole library',
    limits: 'What this fit cannot settle on its own',
    refs: 'Reference barcodes: the peaks each known crystal gives',
    tests: 'Other instruments, for what a scan cannot see',
    tga: 'Weighs the powder while heating it. Losses point to water or carbonate',
    sem: 'Images the grains and reads which elements are there',
    basis: 'The finished fit your call rests on',
    claim: 'The phases you say are in the powder',
    unexplained: 'What you say about signal the fit leaves over',
    next: 'What happens to the batch now',
  },
} as const;
