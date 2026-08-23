# MatterShift

MatterShift is a browser simulation of a lab technician's shift inside an AI-enabled,
high-throughput materials laboratory. The primary experience is an equipment-first operations
console with four playable work orders. The shifts cover XRD quality control and SEM/EDS follow-up,
BET service acceptance and pretreatment lineage, robot–furnace recovery after an interrupted
thermal run, and TGA/DSC measurement-control recovery. Each path ends at a scientific or AI data
gate rather than at equipment uptime alone.

The interface is intentionally modeled after a real technician environment rather than a generic
materials-science lesson. Its default facility view is an orbitable Three.js digital twin with
procedurally modeled XRD, SEM/EDS, BET, TGA/DSC, furnace, powder-prep, and robotic-workcell equipment. It also
includes work orders, handoff state, instrument readiness, QC controls, sample custody, automation
gates, alarms, shift health, and a chronological event record.

The characterization assets are assembled from instrument-scale subsystems rather than single
silhouettes: goniometer and sample-stage hardware in XRD; column lenses, vacuum chamber, detector
ports, and pumping hardware in SEM/EDS; valved manifolds, analysis tubes, dewars, gauges, and gas
regulation in BET; and a balance head, furnace, covered autosampler, paired pans, and purge control in
TGA/DSC. These parts correspond to the boundaries a technician inspects, services, or records.

## Playable shifts

- **Phase-purity recovery:** return XRD to control, reconcile a carrier, review an unexpected peak,
  and build a representative SEM/EDS follow-up before the AI planner changes the next synthesis.
- **BET recommissioning:** accept a gas-sorption analyzer after service, bind the correct pretreatment
  record, and distinguish a low control result from a material trend.
- **Interrupted thermal run:** preserve the thermal trace, reconcile robot and furnace occupancy,
  verify empty-cell recovery, and censor a compromised run without deleting it.
- **Thermal-analysis release:** retain a failed empty-pan baseline, reconcile a mixed physical pan
  pair, run a governed blank, and stop a purge-coupled event from steering the AI planner.

Selecting an asset exposes a simulated local workstation with four technician-facing boundaries:
HMI/SCADA state and permissives, LES method execution, LIMS identity and lineage, and CMMS service
evidence. Each station has its own instrument mimic, interlocks, method, sample identifiers,
maintenance state, and point-of-use supplies.
The HMI also requires an instrument-specific local control sequence after the physical walkaround:
for example, XRD stage/shutter/reference checks, SEM vacuum/clearance/detector checks, BET
manifold/leak/gas checks, or TGA/DSC balance/purge/carousel checks. A successful safe-state
attestation does not clear an independent quality or service hold.
The Field Guide adds a visual authority map across physical equipment, supervisory controls,
governed records, and the proposal-only AI planner.

The 3D view also supports a technician-scale focus camera and physical walkaround. Each asset exposes
three inspection points—such as an XRD shutter/holder/HMI, BET ports/vacuum/N₂, or furnace
interlock/controller/chamber. Those checks are written to the event ledger and become an explicit
HMI permissive; safe-state attestation stays disabled until physical and digital state are linked.
An immersive equipment-first mode expands the procedural bay over the full viewport while retaining
station selection, overview/focus cameras, physical inspection points, and an explicit return to the
shift console. It is designed to make the facility itself—not the surrounding text—the primary
interface on both desktop and mobile.
Its human-scale aisle mode moves the camera to technician eye height, supports WASD/arrow-key and
touch-pad movement, and glides between selected stations along operating approaches. From the aisle,
the selected instrument opens directly into its local HMI/SCADA, LES, LIMS, and CMMS console; physical
walkaround evidence remains a real permissive in that workstation.
Movement respects installed equipment footprints and slides along their edges, preventing the
first-person camera from passing through instrument cabinets while preserving usable aisles.
Workstation sessions can return to the same asset and aisle mode. Completed walkaround markers and
console attestations survive the round trip, so the scientist can alternate between the sample,
instrument, controls, and records without losing operational context.
Every point captures a concise local observation and distinguishes normal evidence from an attention
state; completing a walkaround does not erase a separate quality, service, or process hold.
The shared bay includes overhead cable routing, gas/vacuum service panels, emergency controls,
mobile handling equipment, point-of-work tools, and a compact keyboard-accessible station selector
so the instruments read as one operational facility rather than isolated product models.
Characterization systems sit on subdued installation or anti-vibration slabs with leveling points
and thin digital-twin perimeters; the selection treatment is intentionally an overlay, not a glowing
physical platform.
Scenario routes move distinct physical carriers rather than a generic token: a six-position XRD
tray, a four-tube gas-sorption rack, a refractory setter with crucibles, or a paired-pan carrier for
thermal analysis. Loading zones sit in front of each instrument, and the procedural robot includes
articulated servo housings, a wrist flange, gripper tooling, and dressed cabling.

The AI experiment loop is visual rather than conversational: each shift plots retained measurements,
an uncertainty field, and a proposed next experiment in a small scenario-specific design space. A
technician evidence gate can visibly hold that proposal when measurement context, reference control,
or thermal history is not yet trustworthy.

Each completed shift ends with a visual performance profile and a scenario-specific evidence trail,
making the path from physical work through governed records to an AI-eligible—or deliberately
censored—outcome clear enough to compare on replay. Blocked mistakes remain visible as recovered
exceptions and stay linked to the chronological event ledger even after the final evidence chain is
complete.

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
