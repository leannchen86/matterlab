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
    purpose: 'Weighs powders, prepares XRD holders, and gives every specimen a matching label.',
    technicianView: ['Balance check: ±0.2 mg', 'Dust extraction: normal', 'XRD prep tools: ready', 'Open lots: 3'],
    dataProducts: ['weighing trace', 'lot-to-specimen transform', 'operator attestation'],
  },
  {
    id: 'ROBO-02',
    name: 'Robot cell',
    state: 'WAITING',
    tone: 'hold',
    meta: 'Awaiting carrier BC-184',
    purpose: 'Moves registered sample carriers between lab machines.',
    technicianView: ['Safety zone: clear', 'Gripper: powder carrier', 'Carrier handshake: waiting', 'Exceptions today: 1'],
    dataProducts: ['transfer events', 'pose/force telemetry', 'exception images'],
  },
  {
    id: 'FURN-04',
    name: 'Box furnace',
    state: 'RUNNING',
    tone: 'run',
    meta: '982 °C · 01:18 remaining',
    purpose: 'Heats samples with a saved temperature program.',
    technicianView: ['Setpoint: 1,000 °C', 'Measured: 982 °C', 'Door interlock: closed', 'Exhaust: normal'],
    dataProducts: ['temperature history', 'program revision', 'alarm history'],
  },
  {
    id: 'XRD-03',
    name: 'Powder XRD',
    state: 'QC DUE',
    tone: 'warn',
    meta: 'Silicon QC position check overdue',
    purpose: 'Uses X-rays to show which crystal structures are present.',
    technicianView: ['QC material: NIST SRM 640f', 'Last QC error: +0.17° 2θ', 'QC tolerance: ±0.05° 2θ', 'Sample testing: paused'],
    dataProducts: ['diffraction pattern', 'phase analysis', 'QC result'],
  },
  {
    id: 'SEM-01',
    name: 'SEM / EDS',
    state: 'READY',
    tone: 'ready',
    meta: 'Vacuum 2.1e−5 Pa',
    purpose: 'Magnifies the surface and maps elements in small areas.',
    technicianView: ['Vacuum: 2.1e−5 Pa', 'EDS dead time: 27%', 'Stage: home', 'SEM prep + coater: ready'],
    dataProducts: ['electron micrograph', 'EDS spectrum/map', 'acquisition context'],
  },
  {
    id: 'BET-02',
    name: 'Gas sorption',
    state: 'OFFLINE',
    tone: 'off',
    meta: 'Service ticket MX-233',
    purpose: 'Uses gas adsorption to estimate surface area and pore structure.',
    technicianView: ['Analysis ports: locked', 'Vacuum pump: service', 'Degas station: ready', 'Ticket: MX-233'],
    dataProducts: ['adsorption isotherm', 'BET fit window', 'degassing record'],
  },
  {
    id: 'TGA-01',
    name: 'Thermal analyzer',
    state: 'NO-SAMPLE CHECK DUE',
    tone: 'warn',
    meta: 'Empty-pan check due · 13:30',
    purpose: 'Measures mass and heat-flow changes while a sample is heated.',
    technicianView: ['Furnace: 28 °C', 'Purge N₂: stable', 'Pan pair: empty', 'No-sample check: due'],
    dataProducts: ['mass-change trace', 'heat-flow trace', 'thermal event context'],
  },
];

export const systemsAtlas = [
  {
    term: 'LIMS / LES',
    role: 'Sample identity, methods, results, and governed laboratory execution.',
    atBench: 'QUEUES · BARCODES · REQUIRED FIELDS · EXCEPTIONS · REVIEW STATE',
  },
  {
    term: 'MES / SCADA',
    role: 'Operations coordination and supervisory visibility across equipment and process controls.',
    atBench: 'STATES · INTERLOCKS · ALARMS · RECIPES · MATERIAL MOVES',
  },
  {
    term: 'XRD',
    role: 'Crystal-phase evidence from intensity versus diffraction angle.',
    atBench: 'PREP · SILICON QC · PEAK ERROR · FIT MISMATCH · RAW PATTERN',
  },
  {
    term: 'SEM / EDS',
    role: 'Surface morphology plus spatially local elemental composition.',
    atBench: 'MOUNT · VACUUM · CHARGING · FIELDS · ACQUISITION CONTEXT',
  },
  {
    term: 'TGA / DSC',
    role: 'Mass change and heat-flow response across time or temperature.',
    atBench: 'PAN · GAS FLOW · NO-SAMPLE CHECK · MASS · HEATING HISTORY',
  },
  {
    term: 'BET',
    role: 'Specific surface area inferred from a gas-adsorption isotherm.',
    atBench: 'DEGAS · ADSORBATE · LEAK · EQUILIBRIUM · FIT REGION',
  },
];

export const initialLog: { time: string; type: string; text: string }[] = [];
