'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { AnalysisResult, PhaseStatus } from './xrd/analysis';
import type { Grid } from './xrd/pattern';
import { plotScalePeak, visibleIndices } from './xrd-bench/plot-scale';
import type { ReferenceLine } from './xrd/probe';

export type PlotRange = { readonly startDeg: number; readonly endDeg: number };
/** One tick row: a phase's reference lines, drawn by fit status, with amber ▼ at predicted lines not seen. */
export type PlotTicks = { readonly id: string; readonly lines: readonly ReferenceLine[]; readonly status?: PhaseStatus; readonly missing?: readonly number[] };
/** Another run drawn on its own grid, its counts multiplied by `scale`. */
export type PlotOverlay = { readonly grid: Grid; readonly counts: ArrayLike<number>; readonly scale: number };

const PHASE_COLORS: Readonly<Record<string, string>> = {
  catio3: '#62d6a6',
  rutile: '#f4b95f',
  anatase: '#ff9966',
  lime: '#c6e377',
  portlandite: '#8fb2ff',
  calcite: '#e58ad0',
  corundum: '#7fd3ff',
  silicon: '#b5c0cb',
  baddeleyite: '#ff7b8c',
  cazro3: '#b99bff',
  batio3: '#6fe3df',
  witherite: '#e6d17a',
  catio2o4: '#d9a36a',
};

export function phaseColor(id: string) {
  return PHASE_COLORS[id] ?? '#9aa7b4';
}

const MIN_SPAN_DEG = 0.4;
/** Residual significance shown in the strip; features are flagged from 4. */
const Z_LIMIT = 8;
const Z_GUIDE = 4;
const TAP_SLOP_PX = 6;
const HOLD_MS = 500;
const TICK_ALPHA: Readonly<Record<PhaseStatus, number>> = { required: 1, overlapped: 0.7, 'not-required': 0.35, 'not-detected': 0.35 };

type Box = { left: number; top: number; main: number; tickTop: number; residualTop: number; residual: number; axisTop: number; plotW: number };

/** Plot regions; `track` is the zoom track's measured height, kept clear under the axis labels. */
function layout(width: number, height: number, tickRows: number, track: number): Box {
  const left = 6;
  const top = 18;
  const axis = 18;
  const residual = Math.max(34, Math.round(height * 0.2));
  const tickRow = tickRows > 0 ? tickRows * 6 + 4 : 0;
  const main = Math.max(40, height - top - axis - track - residual - tickRow - 6);
  return { left, top, main, tickTop: top + main + 3, residualTop: top + main + tickRow + 5, residual, axisTop: height - track - axis, plotW: Math.max(1, width - 2 * left) };
}

function clampRange(range: PlotRange, full: PlotRange): PlotRange {
  const fullSpan = full.endDeg - full.startDeg;
  const span = Math.min(fullSpan, Math.max(Math.min(MIN_SPAN_DEG, fullSpan), range.endDeg - range.startDeg));
  const startDeg = Math.min(full.endDeg - span, Math.max(full.startDeg, range.startDeg));
  return { startDeg, endDeg: startDeg + span };
}

function tickStep(span: number, width: number) {
  const wanted = span / Math.max(2, width / 64);
  return [0.1, 0.2, 0.5, 1, 2, 5, 10, 20].find((step) => step >= wanted) ?? 20;
}

const formatCounts = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `${Math.round(value)}`);

type Columns = { px: number[]; lo: number[]; hi: number[] };

/** Min and max per half-pixel column, so dense scans keep every peak and zoomed views draw each point. */
function columns(grid: Grid, from: number, to: number, x: (deg: number) => number, value: (index: number) => number): Columns {
  const result: Columns = { px: [], lo: [], hi: [] };
  for (let index = from; index <= to; index += 1) {
    const column = Math.round(x(grid.startDeg + index * grid.stepDeg) * 2) / 2;
    const v = value(index);
    const last = result.px.length - 1;
    if (last >= 0 && result.px[last] === column) {
      if (v < result.lo[last]) result.lo[last] = v;
      if (v > result.hi[last]) result.hi[last] = v;
    } else {
      result.px.push(column);
      result.lo.push(v);
      result.hi.push(v);
    }
  }
  return result;
}

function strokeColumns(context: CanvasRenderingContext2D, data: Columns, y: (value: number) => number) {
  context.beginPath();
  for (let k = 0; k < data.px.length; k += 1) {
    if (k === 0) context.moveTo(data.px[k], y(data.hi[k]));
    else context.lineTo(data.px[k], y(data.hi[k]));
    if (data.lo[k] !== data.hi[k]) context.lineTo(data.px[k], y(data.lo[k]));
  }
  context.stroke();
}

type DrawInput = {
  readonly width: number;
  readonly height: number;
  readonly track: number;
  readonly view: PlotRange;
  readonly grid: Grid;
  readonly counts: ArrayLike<number>;
  readonly fit?: AnalysisResult;
  readonly dim: boolean;
  readonly other?: AnalysisResult;
  readonly overlay?: PlotOverlay;
  readonly highlight?: string;
  readonly ticks: readonly PlotTicks[];
  readonly ghost?: PlotTicks;
  readonly target?: PlotRange;
  readonly probeDeg?: number;
  readonly revealDeg?: number;
  readonly sqrt: boolean;
};

function drawPlot(canvas: HTMLCanvasElement, input: DrawInput) {
  const { width, height, track, view, grid, counts, fit, dim, other, overlay, highlight, ticks, ghost, target, probeDeg, revealDeg, sqrt } = input;
  if (width <= 0 || height <= 0) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const style = getComputedStyle(canvas);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const colors = {
    observed: token('--plot-observed', '#dce8f7'),
    fit: token('--plot-fit', '#4dd5ed'),
    other: token('--plot-other', '#f4b95f'),
    overlay: token('--plot-overlay', '#7c8ca2'),
    grid: token('--plot-grid', '#1c2a3d'),
    text: token('--plot-text', '#718198'),
    flag: token('--plot-flag', '#f4b95f'),
    misfit: token('--plot-misfit', '#ff6b6b'),
    probe: token('--plot-probe', '#ffffff'),
  };
  const font = `9px ${style.fontFamily || 'monospace'}`;

  const box = layout(width, height, ticks.length, track);
  const span = view.endDeg - view.startDeg;
  const x = (deg: number) => box.left + ((deg - view.startDeg) / span) * box.plotW;
  const { first, last } = visibleIndices(grid, view);
  const revealed = revealDeg === undefined ? grid.count - 1 : Math.floor((revealDeg - grid.startDeg) / grid.stepDeg);
  const observedLast = Math.min(last, revealed);
  const transform = sqrt ? (value: number) => Math.sqrt(Math.max(0, value)) : (value: number) => Math.max(0, value);
  const shown = overlay && visibleIndices(overlay.grid, view);
  const peak = plotScalePeak({ grid, counts, view, fit, other, overlay, revealDeg });
  const ceiling = transform(peak) * 1.08;
  const y = (value: number) => box.top + box.main * (1 - transform(value) / ceiling);
  const bottom = box.residualTop + box.residual;

  context.font = font;
  context.lineWidth = 1;
  const step = tickStep(span, box.plotW);
  context.strokeStyle = colors.grid;
  context.fillStyle = colors.text;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (let deg = Math.ceil(view.startDeg / step - 1e-9) * step; deg <= view.endDeg + 1e-9; deg += step) {
    const px = Math.round(x(deg)) + 0.5;
    context.beginPath();
    context.moveTo(px, box.top);
    context.lineTo(px, bottom);
    context.stroke();
    if (px > box.left + 10 && px < box.left + box.plotW - 18) context.fillText(`${Number(deg.toFixed(step < 1 ? 1 : 0))}°`, px, box.axisTop + 4);
  }
  context.textAlign = 'right';
  context.fillText('2θ', box.left + box.plotW, box.axisTop + 4);
  context.textAlign = 'left';
  context.fillText(sqrt ? `√ ${formatCounts(peak)}` : formatCounts(peak), box.left + 4, box.top + 2);

  context.save();
  context.beginPath();
  context.rect(box.left, 0, box.plotW, height);
  context.clip();

  if (target) {
    const from = x(target.startDeg);
    const to = x(target.endDeg);
    context.fillStyle = colors.flag;
    context.globalAlpha = 0.08;
    context.fillRect(from, box.top, to - from, bottom - box.top);
    context.globalAlpha = 0.9;
    context.strokeStyle = colors.flag;
    for (const edge of [from, to]) {
      context.beginPath();
      context.moveTo(Math.round(edge) + 0.5, box.top - 8);
      context.lineTo(Math.round(edge) + 0.5, bottom);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  if (fit && !dim) {
    for (const feature of fit.features) {
      const from = x(feature.startDeg - grid.stepDeg / 2);
      const to = x(feature.endDeg + grid.stepDeg / 2);
      if (to < box.left || from > box.left + box.plotW) continue;
      context.fillStyle = feature.kind === 'unexplained' ? colors.flag : colors.misfit;
      context.globalAlpha = 0.1;
      context.fillRect(from, box.top, Math.max(2, to - from), bottom - box.top);
      context.globalAlpha = 0.95;
      context.fillRect(from, box.top - 7, Math.max(4, to - from), 3);
    }
    context.globalAlpha = 1;
  }

  if (fit && !dim && highlight) {
    const phase = fit.phases.find((item) => item.id === highlight);
    if (phase) {
      const upper = columns(grid, first, last, x, (index) => fit.background[index] + phase.contribution[index]);
      const lower = columns(grid, first, last, x, (index) => fit.background[index]);
      context.beginPath();
      upper.px.forEach((px, k) => (k === 0 ? context.moveTo(px, y(upper.hi[k])) : context.lineTo(px, y(upper.hi[k]))));
      for (let k = lower.px.length - 1; k >= 0; k -= 1) context.lineTo(lower.px[k], y(lower.lo[k]));
      context.closePath();
      context.fillStyle = phaseColor(highlight);
      context.globalAlpha = 0.28;
      context.fill();
      context.globalAlpha = 1;
    }
  }

  if (overlay && shown) {
    context.strokeStyle = colors.overlay;
    context.globalAlpha = 0.85;
    strokeColumns(context, columns(overlay.grid, shown.first, shown.last, x, (index) => overlay.counts[index] * overlay.scale), y);
    context.globalAlpha = 1;
  }

  context.strokeStyle = colors.observed;
  context.globalAlpha = fit ? 0.7 : 0.9;
  strokeColumns(context, columns(grid, first, observedLast, x, (index) => counts[index]), y);
  context.globalAlpha = 1;

  if (fit) {
    context.strokeStyle = colors.text;
    context.globalAlpha = dim ? 0.3 : 0.6;
    context.setLineDash([2, 3]);
    strokeColumns(context, columns(grid, first, last, x, (index) => fit.background[index]), y);
    context.setLineDash([]);
    context.globalAlpha = dim ? 0.35 : 1;
    context.strokeStyle = colors.fit;
    context.lineWidth = 1.4;
    strokeColumns(context, columns(grid, first, last, x, (index) => fit.calculated[index]), y);
    context.globalAlpha = 1;
  }
  if (other) {
    context.strokeStyle = colors.other;
    context.lineWidth = 1.4;
    context.setLineDash([5, 4]);
    strokeColumns(context, columns(grid, first, last, x, (index) => other.calculated[index]), y);
    context.setLineDash([]);
  }
  context.lineWidth = 1;

  if (ghost) {
    context.strokeStyle = colors.flag;
    context.globalAlpha = 0.85;
    context.setLineDash([3, 3]);
    for (const line of ghost.lines) {
      if (line.twoTheta < view.startDeg || line.twoTheta > view.endDeg) continue;
      const px = Math.round(x(line.twoTheta)) + 0.5;
      context.beginPath();
      context.moveTo(px, box.top + box.main);
      context.lineTo(px, box.top + box.main * (1 - line.relative));
      context.stroke();
    }
    context.setLineDash([]);
    context.globalAlpha = 1;
  }

  ticks.forEach((row, r) => {
    const rowTop = box.tickTop + r * 6;
    context.fillStyle = phaseColor(row.id);
    context.globalAlpha = row.status ? TICK_ALPHA[row.status] : 0.8;
    for (const line of row.lines) {
      if (line.twoTheta < view.startDeg || line.twoTheta > view.endDeg) continue;
      // Barcode ticks mark positions only; the preview above carries relative intensities.
      const h = 5;
      context.fillRect(x(line.twoTheta) - 0.75, rowTop + 5 - h, 1.5, h);
    }
    context.globalAlpha = 1;
    context.fillStyle = colors.flag;
    for (const deg of row.missing ?? []) {
      if (deg < view.startDeg || deg > view.endDeg) continue;
      const px = x(deg);
      context.beginPath();
      context.moveTo(px - 3, rowTop);
      context.lineTo(px + 3, rowTop);
      context.lineTo(px, rowTop + 5);
      context.closePath();
      context.fill();
    }
  });

  const zero = box.residualTop + box.residual / 2;
  const zy = (z: number) => zero - (Math.max(-Z_LIMIT, Math.min(Z_LIMIT, z)) / Z_LIMIT) * (box.residual / 2);
  context.strokeStyle = colors.grid;
  context.beginPath();
  context.moveTo(box.left, zero + 0.5);
  context.lineTo(box.left + box.plotW, zero + 0.5);
  context.stroke();
  context.setLineDash([2, 4]);
  for (const guide of [Z_GUIDE, -Z_GUIDE]) {
    context.beginPath();
    context.moveTo(box.left, Math.round(zy(guide)) + 0.5);
    context.lineTo(box.left + box.plotW, Math.round(zy(guide)) + 0.5);
    context.stroke();
  }
  context.setLineDash([]);
  const residual = (result: AnalysisResult) => (index: number) => (counts[index] - result.calculated[index]) / Math.sqrt(Math.max(result.calculated[index], 1));
  if (other) {
    context.strokeStyle = colors.other;
    context.globalAlpha = 0.7;
    strokeColumns(context, columns(grid, first, observedLast, x, residual(other)), zy);
    context.globalAlpha = 1;
  }
  if (fit) {
    const data = columns(grid, first, observedLast, x, residual(fit));
    context.strokeStyle = colors.fit;
    context.globalAlpha = dim ? 0.35 : 1;
    strokeColumns(context, data, zy);
    context.globalAlpha = 1;
    if (!dim) {
      // Beyond the ±4 guides the residual turns amber.
      context.save();
      context.beginPath();
      context.rect(box.left, box.residualTop - 1, box.plotW, zy(Z_GUIDE) - box.residualTop + 1);
      context.rect(box.left, zy(-Z_GUIDE), box.plotW, bottom - zy(-Z_GUIDE) + 1);
      context.clip();
      context.strokeStyle = colors.flag;
      strokeColumns(context, data, zy);
      context.restore();
    }
  }

  if (revealDeg !== undefined && revealed < grid.count - 1) {
    const px = x(revealDeg);
    context.strokeStyle = colors.fit;
    context.lineWidth = 2;
    context.globalAlpha = 0.9;
    context.beginPath();
    context.moveTo(px, box.top);
    context.lineTo(px, bottom);
    context.stroke();
    context.globalAlpha = 1;
    context.lineWidth = 1;
  }

  if (probeDeg !== undefined && probeDeg >= view.startDeg && probeDeg <= view.endDeg) {
    const px = Math.round(x(probeDeg)) + 0.5;
    context.strokeStyle = colors.probe;
    context.globalAlpha = 0.75;
    context.beginPath();
    context.moveTo(px, box.top - 8);
    context.lineTo(px, bottom);
    context.stroke();
    context.globalAlpha = 1;
    const index = Math.round((probeDeg - grid.startDeg) / grid.stepDeg);
    if (index >= 0 && index <= observedLast) {
      context.fillStyle = colors.probe;
      context.beginPath();
      context.arc(px, y(counts[index]), 3, 0, 2 * Math.PI);
      context.fill();
    }
  }
  context.restore();
}

type Gesture = { readonly startView: PlotRange; readonly startX: number; readonly startY: number; readonly startDistance: number; readonly anchorDeg: number; readonly pinch: boolean; moved: boolean; held: boolean };
type Brush = { readonly startFraction: number; readonly startX: number; moved: boolean };

/**
 * Observed counts with the fitted explanation, an optional second explanation dashed, an optional overlay run, reference
 * ticks, a ghost of one phase's lines and the residual strip. Drag to pan, pinch or scroll to zoom, brush the track to
 * zoom, tap to probe an angle or a flagged band, right-click or hold to set the target band, double-click to show the
 * full range. Give it a key per run so the view resets when the scan changes.
 */
export function PatternPlot({ grid, counts, fit, dim = false, other, overlay, highlight, ticks = [], ghost, target, onTarget, probeDeg, onProbe, onScale, revealDeg, sqrt = false, focus, label }: {
  readonly grid: Grid;
  readonly counts: ArrayLike<number>;
  readonly fit?: AnalysisResult;
  /** The fit belongs to other chips or is being replaced: draw it faint, without bands. */
  readonly dim?: boolean;
  readonly other?: AnalysisResult;
  readonly overlay?: PlotOverlay;
  readonly highlight?: string;
  readonly ticks?: readonly PlotTicks[];
  /** Dashed amber lines of one phase over the full range. */
  readonly ghost?: PlotTicks;
  /** Targeted-scan band. */
  readonly target?: PlotRange;
  /** Right-click or a held press asks for a target centre here. */
  readonly onTarget?: (deg: number) => void;
  readonly probeDeg?: number;
  readonly onProbe?: (deg: number) => void;
  /** Degrees per pixel of the current view, reported whenever the view or the size changes. */
  readonly onScale?: (degPerPixel: number) => void;
  /** While acquiring, counts beyond this angle have not arrived. */
  readonly revealDeg?: number;
  readonly sqrt?: boolean;
  /** Moves the view whenever its key changes. */
  readonly focus?: PlotRange & { readonly key: string | number };
  readonly label: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const full = useMemo<PlotRange>(() => ({ startDeg: grid.startDeg, endDeg: grid.startDeg + (grid.count - 1) * grid.stepDeg }), [grid]);
  const [view, setView] = useState<PlotRange>(full);
  const [focusKey, setFocusKey] = useState(focus?.key);
  if (focus && focus.key !== focusKey) {
    setFocusKey(focus.key);
    setView(clampRange(focus, full));
  }
  const [size, setSize] = useState({ width: 0, height: 0, track: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const hold = useRef<number | undefined>(undefined);
  const brush = useRef<Brush | null>(null);
  const tickRows = ticks.length;

  // The track is watched as well: a coarse pointer makes it taller, and the layout keeps that room free.
  useEffect(() => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!wrap || !track) return;
    const observer = new ResizeObserver(() => setSize({ width: Math.round(wrap.clientWidth), height: Math.round(wrap.clientHeight), track: track.offsetHeight }));
    observer.observe(wrap);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => window.clearTimeout(hold.current), []);

  const reportScale = useEffectEvent((degPerPixel: number) => onScale?.(degPerPixel));
  useEffect(() => {
    if (size.width > 0) reportScale((view.endDeg - view.startDeg) / layout(size.width, size.height, tickRows, size.track).plotW);
  }, [size, view, tickRows]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawPlot(canvas, { width: size.width, height: size.height, track: size.track, view, grid, counts, fit, dim, other, overlay, highlight, ticks, ghost, target, probeDeg, revealDeg, sqrt });
  }, [size, view, grid, counts, fit, dim, other, overlay, highlight, ticks, ghost, target, probeDeg, revealDeg, sqrt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = layout(size.width, size.height, tickRows, size.track);
      const fraction = Math.min(1, Math.max(0, (event.offsetX - box.left) / box.plotW));
      setView((current) => {
        const span = current.endDeg - current.startDeg;
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
          const shift = (event.deltaX / box.plotW) * span;
          return clampRange({ startDeg: current.startDeg + shift, endDeg: current.endDeg + shift }, full);
        }
        const anchor = current.startDeg + fraction * span;
        const next = span * Math.exp(event.deltaY * 0.002);
        return clampRange({ startDeg: anchor - fraction * next, endDeg: anchor + (1 - fraction) * next }, full);
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [full, size, tickRows]);

  const degAt = (offsetX: number, range: PlotRange = view) => {
    const box = layout(size.width, size.height, tickRows, size.track);
    const fraction = (offsetX - box.left) / box.plotW;
    return Math.min(full.endDeg, Math.max(full.startDeg, range.startDeg + fraction * (range.endDeg - range.startDeg)));
  };

  /** The flagged band under a tap: anywhere over a narrow band, or on the marker strip above a wide one. */
  const bandAt = (px: number, py: number) => {
    if (!fit || dim) return undefined;
    const box = layout(size.width, size.height, tickRows, size.track);
    const xOf = (deg: number) => box.left + ((deg - view.startDeg) / (view.endDeg - view.startDeg)) * box.plotW;
    return fit.features.find((feature) => {
      const from = xOf(feature.startDeg - grid.stepDeg / 2);
      const to = xOf(feature.endDeg + grid.stepDeg / 2);
      const pad = Math.max(0, (8 - (to - from)) / 2);
      return px >= from - pad && px <= to + pad && (to - from <= 32 || py < box.top);
    });
  };

  const zoom = (factor: number) => {
    const span = view.endDeg - view.startDeg;
    const anchor = probeDeg !== undefined && probeDeg >= view.startDeg && probeDeg <= view.endDeg ? probeDeg : (view.startDeg + view.endDeg) / 2;
    const fraction = (anchor - view.startDeg) / span;
    const next = span * factor;
    setView(clampRange({ startDeg: anchor - fraction * next, endDeg: anchor + (1 - fraction) * next }, full));
  };

  const position = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const cancelHold = () => {
    window.clearTimeout(hold.current);
    hold.current = undefined;
  };

  const pinchStart = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = { startView: view, startX: (a.x + b.x) / 2, startY: (a.y + b.y) / 2, startDistance: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)), anchorDeg: degAt((a.x + b.x) / 2), pinch: true, moved: true, held: false };
  };

  /** One finger left of two: carry on as a pan from the current view. */
  const resumeWithOne = () => {
    const [rest] = [...pointers.current.values()];
    gesture.current = { startView: view, startX: rest.x, startY: rest.y, startDistance: 0, anchorDeg: 0, pinch: false, moved: true, held: false };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = position(event);
    pointers.current.set(event.pointerId, at);
    if (pointers.current.size === 1) {
      gesture.current = { startView: view, startX: at.x, startY: at.y, startDistance: 0, anchorDeg: 0, pinch: false, moved: false, held: false };
      cancelHold();
      if (onTarget) {
        const deg = degAt(at.x);
        hold.current = window.setTimeout(() => {
          hold.current = undefined;
          const current = gesture.current;
          if (!current || current.moved || current.pinch) return;
          current.held = true;
          onTarget(deg);
        }, HOLD_MS);
      }
    } else if (pointers.current.size === 2) {
      cancelHold();
      pinchStart();
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const at = position(event);
    pointers.current.set(event.pointerId, at);
    const current = gesture.current;
    if (!current) return;
    const box = layout(size.width, size.height, tickRows, size.track);
    const startSpan = current.startView.endDeg - current.startView.startDeg;
    if (current.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const span = (startSpan * current.startDistance) / Math.max(8, Math.hypot(a.x - b.x, a.y - b.y));
      const fraction = ((a.x + b.x) / 2 - box.left) / box.plotW;
      setView(clampRange({ startDeg: current.anchorDeg - fraction * span, endDeg: current.anchorDeg + (1 - fraction) * span }, full));
      return;
    }
    if (current.held) {
      // After a hold, dragging moves the target band.
      onTarget?.(degAt(at.x));
      return;
    }
    const dx = at.x - current.startX;
    // Movement in any direction ends a tap or a hold; only the horizontal part pans.
    if (Math.hypot(dx, at.y - current.startY) > TAP_SLOP_PX) {
      current.moved = true;
      cancelHold();
    }
    if (!current.moved) return;
    const shift = (-dx / box.plotW) * startSpan;
    setView(clampRange({ startDeg: current.startView.startDeg + shift, endDeg: current.startView.endDeg + shift }, full));
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const current = gesture.current;
    const at = position(event);
    if (!pointers.current.delete(event.pointerId)) return;
    cancelHold();
    if (pointers.current.size === 0) {
      gesture.current = null;
      if (current && !current.moved && !current.held) onProbe?.(bandAt(at.x, at.y)?.centreDeg ?? degAt(at.x));
    } else if (pointers.current.size === 1) {
      resumeWithOne();
    }
  };

  const onPointerCancel = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    cancelHold();
    if (pointers.current.size === 0) gesture.current = null;
    else if (pointers.current.size === 1) resumeWithOne();
  };

  const onContextMenu = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!onTarget) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    onTarget(degAt(event.clientX - rect.left));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const span = view.endDeg - view.startDeg;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const stepDeg = event.shiftKey ? 0.2 : 0.02;
      const from = probeDeg ?? (view.startDeg + view.endDeg) / 2;
      const next = Math.min(full.endDeg, Math.max(full.startDeg, from + (event.key === 'ArrowLeft' ? -stepDeg : stepDeg)));
      onProbe?.(next);
      if (next < view.startDeg || next > view.endDeg) setView(clampRange({ startDeg: next - span / 2, endDeg: next + span / 2 }, full));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoom(0.6);
    } else if (event.key === '-') {
      event.preventDefault();
      zoom(1 / 0.6);
    } else if (event.key === '0') {
      event.preventDefault();
      setView(full);
    }
  };

  const fullSpan = Math.max(1e-9, full.endDeg - full.startDeg);
  const trackFraction = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
  };
  const onTrackDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    brush.current = { startFraction: trackFraction(event), startX: event.clientX, moved: false };
  };
  const onTrackMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = brush.current;
    if (!current) return;
    if (Math.abs(event.clientX - current.startX) > TAP_SLOP_PX) current.moved = true;
    if (!current.moved) return;
    const a = Math.min(current.startFraction, trackFraction(event));
    const b = Math.max(current.startFraction, trackFraction(event));
    setView(clampRange({ startDeg: full.startDeg + a * fullSpan, endDeg: full.startDeg + b * fullSpan }, full));
  };
  const onTrackUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = brush.current;
    brush.current = null;
    if (!current || current.moved) return;
    const span = view.endDeg - view.startDeg;
    const centre = full.startDeg + trackFraction(event) * fullSpan;
    setView(clampRange({ startDeg: centre - span / 2, endDeg: centre + span / 2 }, full));
  };

  const whole = view.startDeg <= full.startDeg + 1e-6 && view.endDeg >= full.endDeg - 1e-6;
  return <div ref={wrapRef} className="pattern-plot">
    <canvas
      ref={canvasRef}
      tabIndex={0}
      role="img"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      onDoubleClick={() => setView(full)}
      onKeyDown={onKeyDown}
    />
    <div ref={trackRef} className="pattern-track" aria-hidden="true" onPointerDown={onTrackDown} onPointerMove={onTrackMove} onPointerUp={onTrackUp} onPointerCancel={() => { brush.current = null; }} onDoubleClick={() => setView(full)}>
      <i style={{ left: `${(100 * (view.startDeg - full.startDeg)) / fullSpan}%`, width: `${(100 * (view.endDeg - view.startDeg)) / fullSpan}%` }} />
    </div>
    <div className="pattern-zoom" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom out" disabled={whole} onClick={() => zoom(1 / 0.6)}>−</button>
      <button type="button" aria-label="Zoom in" onClick={() => zoom(0.6)}>+</button>
      <button type="button" aria-label="Show full range" disabled={whole} onClick={() => setView(full)}>↔</button>
    </div>
  </div>;
}
