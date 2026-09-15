// Tap-to-probe: which reference lines in the current library sit near an angle on the pattern. It reads only reference
// structures, so it gives the same answer for every sample.
import { phaseReference } from './library.ts';
import { CU_KALPHA1, lorentzPolarization, twoThetaFromD } from './profile.ts';

export type ReferenceLine = { readonly twoTheta: number; readonly relative: number };
export type LineHit = ReferenceLine & { readonly phaseId: string };

const LIMIT_DEG = 120;
const cache = new Map<string, readonly ReferenceLine[]>();

/** Kα1 powder lines of a reference, merged within 0.02° and scaled to the strongest line below 120° 2θ. */
export function referenceLines(phaseId: string): readonly ReferenceLine[] {
  const cached = cache.get(phaseId);
  if (cached) return cached;
  const merged: { twoTheta: number; intensity: number }[] = [];
  for (const reflection of phaseReference(phaseId).reflections) {
    const twoTheta = twoThetaFromD(reflection.d, CU_KALPHA1);
    if (twoTheta === undefined || twoTheta > LIMIT_DEG) continue;
    const intensity = reflection.multiplicity * reflection.fSquared * lorentzPolarization(twoTheta);
    const near = merged.find((line) => Math.abs(line.twoTheta - twoTheta) < 0.02);
    if (near) near.intensity += intensity;
    else merged.push({ twoTheta, intensity });
  }
  const max = merged.reduce((best, line) => Math.max(best, line.intensity), 0);
  const lines = merged.map((line) => ({ twoTheta: line.twoTheta, relative: max > 0 ? line.intensity / max : 0 })).sort((a, b) => a.twoTheta - b.twoTheta);
  cache.set(phaseId, lines);
  return lines;
}

/** Library lines within a tolerance of an angle, strongest first; the tolerance covers typical specimen displacement. */
export function linesNear(twoTheta: number, library: readonly string[], toleranceDeg = 0.3, minimumRelative = 0.03): LineHit[] {
  return library
    .flatMap((phaseId) => referenceLines(phaseId)
      .filter((line) => Math.abs(line.twoTheta - twoTheta) <= toleranceDeg && line.relative >= minimumRelative)
      .map((line) => ({ phaseId, ...line })))
    .sort((a, b) => b.relative - a.relative);
}
