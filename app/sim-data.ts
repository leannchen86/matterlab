export type StationTone = 'ready' | 'hold' | 'run' | 'warn' | 'off';

export type Station = {
  id: string;
  name: string;
  state: string;
  tone: StationTone;
  meta: string;
  purpose: string;
  technicianView: string[];
  dataProducts: string[];
};

export const baseStations: Station[] = [
  {
    id: 'PREP-01',
    name: 'Powder prep',
    state: 'READY',
    tone: 'ready',
    meta: 'Balance verified · 07:42',
    purpose: 'Receives precursor lots, creates weighed specimens, and binds physical labels to the campaign manifest.',
    technicianView: ['Balance check: ±0.2 mg', 'Dust extraction: normal', 'Consumables: 83%', 'Open lots: 3'],
    dataProducts: ['weighing trace', 'lot-to-specimen transform', 'operator attestation'],
  },
  {
    id: 'ROBO-02',
    name: 'Robot cell',
    state: 'HOLD',
    tone: 'hold',
    meta: 'Awaiting carrier BC-184',
    purpose: 'Transfers registered carriers between preparation, heating, and characterization stations.',
    technicianView: ['Safety zone: clear', 'Gripper: powder carrier', 'Carrier handshake: waiting', 'Exceptions today: 1'],
    dataProducts: ['transfer events', 'pose/force telemetry', 'exception images'],
  },
  {
    id: 'FURN-04',
    name: 'Box furnace',
    state: 'RUNNING',
    tone: 'run',
    meta: '982 °C · 01:18 remaining',
    purpose: 'Executes the approved thermal recipe while retaining controller traces, alarms, and specimen occupancy.',
    technicianView: ['Setpoint: 1,000 °C', 'Measured: 982 °C', 'Door interlock: closed', 'Exhaust: normal'],
    dataProducts: ['temperature history', 'program revision', 'alarm history'],
  },
  {
    id: 'XRD-03',
    name: 'Powder XRD',
    state: 'QC DUE',
    tone: 'warn',
    meta: 'Peak position check overdue',
    purpose: 'Measures diffraction patterns used for phase identification and quantitative phase estimates.',
    technicianView: ['Reference: NIST Si', 'Last check: +0.17° 2θ', 'Limit: ±0.05° 2θ', 'Campaign: held'],
    dataProducts: ['diffraction pattern', 'phase analysis', 'QC result'],
  },
  {
    id: 'SEM-01',
    name: 'SEM / EDS',
    state: 'READY',
    tone: 'ready',
    meta: 'Vacuum 2.1e−5 Pa',
    purpose: 'Combines surface imaging with local elemental information for morphology and inclusion follow-up.',
    technicianView: ['Vacuum: 2.1e−5 Pa', 'EDS dead time: 27%', 'Stage: home', 'Coater: available'],
    dataProducts: ['electron micrograph', 'EDS spectrum/map', 'acquisition context'],
  },
  {
    id: 'BET-02',
    name: 'Gas sorption',
    state: 'OFFLINE',
    tone: 'off',
    meta: 'Service ticket MX-233',
    purpose: 'Measures adsorption isotherms used to estimate specific surface area and pore properties.',
    technicianView: ['Analysis ports: locked', 'Vacuum pump: service', 'N₂ supply: normal', 'Ticket: MX-233'],
    dataProducts: ['adsorption isotherm', 'BET fit window', 'degassing record'],
  },
  {
    id: 'TGA-01',
    name: 'TGA / DSC',
    state: 'BASELINE DUE',
    tone: 'warn',
    meta: 'Empty-pan baseline · 13:30',
    purpose: 'Tracks mass change and heat-flow response while retaining sample mass, pan, purge, and programmed thermal history.',
    technicianView: ['Furnace: 28 °C', 'Purge N₂: stable', 'Pan pair: empty', 'Baseline: due'],
    dataProducts: ['mass-change trace', 'heat-flow trace', 'thermal event context'],
  },
];

export const fieldGuide = [
  {
    term: 'LIMS / LES',
    role: 'Sample identity, methods, results, and governed laboratory execution.',
    atBench: 'You see work queues, barcodes, required fields, exceptions, and review status—not just a database.',
  },
  {
    term: 'MES / SCADA',
    role: 'Operations coordination and supervisory visibility across equipment and process controls.',
    atBench: 'You see equipment states, interlocks, alarms, recipes, and material movement while local controllers still own hard real-time control.',
  },
  {
    term: 'XRD',
    role: 'Crystal-phase evidence from intensity versus diffraction angle.',
    atBench: 'Sample preparation, reference checks, peak-position drift, fit residuals, and retained native patterns matter as much as the reported phase percentage.',
  },
  {
    term: 'SEM / EDS',
    role: 'Surface morphology plus spatially local elemental composition.',
    atBench: 'Mounting, vacuum compatibility, charging, acquisition conditions, and whether a field of view represents the specimen all affect interpretation.',
  },
  {
    term: 'TGA / DSC',
    role: 'Mass change and heat-flow response across time or temperature.',
    atBench: 'Pan selection, purge state, baseline/reference checks, sample mass, and thermal history are part of the result.',
  },
  {
    term: 'BET',
    role: 'Specific surface area inferred from a gas-adsorption isotherm.',
    atBench: 'Degassing history, adsorbate, leak checks, equilibrium criteria, and the selected fit region belong with the reported number.',
  },
];

export const initialLog = [
  { time: '07:05', type: 'handoff', text: 'Night shift placed Ca–Ti campaign on hold after XRD reference excursion.' },
  { time: '07:42', type: 'qc', text: 'PREP-01 balance check passed; reference mass within ±0.2 mg.' },
  { time: '08:03', type: 'system', text: 'WO-2841 assigned to TECH-07.' },
];
