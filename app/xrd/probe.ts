// Tap-to-probe: which reference lines in the current library sit near an angle on the pattern. It reads only reference
// structures and the model's own bounds, so it gives the same answer for every sample.
import { CASES, specimenFor } from './cases.ts';
import { ZERO_SHIFT_LIMIT_DEG } from './lab.ts';
import { phaseReference } from './library.ts';
import { DISPLACEMENT_SD_MM } from './measure.ts';
import { CU_KALPHA1, DEG, LAB_OPTICS, dFromTwoTheta, lorentzPolarization, twoThetaFromD, type EmissionLabel } from './profile.ts';

export type ReferenceLine = { readonly twoTheta: number; readonly relative: number };
/** A line under a tapped angle; a satellite carries its own angle and the parent's relative times its emission weight. */
export type LineHit = ReferenceLine & { readonly phaseId: string; readonly emission: EmissionLabel };

const LIMIT_DEG = 120;
const cache = new Map<string, readonly ReferenceLine[]>();

/**
 * Kα1 powder lines of a reference, scaled to the strongest line below 120° 2θ. Reflections within 0.02° of a line's first
 * reflection join that line, which sits at their intensity-weighted angle.
 */
export function referenceLines(phaseId: string): readonly ReferenceLine[] {
  const cached = cache.get(phaseId);
  if (cached) return cached;
  const merged: { first: number; weighted: number; intensity: number }[] = [];
  for (const reflection of phaseReference(phaseId).reflections) {
    const twoTheta = twoThetaFromD(reflection.d, CU_KALPHA1);
    if (twoTheta === undefined || twoTheta > LIMIT_DEG) continue;
    const intensity = reflection.multiplicity * reflection.fSquared * lorentzPolarization(twoTheta);
    // Membership is judged from the first angle, so a line never creeps along a run of close reflections.
    const near = merged.find((line) => Math.abs(line.first - twoTheta) < 0.02);
    if (near) {
      near.weighted += twoTheta * intensity;
      near.intensity += intensity;
    } else merged.push({ first: twoTheta, weighted: twoTheta * intensity, intensity });
  }
  const max = merged.reduce((best, line) => Math.max(best, line.intensity), 0);
  const lines = merged
    .map((line) => ({ twoTheta: line.intensity > 0 ? line.weighted / line.intensity : line.first, relative: max > 0 ? line.intensity / max : 0 }))
    .sort((a, b) => a.twoTheta - b.twoTheta);
  cache.set(phaseId, lines);
  return lines;
}

/** random.ts draws its uniform deviates on a 2⁻³² lattice and above zero, so no normal deviate exceeds this. */
const NORMAL_LIMIT = Math.sqrt(-2 * Math.log(2 ** -32));
const DISPLACEMENT_LIMIT_MM = NORMAL_LIMIT * Math.max(...Object.values(DISPLACEMENT_SD_MM));
/** Dissolved Zr only expands a host cell, so it moves lines to lower angles; the largest scale any case gives each phase. */
const LATTICE_LIMIT = new Map<string, number>();
for (const sample of CASES) for (const phase of specimenFor(sample).phases) LATTICE_LIMIT.set(phase.structureId, Math.max(LATTICE_LIMIT.get(phase.structureId) ?? 1, phase.latticeScale));
const KALPHA2 = LAB_OPTICS.spectrum.find((line) => line.label === 'Kα2');
/** An unresolved Kα doublet peaks between Kα1 and the doublet centroid, so its maximum moves up by at most this share of Δλ/λ. */
const KALPHA2_PULL = KALPHA2 ? ((KALPHA2.wavelength - CU_KALPHA1) / CU_KALPHA1) * (KALPHA2.weight / (1 + KALPHA2.weight)) : 0;
const SATELLITES = LAB_OPTICS.spectrum.filter((line) => line.label !== 'Kα1');
/** A satellite counts only when at least as strong as the Kβ of a phase's strongest line. */
const SATELLITE_MINIMUM = LAB_OPTICS.spectrum.find((line) => line.label === 'Kβ')?.weight ?? 0;

/**
 * How far below and above an emission line's own angle a phase's maximum can sit, in degrees 2θ. Only Kα1 carries the pull
 * of its unresolved Kα2 partner; a resolved Kα2 or Kβ peaks at its own angle plus the shifts.
 */
export function lineWindow(twoTheta: number, phaseId: string, emission: EmissionLabel = 'Kα1') {
  const theta = (twoTheta / 2) * DEG;
  // Use the expanded line's exact Bragg angle and its displacement bound on the low-angle side.
  const scale = LATTICE_LIMIT.get(phaseId) ?? 1;
  const expanded = scale === 1 ? twoTheta : 2 * Math.asin(Math.sin(theta) / scale) / DEG;
  const below = twoTheta - expanded + (2 * DISPLACEMENT_LIMIT_MM * Math.cos((expanded / 2) * DEG)) / LAB_OPTICS.radiusMm / DEG + ZERO_SHIFT_LIMIT_DEG;
  const shared = (2 * DISPLACEMENT_LIMIT_MM * Math.cos(theta)) / LAB_OPTICS.radiusMm / DEG + ZERO_SHIFT_LIMIT_DEG;
  const pull = emission === 'Kα1' ? KALPHA2_PULL : 0;
  return { below, above: shared + (2 * Math.tan(theta) * pull) / DEG };
}

const within = (line: number, twoTheta: number, phaseId: string, emission: EmissionLabel) => {
  const { below, above } = lineWindow(line, phaseId, emission);
  return twoTheta >= line - below && twoTheta <= line + above;
};

/**
 * Library lines whose maximum could sit at an angle, strongest first. Past a line's own window the angle can still be the
 * maximum of its Kα2 partner or its Kβ satellite, weighted by the emission.
 */
export function linesNear(twoTheta: number, library: readonly string[], minimumRelative = 0.03): LineHit[] {
  const hits: LineHit[] = [];
  for (const phaseId of library) {
    for (const line of referenceLines(phaseId)) {
      if (line.relative < minimumRelative) continue;
      if (within(line.twoTheta, twoTheta, phaseId, 'Kα1')) {
        hits.push({ phaseId, emission: 'Kα1', ...line });
        continue;
      }
      const d = dFromTwoTheta(line.twoTheta, CU_KALPHA1);
      for (const satellite of SATELLITES) {
        const at = twoThetaFromD(d, satellite.wavelength);
        const relative = line.relative * satellite.weight;
        if (at !== undefined && relative >= SATELLITE_MINIMUM && within(at, twoTheta, phaseId, satellite.label)) hits.push({ phaseId, emission: satellite.label, twoTheta: at, relative });
      }
    }
  }
  return hits.sort((a, b) => b.relative - a.relative);
}
