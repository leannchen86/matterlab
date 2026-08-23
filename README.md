# MatterShift

MatterShift is a browser simulation of a lab technician's shift inside an AI-enabled,
high-throughput materials laboratory. The primary experience is an equipment-first operations
console with three playable work orders. The shifts cover XRD quality control and SEM/EDS follow-up,
BET service acceptance and pretreatment lineage, and robot–furnace recovery after an interrupted
thermal run. Each path ends at a scientific or AI data gate rather than at equipment uptime alone.

The interface is intentionally modeled after a real technician environment rather than a generic
materials-science lesson. Its default facility view is an orbitable Three.js digital twin with
procedurally modeled XRD, SEM/EDS, BET, furnace, powder-prep, and robotic-workcell equipment. It also
includes work orders, handoff state, instrument readiness, QC controls, sample custody, automation
gates, alarms, shift health, and a chronological event record.

## Playable shifts

- **Phase-purity recovery:** return XRD to control, reconcile a carrier, review an unexpected peak,
  and build a representative SEM/EDS follow-up before the AI planner changes the next synthesis.
- **BET recommissioning:** accept a gas-sorption analyzer after service, bind the correct pretreatment
  record, and distinguish a low control result from a material trend.
- **Interrupted thermal run:** preserve the thermal trace, reconcile robot and furnace occupancy,
  verify empty-cell recovery, and censor a compromised run without deleting it.

Selecting an asset exposes a simulated local workstation with four technician-facing boundaries:
HMI/SCADA state and permissives, LES method execution, LIMS identity and lineage, and CMMS service
evidence. Each station has its own instrument mimic, interlocks, method, sample identifiers,
maintenance state, and point-of-use supplies.

The 3D view also supports a technician-scale focus camera and physical walkaround. Each asset exposes
three inspection points—such as an XRD shutter/holder/HMI, BET ports/vacuum/N₂, or furnace
interlock/controller/chamber. Those checks are written to the event ledger and become an explicit
HMI permissive; safe-state attestation stays disabled until physical and digital state are linked.

The shift deck, 3D facility, 2D fallback map, and station consoles are responsive down to a
phone-sized viewport. All instrument geometry, traces, micrographs, spectra, and equipment routes
are drawn in the app without external image assets.

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
See [ITERATION_LOG.md](ITERATION_LOG.md) for the product critique and major refinement passes.
