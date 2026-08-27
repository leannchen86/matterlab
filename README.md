# MatterLab

MatterLab is an interactive virtual materials laboratory for practicing experimental judgment, equipment checks, and evidence-aware decision making.

**[Launch MatterLab](https://leannchen86.github.io/matterlab-sim/)**

The simulation places the player inside a high-throughput laboratory where restoring equipment is only part of the job. Measurements must also remain linked to physical inspections, sample identity, process history, reference controls, and the decisions that make a result usable—or deliberately exclude it.

## Scenarios

MatterLab includes five playable cases:

- **Unexpected XRD peak** — restore XRD control, reconcile sample identity, and decide whether SEM/EDS follow-up is justified.
- **BET recommissioning** — accept an analyzer after service, verify pretreatment lineage, and investigate a low control result.
- **Interrupted furnace run** — preserve the thermal trace, reconcile robot and furnace occupancy, and recover the workcell safely.
- **Failed TGA empty-pan check** — correct the pan setup, run a governed blank, and separate purge behavior from a material signal.
- **Gas-service changeover** — move material with traceability, prove the new gas boundary, and quarantine results collected before verification.

An optional expert sandbox extends the XRD case into a multi-run materials campaign with candidate selection, constrained equipment capacity, retained results, and microscopy-informed follow-up.

## What you can do

- Explore a browser-rendered 3D laboratory containing powder preparation, robotics, furnace, XRD, SEM/EDS, BET, and TGA equipment.
- Select or click equipment to focus the camera; press `Esc` to return to the overview.
- Enter a technician-scale aisle view with keyboard or on-screen movement controls.
- Inspect three physical points on each machine before entering its local controls.
- Complete equipment-specific HMI sequences without erasing independent quality or service holds.
- Follow sample custody, maintenance evidence, alarms, reference checks, and process history.
- Review a chronological evidence log that retains actions, exceptions, and final decisions.

All equipment geometry, plots, spectra, micrographs, and material routes are generated in the application; the simulation does not depend on external image assets during play.

## Run locally

Requirements:

- Node.js 22.13 or newer
- pnpm 11.19

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify changes

```bash
pnpm check
pnpm build:pages
```

`pnpm check` runs TypeScript and ESLint. `pnpm build:pages` creates the static GitHub Pages build in `pages-dist/`.

For the Vinext/Cloudflare build used by the local hosting configuration:

```bash
pnpm build
```

## Project structure

```text
app/
  campaign-control.tsx   expert campaign sandbox
  campaign-context.ts    normalized campaign state
  campaign-spec.ts       campaign recipes and evaluation rules
  lab-3d.tsx             Three.js facility and equipment models
  lab-viewport.tsx       3D loading and viewport controls
  page.tsx               XRD scenario and application entry
  scenario-shifts.tsx    scenario deck, BET, and furnace cases
  station-access.tsx     local equipment-control simulations
  tga-shift.tsx          thermal-analysis case
  facility-shift.tsx     material-move and gas-change case
github-pages/            static browser entry
public/                  favicon and social preview
```

The application keeps scenario logic in React state. The expert campaign is persisted in browser storage and exposed to the lab through one normalized campaign snapshot.

## Deployment

Pushes to `main` run the GitHub Actions workflow in `.github/workflows/pages.yml`. The workflow:

1. Installs the pinned pnpm version on Node.js 22.
2. Runs `pnpm check`.
3. Builds the static site with `pnpm build:pages`.
4. Publishes `pages-dist/` to GitHub Pages.

## Simulation boundary

MatterLab is an educational simulation, not an equipment operating procedure. It intentionally avoids actionable instructions for hazardous laboratory processes. Actual operation requires site-specific SOPs, training, interlocks, and manufacturer documentation.

Scientific and operational references are documented in [RESEARCH.md](RESEARCH.md). Major design iterations are recorded in [ITERATION_LOG.md](ITERATION_LOG.md).
