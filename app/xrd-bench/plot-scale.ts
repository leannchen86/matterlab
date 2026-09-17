import type { AngularRange, Grid } from '../xrd/pattern.ts';

/** Grid indices covering a view, with one point of margin either side. */
export function visibleIndices(grid: Grid, view: AngularRange) {
  return {
    first: Math.max(0, Math.floor((view.startDeg - grid.startDeg) / grid.stepDeg) - 1),
    last: Math.min(grid.count - 1, Math.ceil((view.endDeg - grid.startDeg) / grid.stepDeg) + 1),
  };
}

type Curve = { readonly calculated: ArrayLike<number> };
type ScaleInput = {
  readonly grid: Grid;
  readonly counts: ArrayLike<number>;
  readonly view: AngularRange;
  readonly fit?: Curve;
  readonly other?: Curve;
  readonly overlay?: { readonly grid: Grid; readonly counts: ArrayLike<number>; readonly scale: number };
  readonly revealDeg?: number;
};

/** Largest drawn intensity, before display transforms and headroom, regardless of which fit is active. */
export function plotScalePeak({ grid, counts, view, fit, other, overlay, revealDeg }: ScaleInput): number {
  const { first, last } = visibleIndices(grid, view);
  const revealed = revealDeg === undefined ? grid.count - 1 : Math.floor((revealDeg - grid.startDeg) / grid.stepDeg);
  const observedLast = Math.min(last, revealed);
  let peak = 1;
  for (let index = first; index <= observedLast; index += 1) peak = Math.max(peak, counts[index]);
  for (const curve of [fit, other]) {
    if (curve) for (let index = first; index <= last; index += 1) peak = Math.max(peak, curve.calculated[index]);
  }
  if (overlay) {
    const shown = visibleIndices(overlay.grid, view);
    for (let index = shown.first; index <= shown.last; index += 1) peak = Math.max(peak, overlay.counts[index] * overlay.scale);
  }
  return peak;
}
