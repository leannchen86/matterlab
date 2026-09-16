// Forward model from a solid-state synthesis history to the phases in the powder.
// CaCO₃ + TiO₂ (+ ZrO₂) calcined in air, then stored. Subsolidus fields of the CaO–TiO₂ join:
// Ca/Ti < 1 gives CaTiO₃ + TiO₂; 1 < Ca/Ti ≤ 4/3 gives CaTiO₃ + Ca₄Ti₃O₁₀ at equilibrium.
// Rate constants are illustrative first-order game constants, not fitted kinetics; they only need to
// reproduce the documented trends (hotter, longer, regrinding and finer TiO₂ react further; coarse ZrO₂ dissolves
// slowly; Ruddlesden–Popper phases need higher temperatures than perovskite, so excess Ca stays as CaO below about
// 1200 °C; free CaO hydrates, then carbonates, in humid air).

export type Precursor = {
  readonly material: 'CaCO3' | 'TiO2' | 'ZrO2';
  readonly massG: number;
};

export type TitaniaPolymorph = 'rutile' | 'anatase';

export type SynthesisHistory = {
  readonly precursors: readonly Precursor[];
  /** Mass fraction of adsorbed water in the carbonate lot (reduces the true CaCO₃ amount). */
  readonly carbonateMoisture: number;
  readonly titania: { readonly polymorph: TitaniaPolymorph; readonly d50Um: number };
  /** ZrO₂ particle size, for precursor zirconia and for chips worn from zirconia media. */
  readonly zirconia?: { readonly d50Um: number };
  readonly calcination: {
    readonly temperatureC: number;
    readonly hours: number;
    readonly regrinds: number;
    readonly bed: 'open' | 'covered';
  };
  /** Zirconia or agate milling before calcination. */
  readonly milling?: { readonly media: 'zirconia' | 'agate'; readonly minutes: number };
  /** Air exposure after the furnace: hours at a relative humidity. */
  readonly storage: { readonly hours: number; readonly relativeHumidity: number };
};

export type PhaseAmount = {
  readonly structureId: string;
  readonly weightFraction: number;
  readonly latticeScale: number;
  readonly crystalliteNm: number;
  readonly microstrain: number;
  /** Diffracting grain size in µm, which sets particle statistics, never peak width. */
  readonly grainUm: number;
};

const MASS = { CaCO3: 100.087, TiO2: 79.866, ZrO2: 123.218, CaO: 56.077, CaOH2: 74.093, CaTiO3: 135.943, Ca4Ti3O10: 463.903 };

/** Vegard estimate on the mean cell length: Δa/a ≈ +0.05% per mol% Zr on the Ti site, rounded from the cube root of the CaZrO₃/CaTiO₃ reference cell-volume ratio. */
export const ZR_LATTICE_PER_MOL_PERCENT = 0.0005;

function rate(temperatureC: number, d50Um: number) {
  const kelvin = temperatureC + 273.15;
  return 1.6 * Math.exp(-10000 * (1 / kelvin - 1 / 1273.15)) * Math.min(1.5, 2 / Math.max(d50Um, 0.5));
}

/** Moles of ZrO₂ worn from zirconia media per minute of milling a batch of about 20 g. */
const MEDIA_WEAR_MOL_PER_MIN = 3e-6;

export function synthesize(history: SynthesisHistory): PhaseAmount[] {
  const mass = (material: Precursor['material']) => history.precursors.filter((p) => p.material === material).reduce((sum, p) => sum + p.massG, 0);
  const nCa = (mass('CaCO3') * (1 - history.carbonateMoisture)) / MASS.CaCO3;
  const nTi = mass('TiO2') / MASS.TiO2;
  let nZr = mass('ZrO2') / MASS.ZrO2;
  const { temperatureC, hours, regrinds, bed } = history.calcination;
  if (history.milling?.media === 'zirconia') nZr += history.milling.minutes * MEDIA_WEAR_MOL_PER_MIN;

  const k = rate(temperatureC, history.titania.d50Um);
  const effectiveHours = hours * (1 + 0.6 * regrinds);
  const extent = 1 - Math.exp(-k * effectiveHours);
  // Ruddlesden–Popper growth carries a higher activation energy, referenced to 1250 °C.
  const rpExtent = 1 - Math.exp(-0.3 * k * Math.exp(-60000 * (1 / (temperatureC + 273.15) - 1 / 1523.15)) * effectiveHours);
  // ZrO₂ is refractory: it dissolves into the perovskite more slowly than TiO₂ reacts, in inverse proportion to its size.
  const zrExtent = 1 - Math.exp(-0.35 * rate(temperatureC, 0.5) * (0.5 / Math.max(history.zirconia?.d50Um ?? 0.5, 0.5)) * effectiveHours);
  const decarbonation = temperatureC < 600 ? 0 : 1 - Math.exp(-6 * Math.exp(-25000 * (1 / (temperatureC + 273.15) - 1 / 1073.15)) * (bed === 'covered' ? 0.3 : 1) * hours);

  const zrDissolved = nZr * zrExtent;
  const nB = nTi + zrDissolved;
  const reactedB = extent * Math.min(nB, nCa);
  const rpMoles = Math.min(reactedB / 3, rpExtent * extent * Math.max(0, nCa - nB));
  const perovskite = reactedB - 3 * rpMoles;
  const titaniaLeft = nTi - (nTi / nB) * reactedB;
  const freeCa = nCa - perovskite - 4 * rpMoles;
  const carbonateLeft = freeCa * (1 - decarbonation);
  const lime = freeCa - carbonateLeft;

  const exposure = (history.storage.hours * history.storage.relativeHumidity) / 50;
  const hydrated = 1 - Math.exp(-exposure / 24);
  const carbonated = 1 - Math.exp(-exposure / 500);
  const limeLeft = lime * (1 - hydrated);
  const hydroxide = lime * hydrated * (1 - carbonated);
  const weatheredCarbonate = lime * hydrated * carbonated;

  const zrMolPercent = nB > 0 ? (100 * zrDissolved) / nB : 0;
  const perovskiteNm = 60 + 2.2 * Math.max(0, temperatureC - 850) + 8 * effectiveHours;
  // Grains coarsen along a cube-root time law: about 12 µm after 19 effective hours at 1250 °C, over 30 µm after sintering.
  const grainUm = Math.min(40, Math.max(3, 12 * Math.exp((temperatureC - 1250) / 150) * Math.cbrt(effectiveHours / 19.2)));
  const amounts: [string, number, Omit<PhaseAmount, 'structureId' | 'weightFraction'>][] = [
    ['catio3', perovskite * MASS.CaTiO3, { latticeScale: 1 + ZR_LATTICE_PER_MOL_PERCENT * zrMolPercent, crystalliteNm: perovskiteNm, microstrain: 0.0002, grainUm }],
    ['ca4ti3o10', rpMoles * MASS.Ca4Ti3O10, { latticeScale: 1, crystalliteNm: 0.7 * perovskiteNm, microstrain: 0.0004, grainUm: 0.8 * grainUm }],
    [history.titania.polymorph === 'anatase' && temperatureC < 700 ? 'anatase' : 'rutile', titaniaLeft * MASS.TiO2, { latticeScale: 1, crystalliteNm: 180, microstrain: 0.0002, grainUm: history.titania.d50Um * 2 }],
    ['baddeleyite', (nZr - zrDissolved) * MASS.ZrO2, { latticeScale: 1, crystalliteNm: 70, microstrain: 0.0006, grainUm: 3 }],
    ['calcite', (carbonateLeft + weatheredCarbonate) * MASS.CaCO3, { latticeScale: 1, crystalliteNm: weatheredCarbonate > carbonateLeft ? 35 : 90, microstrain: 0.0008, grainUm: 6 }],
    ['lime', limeLeft * MASS.CaO, { latticeScale: 1, crystalliteNm: 70, microstrain: 0.0005, grainUm: 8 }],
    ['portlandite', hydroxide * MASS.CaOH2, { latticeScale: 1, crystalliteNm: 45, microstrain: 0.0008, grainUm: 6 }],
  ];
  const total = amounts.reduce((sum, [, grams]) => sum + Math.max(0, grams), 0);
  return amounts
    .map(([structureId, grams, state]) => ({ structureId, weightFraction: Math.max(0, grams) / total, ...state }))
    .filter((phase) => phase.weightFraction > 0);
}
