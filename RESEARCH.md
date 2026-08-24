# Scientific and operational research

Research reviewed on 2026-08-23. MatterShift is designed as a fictional, game-like laboratory—not
as a depiction of any company or role. Its operating logic is grounded in characterization science,
industrial-control boundaries, published autonomous-lab systems, and public spatial-computing work.

## What the information-system acronyms mean at the workstation

- **LIMS** organizes sample identity, inventory, requested tests, results, and review status.
- **LES** presents controlled method steps, required entries, checks, and attestations at the bench.
- **MES** coordinates resources, work execution, material status, and operational genealogy across
  a facility.
- **SCADA** supervises equipment/process state, alarms, trends, and operator interaction; local
  controllers and safety systems still own fast control and interlocks.

These boundaries are simplified in the game, but the layering follows the
[ISA-95 enterprise/control model](https://www.isa.org/standards-and-publications/isa-standards/isa-95-standard).

## Characterization represented in the app

- **XRD:** a diffraction pattern supports crystal-phase identification and quantitative fits. The
  game emphasizes sample preparation, position-reference QC, control limits, fit quality, and an
  unassigned reflection. NIST maintains [powder-diffraction reference materials](https://www.nist.gov/mml/mmsd/standards-and-tools/reference-materials)
  for line position, line shape, intensity, and other instrument-performance checks.
- **SEM/EDS:** SEM forms surface-sensitive electron images; EDS adds local elemental information.
  The playable follow-up emphasizes that one bright feature and one local spectrum do not establish
  bulk representativeness; the technician expands field coverage and retains acquisition context.
  See the [Thermo Fisher SEM/EDS overview](https://www.thermofisher.com/in/en/home/materials-science/elemental-analysis/technology.html).
- **TGA/DSC:** TGA follows mass change while DSC follows heat-flow response under a defined thermal
  program and atmosphere. See [TA Instruments' theory materials](https://www.tainstruments.com/theory-applications-training-documents/).
- **BET:** specific surface area is estimated from a gas-adsorption isotherm; preparation/degassing,
  leak state, adsorbate, equilibrium, and fit selection are all relevant. See the
  [Micromeritics BET overview](https://micromeritics.com/bet-surface-area-analyzers/).

## Autonomous-lab reality represented in the game

The published [A-Lab autonomous inorganic-synthesis platform](https://www.nature.com/articles/s41586-023-06734-w)
integrated powder preparation, furnaces, XRD, robot transfers, software job submission, automated
analysis, and follow-up experiment planning. Its description also makes an important operational
point: automated stations still need manual consumable loading, holder cleaning, exception handling,
and replenishment. MatterShift places the technician in that gap between a compelling autonomous
demo and dependable daily operation.

## Design decisions

- The default screen is equipment-first and glanceable; deeper system context stays in operating
  surfaces and the Systems Atlas.
- The scenarios combine QC, service acceptance, sample preparation and identity, automation
  readiness, alarm recovery, maintenance evidence, characterization review, and scientific decisions.
- AI appears downstream of lab work. It can propose the next experiment, but it depends on the
  technician and scientist review process to receive trustworthy, contextualized results.
- The simulation uses fictional identifiers and simplified values. It is not affiliated with or an
  internal representation of any laboratory or instrument manufacturer.

## Spatial interaction references

The visual iteration studied [Dilum Sanjaya's public work](https://github.com/dilums), especially the
[hexapod robot simulator](https://github.com/dilums/hexapod-robot-simulator) and his
[AI SDK + Three.js starter](https://github.com/dilums/aisdk-threejs-starter). The transferable design
principle was scene-first composition: the spatial machine remains dominant, live controls stay
compact, and motion explains state. MatterShift applies that principle to a laboratory layout while
using original equipment geometry, interaction design, and visual styling.

The digital twin uses React Three Fiber, Drei, and Three.js. The scene graph makes each instrument a
real hierarchical object rather than a background illustration, which supports articulated robot
joints, status-dependent materials, equipment picking, physical inspection hotspots, shadows, and
scenario-specific carrier motion. Three.js's own
[fundamentals guide](https://threejs.org/manual/en/fundamentals.html) informed the camera, scene,
lighting, mesh, and material structure.
