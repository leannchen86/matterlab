// Laboratory Bragg–Brentano diffractometer optics: wavelengths, peak positions, peak shapes and intensity corrections.

export const DEG = Math.PI / 180;

/**
 * Cu Kα1 wavelength in Å from G. Hölzer et al., Phys. Rev. A 56 (1997) 4554, as used by the NIST SRM 640f certificate.
 * Kα2 and Kβ are the conventional values tabulated for powder diffraction.
 */
export const CU_KALPHA1 = 1.5405929;
export const CU_KALPHA2 = 1.544426;
export const CU_KBETA = 1.39225;

export type EmissionLabel = 'Kα1' | 'Kα2' | 'Kβ';

export type SpectralLine = {
  readonly label: EmissionLabel;
  readonly wavelength: number;
  /** Integrated intensity relative to Kα1. */
  readonly weight: number;
};

/** Ni-filtered Cu tube: Kα2/Kα1 = 0.5 and about 1% residual Kβ. */
export const CU_NI_FILTERED: readonly SpectralLine[] = [
  { label: 'Kα1', wavelength: CU_KALPHA1, weight: 1 },
  { label: 'Kα2', wavelength: CU_KALPHA2, weight: 0.5 },
  { label: 'Kβ', wavelength: CU_KBETA, weight: 0.01 },
];

export type InstrumentOptics = {
  /** Goniometer radius in mm. */
  readonly radiusMm: number;
  /** Gaussian instrument width: FWHM² = U tan²θ + V tanθ + W, in deg² (G. Caglioti et al., 1958). */
  readonly caglioti: { readonly u: number; readonly v: number; readonly w: number };
  /** Lorentzian instrument width, FWHM = X / cos θ, in degrees (spectral line width and optics). */
  readonly lorentzX: number;
  /** Axial-divergence asymmetry: below 90° the low-angle half of a peak is widened by 1 + asymmetry / tan 2θ. */
  readonly asymmetry: number;
  /** Constant 2θ offset of the goniometer zero in degrees. */
  readonly zeroShiftDeg: number;
  readonly spectrum: readonly SpectralLine[];
};

export type SpecimenBroadening = {
  /** Volume-weighted coherent domain size in nm; Infinity means no size broadening. */
  readonly crystalliteNm: number;
  /** Microstrain ε (dimensionless, e.g. 0.001). */
  readonly microstrain: number;
};

export type PeakShape = {
  /** Full width at half maximum of the symmetric core in degrees 2θ. */
  readonly fwhm: number;
  /** Lorentzian fraction of the pseudo-Voigt. */
  readonly eta: number;
  /** Half-width multipliers on the low-angle and high-angle sides (1 for a symmetric peak). */
  readonly lowSide: number;
  readonly highSide: number;
};

export function twoThetaFromD(d: number, wavelength: number) {
  const ratio = wavelength / (2 * d);
  if (ratio >= 1) return undefined;
  return (2 * Math.asin(ratio)) / DEG;
}

export function dFromTwoTheta(twoTheta: number, wavelength: number) {
  return wavelength / (2 * Math.sin((twoTheta / 2) * DEG));
}

/** Lorentz–polarization factor for Bragg–Brentano geometry without a monochromator. */
export function lorentzPolarization(twoTheta: number) {
  const theta = (twoTheta / 2) * DEG;
  const cos2 = Math.cos(2 * theta);
  return (1 + cos2 * cos2) / (Math.sin(theta) ** 2 * Math.cos(theta));
}

/**
 * 2θ shift in degrees from specimen surface displacement s (mm, positive below the focusing circle)
 * and the goniometer zero offset: Δ2θ = −2 s cos θ / R + zero.
 */
export function positionShift(twoTheta: number, displacementMm: number, optics: InstrumentOptics) {
  const theta = (twoTheta / 2) * DEG;
  return (-2 * displacementMm * Math.cos(theta)) / optics.radiusMm / DEG + optics.zeroShiftDeg;
}

/**
 * Thompson–Cox–Hastings pseudo-Voigt width and mixing (J. Appl. Cryst. 20 (1987) 79).
 * Instrument and microstrain broadening are Gaussian; Scherrer size broadening (K = 0.9) is Lorentzian.
 */
export function peakShape(twoTheta: number, wavelength: number, optics: InstrumentOptics, specimen: SpecimenBroadening): PeakShape {
  const theta = (twoTheta / 2) * DEG;
  const tan = Math.tan(theta);
  const cos = Math.cos(theta);
  const { u, v, w } = optics.caglioti;
  const instrumentGaussian2 = Math.max(u * tan * tan + v * tan + w, 1e-8);
  const strainGaussian = (4 * specimen.microstrain * tan) / DEG;
  const gaussian = Math.sqrt(instrumentGaussian2 + strainGaussian * strainGaussian);
  const sizeLorentzian = Number.isFinite(specimen.crystalliteNm) ? (0.9 * wavelength) / (specimen.crystalliteNm * 10 * cos) / DEG : 0;
  const lorentzian = optics.lorentzX / cos + sizeLorentzian;

  const g = gaussian;
  const l = lorentzian;
  const fwhm = (g ** 5 + 2.69269 * g ** 4 * l + 2.42843 * g ** 3 * l ** 2 + 4.47163 * g ** 2 * l ** 3 + 0.07842 * g * l ** 4 + l ** 5) ** 0.2;
  const ratio = l / fwhm;
  const eta = Math.min(1, Math.max(0, 1.36603 * ratio - 0.47719 * ratio ** 2 + 0.11116 * ratio ** 3));
  const skew = Math.min(3, 1 + optics.asymmetry / Math.abs(Math.tan(2 * theta)));
  return { fwhm, eta, lowSide: twoTheta < 90 ? skew : 1, highSide: twoTheta > 90 ? skew : 1 };
}

function symmetricPseudoVoigt(x: number, h: number, eta: number) {
  const z = (x * x) / (h * h);
  const lorentz = 2 / (Math.PI * h) / (1 + 4 * z);
  const gauss = ((2 * Math.sqrt(Math.LN2)) / (h * Math.sqrt(Math.PI))) * Math.exp(-4 * Math.LN2 * z);
  return eta * lorentz + (1 - eta) * gauss;
}

/** Area-normalized split pseudo-Voigt evaluated at offset x (degrees) from the peak maximum. */
export function pseudoVoigt(x: number, shape: PeakShape) {
  const low = shape.fwhm * shape.lowSide;
  const high = shape.fwhm * shape.highSide;
  const side = x < 0 ? low : high;
  return ((2 * side) / (low + high)) * symmetricPseudoVoigt(x, side, shape.eta);
}

/** Half-width of the window in degrees over which a peak is evaluated. */
export function profileWindow(shape: PeakShape) {
  return shape.fwhm * Math.max(shape.lowSide, shape.highSide) * (4 + 26 * shape.eta);
}

/** A laboratory instrument with Ni-filtered Cu radiation, fixed slits and a strip detector. */
export const LAB_OPTICS: InstrumentOptics = {
  radiusMm: 240,
  caglioti: { u: 0.004, v: -0.002, w: 0.002 },
  lorentzX: 0.02,
  asymmetry: 0.012,
  zeroShiftDeg: 0,
  spectrum: CU_NI_FILTERED,
};
