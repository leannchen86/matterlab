# MatterLab

MatterLab is an interactive virtual materials laboratory for practicing experimental judgment, equipment checks, and evidence-aware decision making.

**[Launch MatterLab](https://leannchen86.github.io/matterlab/)**

The simulation places the player inside a high-throughput laboratory where restoring equipment is only part of the job. Measurements must also remain linked to physical inspections, sample identity, process history, reference controls, and the decisions that make a result usable or deliberately exclude it.

## What you can do

- Explore a browser-rendered 3D laboratory containing powder preparation, robotics, furnace, XRD, SEM/EDS, BET, and TGA equipment.
- Select or click equipment to focus the camera; press `Esc` to return to the overview.
- Enter a technician-scale aisle view with keyboard or on-screen movement controls.
- Replay the original 24-second cinematic camera tour through the facility.
- Inspect three physical points on each machine before entering its local controls.
- Complete equipment-specific HMI sequences without erasing independent quality holds.
- Follow sample custody and reference checks at each machine's inspection points and console readouts.

All equipment geometry, plots, and material routes are generated in the application; the simulation does not depend on external image assets during play.

## XRD bench

The XRD bench opens from OPEN XRD LAB. One 480-minute shift covers seven CaTiO₃ batches. For each sample the player can:

- **Read the record:** objective, recorded facts, and notebook cues.
- **Mount and prepare:** choose the powder portion, grinding, loading, an internal-standard spike, and spinning. Mounting spends shift time, and powder is limited.
- **Scan:** pick a program that trades shift time for range, step, and counts.
- **Probe:** list reference lines near a chosen angle.
- **Explain:** fit one set of reference phases in slot A and another in slot B over the same run, then compare them. Selecting a phase reads how its lines fared: how many were seen, how many sit under another phase, and how many are missing. A phase the fit did not need reads what amount of it this scan could have shown instead, which is never a claim that the powder is without it. Where a sample aims at a solid solution, the host also reads the Zr its spacing implies, once the goniometer zero is checked or a required spike has at least two detected unique lines and none missing. This is a rough reading from the simulated lattice expansion; Zr-dependent intensities are not modelled.
- **Check limits:** read what a fit cannot settle, and send TGA or SEM/EDS follow-ups, which use time, powder, and shared instrument slots.
- **Call:** commit the phases, what stays unexplained, and a batch decision.
- **Debrief:** read the hidden truth and how the call held up.

A first-time player meets a short card before the bench. Each kind of crystal scatters X-rays into its own barcode of peaks, a fit tests which barcodes explain a pattern, and peaks that nothing explains are clues. Underlined words explain themselves on tap. Until the first call of a shift, one line under the bench names the next step, read only from what is on screen. It points at an action, never at an answer. `?` in the top bar reopens the card. Its smooth peaks are labelled as a schematic. Reference preview heights retain relative intensities within a phase; barcode ticks show positions only.

Costs show as colours, not minutes, because the web bench runs instantly and simulated minutes only confused. A dot on each costed control marks it quick, longer or longest, and a key under the scan programs names the colours. Hovering or focusing a control previews its share on the shift bar along the top, in the same colour. The jar bar previews powder the same way.

The core in `app/xrd/` runs one way: hidden state → measurement → observables → analysis → decision.

- **Hidden state:** each batch has a synthesis history that sets its phases, amounts, crystallite and grain sizes, and lattice. The bench shows it only in the debrief, after a call.
- **Measurement:** the mount and program turn that state into Poisson counts that name no phase.
- **Observables:** a run keeps the counts and recorded settings and never changes.
- **Analysis:** a fit reads only the counts, recorded mount facts, and the phases the player chose.
- **Decision:** a call rests on one explanation, and the debrief judges it against the hidden truth.

A shift is a seed plus a list of actions. Every random draw comes from a seeded generator split into named streams, so the same seed and actions replay the same shift, counts included. Failed actions change nothing. Fitting other references adds explanations and never alters a run. The bench keeps the seed and actions in browser storage and replays them on reload. A physics-engine version change starts a fresh shift and backs up the previous action log locally. When too little time remains for another scan, NEW SHIFT in the top bar offers a restart with confirmation, even if some samples have no call yet.

There is no single score. The debrief opens with one plain sentence on what the powder was and whether the call met the aim, then grades measurement, support, identity, and decision as good, mixed, or poor, shows true phases as major, minor, or trace, and lists the batch decisions that would have met the objective, cheapest first. Neither the sentence nor the bands carry a percentage.

## Run locally

Requirements:

- Node.js 22.18 or newer
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

`pnpm check` runs TypeScript, ESLint, and the node tests. `pnpm build:pages` creates the static GitHub Pages build in `pages-dist/`.

For the Vinext/Cloudflare build used by the local hosting configuration:

```bash
pnpm build
```

The frozen visual judgeset is defined in `materials_lab_threejs/cameras.json`. Local review renders can be opened deterministically with `?camera=C01` through `?camera=C16`; review mode hides play UI and locks the camera.

## Project structure

```text
app/
  lab-3d.tsx                 Three.js facility and equipment models
  lab-viewport.tsx           3D loading and viewport controls
  page.tsx                   XRD lab page and application entry
  station-access.tsx         local equipment-control simulations
  xrd-workbench.tsx          XRD bench interface
  xrd-plot.tsx               pattern canvas with fit, residual, and probe
  xrd-bench/
    copy.ts                  bench strings
    gloss.ts                 newcomer meanings, intro and goal lines
    guide.tsx                intro card, tap-to-explain words, guide line
    session.ts               seeded shift store, replay, background fits
    view.ts                  run tags, fit readouts, goal step, debrief sentence
  xrd/
    synthesis.ts             synthesis history to phases
    measure.ts               mount physics and Poisson counts
    analysis.ts              phase fit, residual features, comparisons
    analysis-client.ts       worker client with main-thread fallback
    lab.ts                   shift actions, costs, limits, debrief
    records.ts               immutable runs and interpretations
    probe.ts                 reference lines near an angle
    context.ts               element evidence and library search
    followups.ts             TGA and SEM/EDS results
    cases.ts                 sample records and hidden histories
    references.generated.ts  reference reflections (generated)
data/
  crystal-structures/        COD CIFs and one computed structure
scripts/
  build-references.ts        pnpm references: CIFs to references.generated.ts
github-pages/                static browser entry
public/                      favicon and social preview
```

## Deployment

Pushes to `main` run the GitHub Actions workflow in `.github/workflows/pages.yml`. The workflow:

1. Installs the pinned pnpm version on Node.js 22.
2. Runs `pnpm check`.
3. Builds the static site with `pnpm build:pages`.
4. Publishes `pages-dist/` to GitHub Pages.

## Simulation boundary

MatterLab is an educational simulation, not an equipment operating procedure. It intentionally avoids actionable instructions for hazardous laboratory processes. Actual operation requires site-specific SOPs, training, interlocks, and manufacturer documentation.

Scientific and operational references are documented in [RESEARCH.md](RESEARCH.md). Major design iterations are recorded in [ITERATION_LOG.md](ITERATION_LOG.md).
