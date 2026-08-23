# MatterShift

MatterShift is a browser simulation of a lab technician's shift inside an AI-enabled,
high-throughput materials laboratory. The primary experience is an equipment-first operations
console: inspect the lab floor, recover an XRD quality-control excursion, reconcile a sample-label
mismatch, release a robotic workcell, and review an unexpected characterization result before it is
used to plan another experiment.

The interface is intentionally modeled after a real technician environment rather than a generic
materials-science lesson. It includes work orders, handoff state, instrument readiness, QC controls,
sample custody, automation gates, alarms, shift health, and a chronological event record.

## Run locally

This project requires Node.js 22.13 or newer.

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000/>.

## Verify

```bash
pnpm build
pnpm lint
```

## Simulation boundary

MatterShift is conceptual training, not an equipment operating procedure. It deliberately avoids
actionable parameters for hazardous processes. Values and events are plausible enough to teach
workflow reasoning, but actual instrument operation belongs to site-specific SOPs, training,
interlocks, and manufacturer documentation.

See [RESEARCH.md](RESEARCH.md) for the role analysis and scientific sources used to shape the app.
