# Role and environment research

Research reviewed on 2026-08-23. The simulator is anchored in the job descriptions and equipment
workflows below; it does not adopt the surrounding repository's existing research claims as a
product premise.

## What the Periodic Labs roles imply

The [Laboratory Technician](https://jobs.ashbyhq.com/periodic-labs/50a878d1-f9a6-4234-950d-f18d73c65c47)
role is not simply an instrument-operator position. It combines five operating responsibilities:

1. **Measurement control.** Run calibrations and verifications, execute QC, detect drift, record it,
   and decide when to escalate or hold work.
2. **Physical material flow.** Weigh, label, package, batch, inventory, and move specimens without
   breaking identity or cleanliness requirements.
3. **Standard work.** Execute and improve SOPs, train other technicians, validate new labware and
   methods, and document anomalies clearly.
4. **Equipment availability.** Troubleshoot instrument and process exceptions, coordinate with
   scientists and engineers, and keep shared spaces stocked and functional.
5. **Continuous improvement.** Notice manual bottlenecks and help turn reliable bench procedures
   into automation-ready workflows.

The preferred experience describes the physical setting: robotic workcells, pilot-plant or
high-throughput cadence, cleanroom/semiconductor/battery/analytical-chemistry practices, powered
material-handling tools, and characterization methods including XRD, SEM/EDS, TGA/DSC, BET, and
metrology. This is closer to a small scientific production facility than a quiet academic bench.

The [Research Engineer, Lab Automation](https://jobs.ashbyhq.com/periodic-labs/a16ee7dd-021d-4f37-823d-7a8b520c6d8a)
role provides the other side of the technician's environment: scientists define what they need to
learn; research engineers turn that intent into instrument sequences, hardware requirements, and
automation specifications. The technician supplies operational reality—what can be prepared,
verified, recovered, and repeated reliably.

The [Automation Engineer](https://jobs.ashbyhq.com/periodic-labs/5e692aeb-234b-4112-b318-7ff464977303/)
role makes the software boundary concrete: instrument drivers, robot integrations, information
systems, data models, and safe orchestration must stay synchronized. The technician therefore sees
work queues, states, handshakes, exceptions, and records even when they do not write the integration
code.

The adjacent [Laboratory Operations & Maintenance Technician](https://jobs.ashbyhq.com/periodic-labs/b1ad8632-f489-4922-8805-42d84711cda1/)
role adds the facility layer: preventive maintenance, gas/vacuum/fluid utilities, sensors and
interlocks, commissioning, asset history, spares, and equipment moves. The lab-floor visualization
includes these cues so instruments do not appear as isolated black boxes.

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
  The visual station includes the electron column, vacuum chamber, and elemental-display monitor.
  See the [Thermo Fisher SEM/EDS overview](https://www.thermofisher.com/in/en/home/materials-science/elemental-analysis/technology.html).
- **TGA/DSC:** TGA follows mass change while DSC follows heat-flow response under a defined thermal
  program and atmosphere. The field guide routes to [TA Instruments' theory materials](https://www.tainstruments.com/theory-applications-training-documents/).
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

- The default screen is equipment-first and glanceable; detailed teaching stays in workflow dialogs
  and the field guide.
- The first scenario is a shift, not a recipe builder. It exercises the responsibilities most
  visible across the postings: QC, material identity, automation readiness, exception handling, and
  communication.
- AI appears downstream of lab work. It can propose the next experiment, but it depends on the
  technician and scientist review process to receive trustworthy, contextualized results.
- The simulation uses fictional identifiers and simplified values. It is not affiliated with or an
  internal representation of Periodic Labs.
