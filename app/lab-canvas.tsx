'use client';

import { useEffect, useRef } from 'react';
import type { Station } from './sim-data';

type HitBox = { id: string; x: number; y: number; w: number; h: number };

export function LabCanvas({ stations, selectedId, phase, onSelect }: { stations: Station[]; selectedId: string; phase: number; onSelect: (id: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<HitBox[]>([]);
  const hoveredIdRef = useRef<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let animation = 0;
    let stopped = false;
    let resizeFrame = 0;
    let width = 0;
    let height = 0;
    let scale = 1;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect() ?? canvas.getBoundingClientRect();
      scale = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.max(1, Math.floor(rect.width));
      const nextHeight = Math.max(1, Math.floor(rect.height));
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(nextWidth * scale);
      canvas.height = Math.round(nextHeight * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };

    const draw = (now: number) => {
      if (stopped) return;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      drawFloor(context, width, height);

      const compact = width < 600;
      const columns = compact ? 2 : 3;
      const rows = compact ? 3 : 2;
      const gapX = compact ? 10 : 16;
      const gapY = compact ? 16 : 24;
      const marginX = compact ? 12 : 20;
      const marginTop = compact ? 28 : 34;
      const marginBottom = 18;
      const podW = (width - marginX * 2 - gapX * (columns - 1)) / columns;
      const podH = (height - marginTop - marginBottom - gapY * (rows - 1)) / rows;
      const hits: HitBox[] = [];

      stations.forEach((station, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = marginX + column * (podW + gapX);
        const y = marginTop + row * (podH + gapY);
        hits.push({ id: station.id, x, y, w: podW, h: podH });
        drawPod(context, station, index, x, y, podW, podH, selectedId === station.id, hoveredIdRef.current === station.id, now);
      });
      hitsRef.current = hits;
      drawMaterialRoute(context, hits, phase, now);
      animation = window.requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(resize);
    });
    observer.observe(canvas.parentElement ?? canvas);
    animation = window.requestAnimationFrame(draw);
    return () => {
      stopped = true;
      observer.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      window.cancelAnimationFrame(animation);
    };
  }, [stations, selectedId, phase]);

  const hitAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return hitsRef.current.find((box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
  };

  return <div className="lab-canvas-wrap">
    <canvas ref={canvasRef} tabIndex={0} aria-label="Interactive rendered map of six materials laboratory stations" onClick={(event) => { const hit = hitAt(event.clientX, event.clientY); if (hit) onSelect(hit.id); }} onPointerMove={(event) => { const hit = hitAt(event.clientX, event.clientY); hoveredIdRef.current = hit?.id ?? null; event.currentTarget.style.cursor = hit ? 'pointer' : 'crosshair'; }} onPointerLeave={(event) => { hoveredIdRef.current = null; event.currentTarget.style.cursor = 'crosshair'; }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(selectedId); }} />
    <div className="canvas-a11y">{stations.map((station) => <button key={station.id} type="button" onClick={() => onSelect(station.id)}>{station.name}: {station.state}</button>)}</div>
  </div>;
}

function drawFloor(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const background = ctx.createRadialGradient(width * .5, height * .3, 10, width * .5, height * .4, width * .7);
  background.addColorStop(0, '#101b2b');
  background.addColorStop(.6, '#080e17');
  background.addColorStop(1, '#060a11');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#17243a';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.fillStyle = '#51637b';
  ctx.font = '600 8px ui-monospace, monospace';
  ctx.fillText('AISLE A · SYNTHESIS', 20, 17);
  ctx.textAlign = 'right';
  ctx.fillText('AISLE B · CHARACTERIZATION', width - 20, 17);
  ctx.textAlign = 'left';
}

function toneColor(tone: Station['tone']) {
  if (tone === 'warn') return '#f4b95f';
  if (tone === 'run') return '#4dd5ed';
  if (tone === 'ready') return '#51e19a';
  if (tone === 'off') return '#657389';
  return '#91a0b3';
}

function drawPod(ctx: CanvasRenderingContext2D, station: Station, index: number, x: number, y: number, w: number, h: number, selected: boolean, hovered: boolean, now: number) {
  const tone = toneColor(station.tone);
  const highlighted = selected || hovered;
  ctx.save();
  ctx.shadowColor = highlighted ? '#4dd5ed55' : '#00000088';
  ctx.shadowBlur = selected ? 22 : hovered ? 18 : 14;
  ctx.shadowOffsetY = 6;
  const panel = ctx.createLinearGradient(x, y, x + w, y + h);
  panel.addColorStop(0, '#142136');
  panel.addColorStop(1, '#0a111c');
  ctx.fillStyle = panel;
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = highlighted ? '#5bb6ca' : station.tone === 'warn' ? '#805d32' : '#294059';
  ctx.lineWidth = selected ? 1.5 : 1;
  roundRect(ctx, x + .5, y + .5, w - 1, h - 1, 3);
  ctx.stroke();
  ctx.strokeStyle = '#1b2c41';
  roundRect(ctx, x + 5.5, y + 5.5, w - 11, h - 11, 2);
  ctx.stroke();

  ctx.fillStyle = '#8090a6';
  ctx.font = '700 8px ui-monospace, monospace';
  ctx.fillText(station.id, x + 10, y + 15);
  const stateW = Math.min(w * .42, ctx.measureText(station.state).width + 12);
  ctx.fillStyle = `${tone}18`;
  ctx.fillRect(x + w - stateW - 8, y + 7, stateW, 13);
  ctx.strokeStyle = `${tone}66`;
  ctx.strokeRect(x + w - stateW - 8.5, y + 6.5, stateW + 1, 14);
  ctx.fillStyle = tone;
  ctx.font = '700 6.5px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(station.state, x + w - stateW / 2 - 8, y + 16);
  ctx.textAlign = 'left';

  const equipmentTop = y + 25;
  const equipmentBottom = y + h - 31;
  const equipmentH = Math.max(46, equipmentBottom - equipmentTop);
  const equipmentX = x + 10;
  const equipmentW = w - 20;
  ctx.fillStyle = '#090f18';
  ctx.fillRect(equipmentX, equipmentTop, equipmentW, equipmentH);
  ctx.strokeStyle = '#223850';
  ctx.strokeRect(equipmentX + .5, equipmentTop + .5, equipmentW - 1, equipmentH - 1);
  drawEquipment(ctx, index, equipmentX, equipmentTop, equipmentW, equipmentH, station, now);

  ctx.fillStyle = '#c1cddd';
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.fillText(station.name, x + 10, y + h - 17);
  ctx.fillStyle = '#65768d';
  ctx.font = '500 6.5px ui-monospace, monospace';
  const meta = station.meta.length > 34 ? `${station.meta.slice(0, 31)}…` : station.meta;
  ctx.fillText(meta, x + 10, y + h - 7);
  ctx.restore();
}

function drawEquipment(ctx: CanvasRenderingContext2D, index: number, x: number, y: number, w: number, h: number, station: Station, now: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const pulse = .55 + Math.sin(now / 420) * .2;
  drawBench(ctx, x, y, w, h);
  if (index === 0) drawPowderPrep(ctx, x, y, w, h);
  if (index === 1) drawRobot(ctx, x, y, w, h, station.tone === 'run' ? now : 0);
  if (index === 2) drawFurnace(ctx, x, y, w, h, pulse);
  if (index === 3) drawXrd(ctx, x, y, w, h, station.tone === 'run' ? pulse : .45);
  if (index === 4) drawSem(ctx, x, y, w, h, pulse);
  if (index === 5) drawBet(ctx, x, y, w, h);
  ctx.restore();
}

function drawBench(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const surface = y + h * .72;
  ctx.fillStyle = '#18273a';
  ctx.fillRect(x + w * .06, surface, w * .88, 5);
  ctx.fillStyle = '#0e1723';
  ctx.fillRect(x + w * .1, surface + 5, w * .8, h * .2);
  ctx.strokeStyle = '#2a4058';
  ctx.strokeRect(x + w * .1 + .5, surface + 5.5, w * .8 - 1, h * .2 - 1);
}

function drawPowderPrep(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const hoodX = x + w * .1;
  const hoodY = y + h * .13;
  const hoodW = w * .56;
  const hoodH = h * .58;
  const body = ctx.createLinearGradient(hoodX, hoodY, hoodX + hoodW, hoodY);
  body.addColorStop(0, '#32465c'); body.addColorStop(.5, '#1b2a3d'); body.addColorStop(1, '#405268');
  ctx.fillStyle = body; ctx.fillRect(hoodX, hoodY, hoodW, hoodH);
  ctx.fillStyle = '#081019'; ctx.fillRect(hoodX + 7, hoodY + 9, hoodW - 14, hoodH * .55);
  ctx.strokeStyle = '#4a6179'; ctx.strokeRect(hoodX + 7.5, hoodY + 9.5, hoodW - 15, hoodH * .55 - 1);
  ctx.fillStyle = '#9fc4d122'; ctx.fillRect(hoodX + 10, hoodY + 12, hoodW - 20, hoodH * .49);
  ctx.fillStyle = '#273c52'; ctx.fillRect(x + w * .72, y + h * .32, w * .18, h * .38);
  ctx.fillStyle = '#142131'; ctx.fillRect(x + w * .735, y + h * .37, w * .15, h * .12);
  ctx.strokeStyle = '#4dd5ed77'; ctx.strokeRect(x + w * .735 + .5, y + h * .37 + .5, w * .15 - 1, h * .12 - 1);
  ctx.fillStyle = '#aebdca'; ctx.beginPath(); ctx.ellipse(x + w * .79, y + h * .28, w * .075, h * .025, 0, 0, Math.PI * 2); ctx.fill();
  ['#d4b66d', '#c87f64', '#8db5c7'].forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(hoodX + 14 + i * 11, hoodY + hoodH * .45, 7, hoodH * .14); });
}

function drawRobot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, now: number) {
  const motion = now ? Math.sin(now / 600) * .16 : 0;
  const baseX = x + w * .45;
  const baseY = y + h * .7;
  const p1 = { x: baseX - w * .08, y: baseY - h * .27 };
  const p2 = { x: baseX + w * (.15 + motion), y: baseY - h * .48 };
  const p3 = { x: baseX + w * (.33 + motion), y: baseY - h * .34 };
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#9aa8b6'; ctx.lineWidth = Math.max(5, w * .045);
  ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.stroke();
  [p1, p2, p3].forEach((point, i) => { ctx.fillStyle = i === 2 ? '#4dd5ed' : '#d6dee6'; ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(4, w * .035), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#33475e'; ctx.lineWidth = 2; ctx.stroke(); });
  ctx.fillStyle = '#263b52'; ctx.beginPath(); ctx.ellipse(baseX, baseY, w * .13, h * .07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0b111a'; ctx.fillRect(x + w * .76, y + h * .18, w * .16, h * .22);
  ctx.strokeStyle = '#3b5269'; ctx.strokeRect(x + w * .76 + .5, y + h * .18 + .5, w * .16 - 1, h * .22 - 1);
  ctx.fillStyle = '#51e19a'; ctx.fillRect(x + w * .78, y + h * .21, w * .08, 2);
}

function drawFurnace(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pulse: number) {
  const fx = x + w * .2, fy = y + h * .1, fw = w * .58, fh = h * .62;
  const cabinet = ctx.createLinearGradient(fx, fy, fx + fw, fy);
  cabinet.addColorStop(0, '#364859'); cabinet.addColorStop(.5, '#1c2937'); cabinet.addColorStop(1, '#51606e');
  ctx.fillStyle = cabinet; ctx.fillRect(fx, fy, fw, fh);
  ctx.fillStyle = '#090c0f'; ctx.fillRect(fx + fw * .14, fy + fh * .15, fw * .72, fh * .5);
  const heat = ctx.createRadialGradient(fx + fw * .5, fy + fh * .4, 1, fx + fw * .5, fy + fh * .4, fw * .35);
  heat.addColorStop(0, `rgba(255,196,92,${pulse})`); heat.addColorStop(.45, '#b94f25aa'); heat.addColorStop(1, '#24110b');
  ctx.fillStyle = heat; ctx.fillRect(fx + fw * .19, fy + fh * .2, fw * .62, fh * .4);
  ctx.strokeStyle = '#75828d'; ctx.strokeRect(fx + fw * .14 + .5, fy + fh * .15 + .5, fw * .72 - 1, fh * .5 - 1);
  ctx.fillStyle = '#101a22'; ctx.fillRect(fx + fw * .18, fy + fh * .72, fw * .42, fh * .13);
  ctx.fillStyle = '#f4b95f'; ctx.fillRect(fx + fw * .21, fy + fh * .76, fw * .18, 2);
  ctx.fillStyle = '#768390'; ctx.fillRect(fx + fw * .9, fy + fh * .2, 3, fh * .35);
}

function drawXrd(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pulse: number) {
  const cx = x + w * .48, cy = y + h * .43, radius = Math.min(w, h) * .24;
  ctx.fillStyle = '#263849'; ctx.beginPath(); ctx.arc(cx, cy, radius * 1.32, Math.PI, 0); ctx.lineTo(cx + radius * 1.32, cy + radius * .9); ctx.lineTo(cx - radius * 1.32, cy + radius * .9); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5a7083'; ctx.lineWidth = Math.max(4, radius * .18); ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI * .08, Math.PI * .92); ctx.stroke();
  ctx.strokeStyle = '#8ca1b2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, radius * .73, Math.PI * .1, Math.PI * .9); ctx.stroke();
  ctx.fillStyle = '#14202c'; ctx.fillRect(cx - radius * .55, cy + radius * .03, radius * 1.1, radius * .2);
  ctx.fillStyle = '#d6dde2'; ctx.fillRect(cx - 2, cy - 2, 4, radius * .4);
  ctx.strokeStyle = `rgba(244,185,95,${pulse})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - radius * .85, cy - radius * .35); ctx.lineTo(cx, cy); ctx.lineTo(cx + radius * .7, cy - radius * .5); ctx.stroke();
  ctx.fillStyle = '#172535'; ctx.fillRect(x + w * .75, y + h * .16, w * .15, h * .32);
  ctx.fillStyle = '#081019'; ctx.fillRect(x + w * .77, y + h * .19, w * .11, h * .19);
  ctx.strokeStyle = '#4dd5ed77'; ctx.beginPath(); ctx.moveTo(x + w * .78, y + h * .32); ctx.lineTo(x + w * .81, y + h * .28); ctx.lineTo(x + w * .84, y + h * .34); ctx.lineTo(x + w * .87, y + h * .24); ctx.stroke();
}

function drawSem(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pulse: number) {
  const cx = x + w * .43;
  ctx.fillStyle = '#9ca9b3'; ctx.fillRect(cx - w * .04, y + h * .09, w * .08, h * .26);
  ctx.fillStyle = '#566775'; ctx.beginPath(); ctx.moveTo(cx - w * .09, y + h * .32); ctx.lineTo(cx + w * .09, y + h * .32); ctx.lineTo(cx + w * .15, y + h * .46); ctx.lineTo(cx - w * .15, y + h * .46); ctx.closePath(); ctx.fill();
  const chamber = ctx.createLinearGradient(cx - w * .22, 0, cx + w * .22, 0);
  chamber.addColorStop(0, '#283948'); chamber.addColorStop(.45, '#84919a'); chamber.addColorStop(1, '#344755');
  ctx.fillStyle = chamber; ctx.beginPath(); ctx.ellipse(cx, y + h * .55, w * .22, h * .17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#aab5bd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, y + h * .55, w * .22, h * .17, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = `rgba(77,213,237,${pulse})`; ctx.fillRect(cx - 1, y + h * .22, 2, h * .28);
  ctx.fillStyle = '#172535'; ctx.fillRect(x + w * .7, y + h * .12, w * .22, h * .3);
  ctx.fillStyle = '#071017'; ctx.fillRect(x + w * .72, y + h * .15, w * .18, h * .21);
  ctx.strokeStyle = '#51e19a88'; ctx.lineWidth = 1; for (let i = 0; i < 9; i++) { const px = x + w * (.74 + (i % 3) * .055); const py = y + h * (.18 + Math.floor(i / 3) * .055); ctx.beginPath(); ctx.arc(px, py, 1 + (i % 2), 0, Math.PI * 2); ctx.stroke(); }
}

function drawBet(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#293b4d'; ctx.fillRect(x + w * .09, y + h * .12, w * .45, h * .58);
  ctx.fillStyle = '#0b131d'; ctx.fillRect(x + w * .14, y + h * .18, w * .35, h * .16);
  ctx.strokeStyle = '#3c5269'; ctx.strokeRect(x + w * .14 + .5, y + h * .18 + .5, w * .35 - 1, h * .16 - 1);
  const ports = [0, 1, 2];
  ports.forEach((port) => { const px = x + w * (.18 + port * .14); ctx.strokeStyle = '#8ea0ae'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, y + h * .39); ctx.lineTo(px, y + h * .57); ctx.stroke(); ctx.fillStyle = '#7a8b98'; ctx.beginPath(); ctx.arc(px, y + h * .59, w * .025, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#4c6578'; ctx.beginPath(); ctx.ellipse(x + w * .72, y + h * .57, w * .13, h * .16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0a131b'; ctx.beginPath(); ctx.ellipse(x + w * .72, y + h * .5, w * .1, h * .06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8095a5'; ctx.beginPath(); ctx.moveTo(x + w * .52, y + h * .26); ctx.quadraticCurveTo(x + w * .72, y + h * .18, x + w * .72, y + h * .5); ctx.stroke();
  ctx.fillStyle = '#5d7180'; ctx.fillRect(x + w * .84, y + h * .24, w * .06, h * .44);
  ctx.fillStyle = '#657b8a'; ctx.beginPath(); ctx.arc(x + w * .87, y + h * .24, w * .03, Math.PI, 0); ctx.fill();
}

function drawMaterialRoute(ctx: CanvasRenderingContext2D, hits: HitBox[], phase: number, now: number) {
  if (hits.length < 6) return;
  const points = [hits[0], hits[1], hits[2], hits[3]].map((box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 }));
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#35516d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
  const routePhase = Math.min(3, Math.max(0, phase));
  const from = points[Math.max(0, routePhase - 1)];
  const to = points[routePhase];
  const movement = phase === 3 ? .5 + Math.sin(now / 800) * .45 : 1;
  const cx = from.x + (to.x - from.x) * movement;
  const cy = from.y + (to.y - from.y) * movement;
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.shadowColor = '#4dd5ed99'; ctx.shadowBlur = phase === 3 ? 18 : 10;
  ctx.fillStyle = '#10283a'; ctx.strokeStyle = '#4dd5ed'; ctx.lineWidth = 1;
  ctx.fillRect(-13, -13, 26, 26); ctx.strokeRect(-13.5, -13.5, 27, 27);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#76dcef'; ctx.textAlign = 'center'; ctx.font = '700 6px ui-monospace, monospace'; ctx.fillText('BC-184', 0, 2);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
