// Element data used to compute X-ray reference patterns from crystal structures.
//
// Form factors: neutral-atom five-Gaussian fits f0(s) = c + sum a_i exp(-b_i s^2), with s = sin(theta)/lambda in 1/Å.
// Source: D. Waasmaier & A. Kirfel, Acta Cryst. A51 (1995) 416-431, as distributed in the ESRF DABAX file f0_WaasKirf.dat.
// Anomalous dispersion (f', f'') is ignored; neutral atoms are used for ionic compounds.
//
// Masses: IUPAC standard atomic weights (abridged).
// muRho: photoabsorption mass attenuation at Cu Kα1 in cm²/g, computed from Henke f2 tables (periodictable 2.1).
// Scattering contributions to attenuation are omitted, so values run a few percent below total attenuation tables.

export type ElementSymbol = 'H' | 'C' | 'O' | 'Al' | 'Si' | 'Ca' | 'Ti' | 'Zr' | 'Ba';

type Gaussians = readonly [number, number, number, number, number];

export type ElementData = {
  readonly z: number;
  readonly mass: number;
  readonly muRho: number;
  readonly a: Gaussians;
  readonly b: Gaussians;
  readonly c: number;
};

export const ELEMENTS: Readonly<Record<ElementSymbol, ElementData>> = {
  H: { z: 1, mass: 1.008, muRho: 0.4, a: [0.413048, 0.294953, 0.187491, 0.080701, 0.023736], b: [15.569946, 32.398468, 5.711404, 61.889874, 1.334118], c: 0.000049 },
  C: { z: 6, mass: 12.011, muRho: 4.2, a: [2.657506, 1.078079, 1.490909, -4.24107, 0.713791], b: [14.780758, 0.776775, 42.086842, -0.000294, 0.239535], c: 4.297983 },
  O: { z: 8, mass: 15.999, muRho: 11.0, a: [2.960427, 2.508818, 0.637853, 0.722838, 1.142756], b: [14.182259, 5.936858, 0.112726, 34.958481, 0.39024], c: 0.027014 },
  Al: { z: 13, mass: 26.982, muRho: 46.8, a: [4.730796, 2.313951, 1.54198, 1.117564, 3.154754], b: [3.628931, 43.051167, 0.09596, 108.932388, 1.555918], c: 0.139509 },
  Si: { z: 14, mass: 28.085, muRho: 60.5, a: [5.275329, 3.191038, 1.511514, 1.356849, 2.519114], b: [2.631338, 33.730728, 0.081119, 86.288643, 1.170087], c: 0.145073 },
  Ca: { z: 20, mass: 40.078, muRho: 171.2, a: [8.593655, 1.477324, 1.436254, 1.182839, 7.113258], b: [10.460644, 0.041891, 81.390381, 169.847839, 0.688098], c: 0.196255 },
  Ti: { z: 22, mass: 47.867, muRho: 204.0, a: [9.818524, 1.522646, 1.703101, 1.768774, 7.082555], b: [8.001879, 0.029763, 39.885422, 120.157997, 0.532405], c: 0.102473 },
  Zr: { z: 40, mass: 91.224, muRho: 130.7, a: [17.859772, 10.911038, 5.821115, 3.512513, 0.746965], b: [1.310692, 12.319285, 0.104353, 91.777542, 0.104353], c: 1.124859 },
  Ba: { z: 56, mass: 137.327, muRho: 343.7, a: [19.747343, 17.368477, 10.465718, 2.592602, 11.003653], b: [3.481823, 0.371224, 21.226641, 173.834274, 0.010719], c: -5.183497 },
};

export function isElementSymbol(value: string): value is ElementSymbol {
  return Object.prototype.hasOwnProperty.call(ELEMENTS, value);
}

/** Non-dispersive atomic form factor in electrons for s² = (sin θ / λ)² in 1/Å². */
export function formFactor(element: ElementSymbol, s2: number): number {
  const data = ELEMENTS[element];
  let value = data.c;
  for (let index = 0; index < 5; index += 1) value += data.a[index] * Math.exp(-data.b[index] * s2);
  return value;
}
