# MatterShift iteration log

This log captures product critiques that changed the simulator. It is intentionally about the
technician experience, not the host repository's pre-existing research hypotheses.

## Baseline release

The first release established the visual language and one complete XRD shift: an equipment-first
control room, six rendered stations, QC drift, sample-label reconciliation, robot release, an XRD
pattern, an AI proposal, scoring, and an event ledger. Desktop, tablet, and mobile layouts were
verified in the in-app browser.

## Critique 1: one instrument was real; five were scenery

The baseline looked like a laboratory but behaved like an XRD lesson. The BET station was offline
decoration, the furnace and robot had no failure recovery, replay had little breadth, and the AI loop
was only visible at the last decision.

### Changes

- Added a visual shift deck with three independent work orders.
- Added a BET recommissioning shift spanning CMMS evidence, independent lab acceptance, vacuum/blank
  visualization, sample pretreatment lineage, an adsorption isotherm, and an AI synthesis proposal.
- Added a furnace/robot recovery shift spanning controller alarms, interrupted thermal history,
  physical-versus-digital occupancy, empty-cell verification, and AI training-data eligibility.
- Added plausible wrong choices that lower the relevant safety, traceability, or integrity score but
  do not let the simulation silently proceed.

## Critique 2: shared animation told the wrong story

The alternate shifts initially reused the XRD carrier animation. That made the state model visually
false even though the workflow text was correct.

### Changes

- BET now has its own ADS-77 sample route from preparation to gas sorption.
- Furnace recovery shows the initial disagreement between robot state and physical BC-207 location,
  then changes to a held/censored state after reconciliation.
- The active BET analysis ports pulse, while instrument-state colors remain distinct from sample
  eligibility.

## Critique 3: “AI for materials” needed a visible operating loop

An AI proposal at the end of a modal did not show how laboratory evidence enters or blocks an
experiment cycle.

### Changes

- Added a compact PLAN → EXECUTE → MEASURE → LEARN rail to every shift.
- Shows the model request, the technician-owned evidence gate, and the next trusted action.
- Keeps AI downstream of lab truth: proposals can be held, runs can be censored while retained, and
  local characterization can trigger more evidence instead of an automatic recipe change.

## Critique 4: the SEM/EDS handoff ended as paperwork

The XRD shift assigned SEM/EDS follow-up and immediately ended. That missed both a visually rich
instrument and a core expert judgment: local evidence is not automatically bulk evidence.

### Changes

- Extended the XRD shift to a seventh task.
- Added an animated simulated backscattered-electron field, bright-inclusion ROI, local EDS spectrum,
  field-coverage strip, and scale bar.
- Added a representativeness decision: acquire multiple fields and an elemental map, or incorrectly
  report the first high-contrast feature as the bulk explanation.

## Critique 5: a polished flat map still did not feel like a lab

The rendered 2D equipment cards were attractive and responsive, but they described instruments as
panels. They did not communicate physical scale, aisle relationships, safety boundaries, robot
reach, or the feeling of moving through a high-throughput bay.

### Changes

- Replaced the default facility view with an orbitable React Three Fiber digital twin while keeping
  the proven Canvas2D view as a low-cost fallback.
- Procedurally modeled six distinct assets: ventilated powder prep and balance, safety-fenced
  articulated robot, glowing box furnace, enclosed XRD goniometer, SEM column/chamber/workstation,
  and BET manifold, sample tubes, and gas supply.
- Added PBR-style metals and glass, generated environment reflections, laboratory lighting, contact
  shadows, epoxy floor/grid, aisle and keep-clear markings, a mobile sample cart, and a pallet jack.
- Added scenario-colored physical carrier routes, an animated robot arm, selected-equipment status
  labels, and physical inspection points such as shutters, interlocks, holders, ports, and local
  HMIs.
- Reframed the camera twice after browser critique: the initial dramatic view cropped critical
  equipment; the final establishing shot keeps all six stations visible and reserves the closer view
  for user-controlled orbit and zoom.

## Critique 6: selecting an instrument only changed a summary card

A technician does not experience an asset only through facility status. They cross boundaries
between local controls, controlled work instructions, specimen records, and maintenance evidence.

### Changes

- Added a station-specific local console for all six assets.
- The HMI/SCADA tab shows a large animated-style asset mimic, live values, start permissives, safety
  or quality holds, and a safe-state attestation.
- The LES tab shows ordered method execution, controlled revision, training state, and an operator
  attestation that cannot bypass physical verification.
- The LIMS tab visualizes source → specimen/run → native dataset identity with barcode-like records
  and required contextual links.
- The CMMS tab separates vendor/service closure from laboratory return-to-use, adds asset health,
  maintenance history, and point-of-use spares.
- Corrected an early state-model bug found in visual regression: an offline BET asset was initially
  given a green status lamp and a released service permissive.
- Collapsed the workstation into four compact tabs on mobile and hid non-selected floating labels so
  the 3D equipment remains the dominant visual.

## Critique 7: overview selection skipped the physical walkaround

The digital twin allowed orbit and selection, but selecting an instrument still jumped from a wide
facility view to a software inspector. That did not represent the technician's physical-to-digital
sequence: approach the asset, inspect its local state, then compare it with the controller and
records.

### Changes

- Added smooth overview and focus camera modes. Focus moves to technician scale, then returns orbit
  control to the player instead of continually forcing a canned camera.
- Added three physical inspection markers to every asset and a compact walkaround checklist. Markers
  change state in the 3D scene and persist while the shift remains active.
- Isolated the selected asset in focus mode after the first robot close-up revealed that a front-row
  BET cabinet blocked the robot. The bay remains spatial in overview; focus prioritizes equipment
  legibility while retaining floor, lighting, walls, and the asset's own safety enclosure.
- Reframed the robot gripper and reduced safety-cage rail opacity in focus mode after a second visual
  review.
- Linked completed walkarounds to a timestamped ledger event and the local HMI. The HMI now shows a
  physical-evidence permissive and blocks safe-state attestation at 0/3, while quality and service
  holds remain independent after the walkaround reaches 3/3.
- Reset local-console state by asset so an attestation completed on one instrument cannot carry into
  the next selection.
- Verified XRD, BET, robot, and furnace close-ups on desktop, plus a 390 × 844 BET focus view with the
  walkaround panel visible above facility status.

## Critique 8: the instruments still read as isolated product models

The first 3D pass established scale and station identity, but close review showed too little of the
infrastructure and point-of-work detail that makes a laboratory feel operational. Selecting a small
or partly occluded mesh was also less discoverable than the rest of the interface.

### Changes

- Added an overhead cable tray, routed services, color-coded gas/vacuum manifolds, local utilities,
  an emergency stop, and a fire extinguisher to connect the stations into one facility.
- Added close-up powder-prep details: hood task light, extraction duct, balance pan, sample boat,
  powder charge, and spatula.
- Added an SEM/EDS detector, support cable, vacuum equipment, and a more legible detector-to-chamber
  relationship; scaled the detector back after its first close-up blocked the chamber.
- Added a compact, keyboard-accessible station picker with state-colored indicators so every asset
  has an explicit inspection entry point in addition to direct geometry picking.
- Rejected an initial approach that made the floating 3D labels themselves clickable. Mixing the
  HTML labels into pointer stacking made all but one disappear in the rendered scene, so the labels
  remain visual annotations and selection lives in a stable scene-level control.

## Critique 9: the AI loop was named but not visible

The right rail showed PLAN → EXECUTE → MEASURE → LEARN and a textual model request, but it did not
make an AI-guided materials campaign visually legible. The model could still feel like a chatbot
issuing a recipe rather than a proposal inside an evolving experimental space.

### Changes

- Added a compact scenario-specific experiment-space map for dwell/composition, calcination/surface
  area, or thermal dose/phase score.
- Plotted retained measurements, an uncertainty field, and the model's proposed next point without
  displacing the technician's equipment view.
- Bound the visualization to real scenario progress: measurements accumulate as governed steps
  complete, and the proposed point changes to an evidence-gated HOLD when XRD, BET, or interrupted
  thermal history requires technician review.
- Exercised the complete XRD path through QC recovery, one quarantined identity mismatch, automated
  execution, and result review; verified the chart at both proposal and gated states.
- Verified the BET-specific design variables and compact visualization at 390 × 844.

## Critique 10: walkaround points were binary collectibles

The focus camera created a credible physical-to-digital sequence, but the first checklist still
rewarded contact rather than observation. Three green markers alone did not teach what a technician
might actually notice at the asset.

### Changes

- Added point-specific physical observations for all 18 inspection locations across six assets.
- Distinguished normal captured evidence from attention states such as XRD reference drift, robot
  route hold, hot furnace occupancy, and BET service isolation.
- Kept the observations concise and site-neutral: they expose local state and comparison cues without
  becoming hazardous operating instructions.
- Preserved the governed behavior underneath the richer UI: three observations create a ledger event
  and physical-evidence permissive, but they do not independently clear QC or service holds.
- Verified attention and pass observations in XRD focus mode and confirmed the expanded panel fits at
  390 × 844.

## Critique 11: the debrief did not visualize what the player built

The original completion screen reduced a complex shift to one rating, four scores, and a paragraph.
It did not show how physical work became retained evidence or give repeat play a memorable target.

### Changes

- Added a visual shift profile spanning safety, traceability, data integrity, and uptime.
- Added scenario-specific five-link evidence trails for XRD/SEM, BET, and interrupted-furnace work.
- Made the trail's end state explicit: representative evidence, a queued reference recheck, or a
  censored run and replacement plan.
- Replayed the complete BET shift through independent service acceptance, pretreatment identity
  correction, analysis, control failure, and held AI proposal to verify the debrief from real state.
- Verified the full debrief composition at desktop and 390 × 844.

## Critique 12: the systems field guide was still a wall of definitions

The playable station consoles showed the differences between SCADA, LES, LIMS, and AI behavior, but
the reference view explained them only as text cards. That made the role boundary harder to scan than
the rest of the product.

### Changes

- Added a visual access-boundary map from physical asset/sample through SCADA/HMI and LES/LIMS to the
  AI planner.
- Drew technician authority across observation, attestation, hold, and role-based release while
  separating the AI planner as proposal-only.
- Kept the detailed field-guide definitions and sources below the diagram for users who want depth.
- Verified the four-layer map at desktop and in a two-by-two mobile composition at 390 × 844.

## Critique 13: TGA/DSC existed only as a glossary term

The job descriptions call out thermal characterization alongside XRD, SEM/EDS, and BET. The guide
explained TGA/DSC, but the equipment-first environment gave users no physical or digital station to
inspect.

### Changes

- Added a seventh thermal-analysis station with a procedural 3D benchtop analyzer, furnace, paired
  pans, autosampler carousel, purge routing, and local display.
- Added pan, purge, and furnace walkaround observations, including an empty-pan baseline attention
  state.
- Added a dedicated HMI/SCADA mimic, permissives, LES method, LIMS chain, CMMS state, supplies, and
  data products for mass change, heat flow, and thermal-event context.
- Added a bespoke Canvas2D fallback rendering and made the fallback grid calculate its row count from
  the number of stations.
- Repositioned the pallet jack after introducing the foreground asset; verified the seven-station 3D
  establishing shot, TGA/DSC close-up, 2D map, and mobile overview.

## Critique 14: station status lights looked like sci-fi props

The original single glowing spheres were legible from the overview but became overexposed white orbs
at technician scale. Because every station repeated the artifact, it weakened otherwise grounded
equipment close-ups.

### Changes

- Replaced each orb with a compact industrial stack light, including a base, mast, separated lenses,
  dividers, and cap.
- Bound ready/running, attention/hold, and offline states to distinct stack positions while keeping
  emission restrained under the scene's PBR lighting.
- Rechecked the TGA/DSC focus view, where the foreground beacon now retains material and state detail.

## Verification discipline

Each branch was exercised in the browser through both correct and incorrect decisions. Visual QA
covered a wide desktop viewport and a 390 × 844 mobile viewport, including the scenario deck and a
stacked instrument workbench. TypeScript, lint, and production build checks are run before publish.
