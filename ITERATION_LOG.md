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

## Critique 15: a recovered mistake looked indistinguishable from a flawless shift

The adversarial furnace regression proved that an unsafe resume attempt was blocked, logged, and
penalized, but the debrief still rendered a uniformly green evidence path. That conflated evidence
completeness with execution quality. The debrief now preserves the green retained-evidence chain
while adding an amber recovered-attempt lane, with the count explicitly linked to the event ledger.

## Critique 16: every material workflow moved the same glowing game token

A generic luminous cube made sample movement visible but weakened the equipment-first realism and
hid the fact that different characterization workflows use different carrier hardware.

### Changes

- Replaced the cube with a six-position metal XRD specimen tray, a four-tube gas-sorption rack, or a
  refractory setter with four crucibles, depending on the active shift.
- Added small physical details such as loaded powders, tube caps, crucible rims, and carrier ID tags.
- Moved route endpoints from asset centers to raised front-of-instrument transfer decks so carriers
  remain visible without disappearing beneath equipment or implying that exposed samples sit on the
  laboratory floor.
- Reduced route-line brightness so the line reads as a digital-twin overlay while the carrier reads
  as the physical object the technician controls.

## Critique 17: the robot wrist still read as an overbright primitive

The first robot close-up after carrier staging showed that sample hardware had become more credible
than the manipulator handling it. Spherical joints, a glowing cyan wrist, and two bare bars did not
match the visual standard of the rest of the bay.

### Changes

- Rebuilt the procedural arm around rotary servo housings, joint caps, a base collar, dressed cable
  runs, a wrist axis, tool flange, gripper body, jaws, and replaceable contact pads.
- Added restrained joint and tool-state accents while removing the overexposed emissive wrist.
- Added an independently animated wrist axis for active transfers while keeping a legible parked pose
  during recovery work.

## Critique 18: reference help disappeared when the work order changed

The field guide was available during the XRD shift but absent from BET and furnace headers. That
made the least experienced users lose the systems and characterization reference precisely when a
new workflow introduced unfamiliar equipment.

### Changes

- Extracted the field guide into a shared modal and exposed it from every playable shift.
- Preserved the visual access-boundary map and optional deeper sources without adding text to the
  default equipment view.

## Critique 19: TGA/DSC was inspectable but not operable

The seventh station had credible equipment, walkaround points, records, and outputs, but it remained
an exhibit beside the three playable workflows. A technician could inspect the thermal analyzer
without experiencing the measurement-control decisions that make its data scientifically usable.

### Changes

- Added a fourth work order for thermal-analysis release, with a scenario-specific shift handoff,
  station states, AI experiment space, evidence chain, event ledger, and debrief.
- Built an empty-pan baseline review that requires retaining the failed run before method release.
- Added a physical-versus-governed pan-pair reconciliation, including a mixed Pt/Al scan and a
  matched PANSET-14 recovery path.
- Added paired mass-change, heat-flow, and purge traces so temporal alignment is visible without
  implying causality.
- Made the AI planner's lower-temperature proposal contingent on a technician gate that flags the
  coupled event and queues a matched-pan repeat.
- Added a paired-pan 3D carrier and extended the mobile work-order deck to four complete cards.
- Exercised both unsafe branches in the browser, verified that they remain as recovered exceptions,
  and rechecked the full debrief at 390 × 844.

## Critique 20: the digital twin still competed with its dashboard

The procedural facility had become the strongest visual element, but the default desktop grid kept
it confined between two dense columns. That hierarchy made the experience read as an operations
dashboard containing a 3D illustration instead of an equipment simulator with an attached console.

### Changes

- Added a full-viewport equipment-first mode that preserves the live Three.js scene rather than
  replacing it with a separate showcase render.
- Kept overview and technician-scale focus cameras, live station selection, scenario carriers, and
  physical walkaround checks available inside the immersive view.
- Added a deliberate exit control, Escape-key handling, scroll locking, and restoration of the
  selected asset and camera state when returning to the shift console.
- Rechecked the wide establishing shot, XRD focus, cross-station transition to TGA/DSC, and the
  equipment-focused layout at 390 × 844.

## Critique 21: recognizable equipment was not yet sophisticated equipment

Immersive focus made the gap between a plausible silhouette and a real characterization system much
more obvious. At technician scale, smooth cabinets and a few glowing parts did not communicate the
motion axes, vacuum boundaries, gas services, sample interfaces, and access hardware that make these
instruments operationally demanding.

### Changes

- Expanded XRD with a sample spinner, goniometer pivots, enclosure hinges, panel seams, lower vents,
  warning marking, HMI indicators, and leveling feet.
- Expanded SEM/EDS with column lens rings, a bolted chamber flange, stage feedthrough, secondary
  detector port, vacuum pump/service hardware, and a more legible imaging workstation.
- Expanded BET with four valved manifold branches, tube collars, dewars, vacuum gauge, service vents,
  dual-stage gas regulation, and additional visible plumbing.
- Expanded TGA/DSC with a balance head, furnace latch, transparent autosampler guard, local indicators,
  dual purge gauges, and service ventilation.
- Inspected every upgraded asset in immersive focus, then rechecked the full bay and XRD close-up at
  a 390 × 844 viewport to keep the added geometry readable rather than merely dense.

## Critique 22: orbiting a lab is not the same as walking through one

Even with a full-screen facility and detailed assets, the camera still behaved like a digital-twin
viewer. The experience needed a body-scale approach to equipment and a continuous transition from
physical presence into controlled operation.

### Changes

- Added a human-scale aisle mode with station-specific approach positions, eye-height sight lines,
  smooth cross-bay travel, drag-to-look behavior, and restrained movement bounds.
- Added keyboard movement with WASD or arrow keys plus a visible four-direction touch pad so the same
  spatial interaction is available on mobile.
- Removed floating equipment labels in aisle mode and kept identity in a compact heads-up strip to
  reduce the feeling of navigating a dashboard overlay.
- Added a direct `Operate local console` handoff from the selected physical asset to its HMI/SCADA,
  LES, LIMS, and CMMS workstation.
- Preserved the instrument selection and physical-inspection state across that transition; the HMI
  still requires all three walkaround observations before safe-state attestation.
- Exercised XRD and SEM/EDS approach changes, lateral movement, the special TGA/DSC side approach,
  the compact mobile station selector, and the complete walk-to-console path at 390 × 844.

## Critique 23: the physical-to-digital transition was one-way

The aisle could open a local workstation, but closing it returned to the general dashboard. That
broke the scientist's natural loop between the physical sample, equipment state, local controls,
and governed records. It also risked losing visual inspection context when the 3D scene changed
between its embedded and full-viewport presentation.

### Changes

- Added a `Return to asset` control to workstation sessions entered from the physical aisle while
  preserving the ordinary close behavior for consoles opened from the dashboard.
- Restored the same selected station in human-scale aisle mode rather than returning to a generic
  overview.
- Lifted walkaround evidence into shift-owned state so portal transitions cannot reset completed
  physical checks.
- Preserved workstation tab completions and safe-state attestation across repeated asset-console
  round trips.
- Verified an XRD sequence with 3/3 physical observations, HMI attestation, return to the green
  physical markers, re-entry to the attested HMI, and the full mobile header layout.

## Critique 24: identical luminous pads made the lab feel like a showroom

The equipment models and human-scale camera had become more realistic, but every asset still stood
on a thick cyan-emissive platform with a bright diamond selection ring. At close range those shapes
read as game pedestals rather than installed lab infrastructure or a restrained digital overlay.

### Changes

- Replaced the universal glowing platforms with low, dark installation pads and heavier
  anti-vibration slabs beneath XRD and SEM/EDS.
- Reduced selected-state emission and moved identity emphasis to a thin rectangular digital-twin
  perimeter.
- Added small physical leveling/anchor points at the equipment-zone corners.
- Rechecked XRD at technician scale and the full-bay composition; equipment now shares the epoxy
  floor visually while retaining a legible selected asset.

## Critique 25: “operate” still meant one generic HMI click

The workstation showed instrument-specific state, permissives, and mimics, but safe-state operation
collapsed into a single universal button once the walkaround was complete. That skipped the local
subsystem feedback a technician must reconcile before an instrument is ready for governed work.

### Changes

- Added three-step local control sequences for all seven assets, with instrument-specific language
  and strict ordering.
- Added XRD stage-home, shutter-feedback, and reference-position checks; SEM/EDS chamber-vacuum,
  stage-clearance, and detector checks; BET port-isolation, manifold-leak, and gas-supply checks; and
  TGA/DSC balance-tare, purge-path, and carousel-home checks.
- Kept the physical walkaround as the prerequisite for the control sequence and the completed
  sequence as the prerequisite for safe-state attestation.
- Preserved quality and service holds as independent conditions so operational readiness does not
  silently release suspect science.
- Exercised the complete XRD sequence on desktop, confirmed persistence across LES/HMI tab changes,
  and completed the TGA/DSC sequence on a 390 × 844 viewport.

## Critique 26: the first-person camera could ghost through equipment

Room bounds prevented leaving the modeled bay, but forward and lateral movement did not respect the
installed asset footprints. That broke physical presence as soon as a user walked through a cabinet
or safety cell.

### Changes

- Added collision zones around all seven installed stations with a technician-clearance margin.
- Added edge sliding so diagonal or lateral movement can continue along an occupied footprint rather
  than stopping the camera unnecessarily.
- Kept the guided approach points outside protected zones, including the side approach used by the
  foreground TGA/DSC bench.
- Verified repeated forward movement at XRD stops before the enclosure and that lateral-plus-forward
  movement follows the aisle between XRD and SEM/EDS without clipping through either instrument.

## Critique 27: local equipment actions disappeared from the shift record

The physical walkaround created a ledger event, but the controls subsequently operated at the HMI
only changed workstation-local state. A scientist could prove an XRD shutter or tare the TGA balance
without that action entering the work-order chronology, weakening the traceability the simulator is
meant to teach.

### Changes

- Added structured station events for every instrument-specific HMI control and every completed
  workstation attestation.
- Routed those events into all four playable shift variants while preserving each shift's simulated
  clock, technician identity, and existing record vocabulary.
- Kept safe-state attestations separate from quality, service, and sample holds; recording an action
  is not the same as authorizing scientific release.
- Verified an XRD sequence ordered as walkaround, stage home, shutter feedback, reference position,
  and attestation, then repeated the check with TGA/DSC pan/purge/furnace observations, balance tare,
  purge proof, carousel home, and attestation.

## Critique 28: cinematic darkness fought physical inspection

The dark digital-twin treatment made status lights and metallic equipment attractive, but it also
made the bay feel like a product stage. A technician walking down valves, sample holders, doors, and
clearances needs a high, neutral ambient level; lower light is useful during instrument operation,
but should be an intentional facility state rather than the only visual language.

### Changes

- Added a technician-selectable inspection-light and instrument-run lighting state in every 3D
  camera mode, including the full-viewport equipment-first view.
- Added modeled overhead LED troffers with matching physical emission and local room illumination.
- Gave inspection mode neutral wall, epoxy-floor, fog, environment, and accent-light values so
  cabinet geometry and operating clearances remain readable without flattening metallic materials.
- Preserved a restrained run state that lowers room and fixture output while retaining alarm,
  furnace, HMI, and station-status cues.
- Compared TGA/DSC at overview and technician eye height in both modes, then verified the toggle,
  station selector, movement controls, and console handoff at 390 × 844 in immersive mode.

## Critique 29: the HMI and physical twin acknowledged different realities

The local workstation retained every control action, but returning to the asset showed the same
static model as before the action. That made the spatial twin decorative at the exact moment it
should help a technician reconcile commanded state with physical feedback.

### Changes

- Preserved the structured identity of every local HMI action in the viewport as well as the shift
  ledger, without parsing human-readable audit text.
- Added a three-channel control-proof indicator to every station model so subsystem feedback is
  visible in overview, focus, and aisle modes.
- Connected XRD stage-home, shutter-proof, and reference-position actions to the specimen-stage
  position, beam-path color, HMI strip, and local indicators.
- Connected TGA/DSC balance-tare, purge-proof, and carousel-home actions to the display, gas path,
  gauges, carousel position, and local indicators.
- Exercised both full three-control sequences, confirmed safe-state attestation still leaves their
  separate QC holds in place, and verified an aisle → console → return-to-asset round trip retains
  all physical feedback.

## Critique 30: two major characterization tools still behaved as static props

XRD and TGA/DSC now reconciled local controls with the spatial twin, but SEM/EDS and BET—two of the
techniques emphasized in the target lab roles—only showed the generic proof channels. Their central
vacuum, detector, manifold, and gas hardware needed to respond at the same level of specificity.

### Changes

- Connected SEM chamber-vacuum proof to the column path and bolted chamber ring, stage-clearance
  proof to the visible stage position, and BSE/EDS arming to the detector body and acquisition HMI.
- Connected BET port isolation to the four-valve manifold, the manifold leak check to analysis-tube
  feedback and gauge position, and N₂ proof to the cylinder and regulator faces.
- Retained the universal three-channel proof unit, so equipment-specific feedback and shared
  operating grammar reinforce rather than replace one another.
- Exercised both complete sequences in focus mode and verified that SEM readiness and the BET service
  offline state remain independent from the newly proven local subsystems.

## Critique 31: prep, automation, and thermal processing lagged the instruments

All four characterization stations now returned detailed local feedback to the physical twin, but
the balance/enclosure, robot cell, and furnace still relied on the universal three-light proof unit.
That left the materials workflow uneven: preparation and processing deserved the same visible
cause-and-effect as measurement.

### Changes

- Connected prep-bench enclosure-flow proof to the task light, balance zero to its display, and
  antistatic proof to the point-of-use tool and work surface.
- Connected robot safeguard reset to the cell/HMI state, transfer-axis home to a settled arm pose,
  and gripper proof to the jaws and tool indicator.
- Connected furnace relay readback, door-chain feedback, and chamber-state proof to the controller,
  latch, chamber indicator, and hot-zone presentation.
- Replaced the furnace's static empty-cell third step with state-aware chamber logic: a non-ready
  furnace confirms occupancy, while only a READY furnace can confirm an empty cell.
- Changed sequence completion from a raw action count to exact required-action matching, preventing
  stale or context-changed controls from satisfying the wrong sequence.
- Exercised all three complete sequences and specifically verified that a 982 °C RUNNING furnace
  retains its orange hot zone while recording chamber occupancy—not an impossible empty-cell state.

## Critique 32: the lab had equipment but no credible controlled boundary

The bay contained utilities, alarms, a cart, and material-handling equipment, yet still felt like an
open digital-twin stage. A technician should read how they entered the space, where emergency
equipment lives, and where clean/controlled circulation begins without opening an explanatory panel.

### Changes

- Added a framed controlled-access door with a vision panel, closer/handle hardware, green access
  status, and a point-of-entry badge reader.
- Added a clean transition mat with physical grooves at the laboratory threshold.
- Added a wall-fed emergency shower and dual-head eyewash with a marked clear zone.
- Added a wall-mounted spill-response cabinet and retained the existing alarm, emergency stop, and
  fire-response hardware as one safety layer.
- Verified that the compact dashboard view preserves instrument priority while the full equipment-
  first overview reveals the complete door, clean zone, emergency station, utilities, and aisle
  relationship at room scale.

## Critique 33: digital labels obscured the room they were explaining

The full-room overview finally exposed the facility boundary, but seven persistent station cards
covered instrument silhouettes, valves, safety hardware, and one another. The annotation layer had
become more prominent than the physical lab.

### Changes

- Kept a persistent identity card only on the selected station.
- Made unselected station cards disclose on direct 3D hover rather than occupy the default room view.
- Retained the complete seven-station selector, physical stack lights, selected digital perimeter,
  and accessible station buttons, so decluttering did not remove status or navigation.
- Compared the full equipment-first overview before and after the change and verified the controlled
  door, shower/eyewash, robot cage, utilities, and instrument silhouettes are now simultaneously
  legible.

## Critique 34: characterization scenarios did not cover facility operations

The four characterization-centered shifts taught instrument control, sample lineage, and scientific
release well, but the target role also names powered handling, gas systems, LIMS/MES/SCADA, and the
physical work that keeps a high-throughput lab supplied. Those responsibilities were visible as
background props rather than playable technician decisions.

### Changes

- Added a fifth controlled-facility shift spanning handoff, physical tote reconciliation, powered
  movement, gas-service acceptance, post-changeover control, and AI data eligibility.
- Kept material identity and utility state as independent gates, so a correct tote cannot clear an
  unproven gas boundary and a proven gas boundary cannot repair the wrong lot.
- Added distinct failure branches for relabeling a physical tote from a ticket, accepting gas by
  color and pressure alone, and merging service-transition data into a scientific trend.
- Added a complete facility evidence chain and debrief so blocked mistakes remain visible as
  recovered exceptions rather than disappearing after the right choice.

## Critique 35: utilities and staging existed only as labels

The new shift could describe gas service and sample staging, but the room still lacked enough
physical infrastructure to make those decisions spatially believable.

### Changes

- Added a three-cylinder service rack with restraint structure, cylinder shoulders, gauges,
  regulators, line tags, a branch manifold, status lighting, and a controlled floor zone.
- Added a point-of-use sample rack and scenario-specific tote hardware instead of reusing an
  abstract carrier.
- Linked the gas-service bay and BET utility state to the facility shift so pending and accepted
  boundaries change the same physical scene the technician is inspecting.
- Verified the utility bay in overview, focus, human-scale aisle, and inspection/run lighting.

## Critique 36: entering the lab was too indirect

Human-scale walking existed, but reaching it required discovering a camera toggle and then expanding
the view. The primary promise—feel like walking into a real lab—was hidden behind dashboard grammar.

### Changes

- Added a direct `Enter lab` control that opens the full-viewport aisle at technician eye height in
  one action.
- Kept overview, focus, lighting, station selection, collision-aware movement, walkaround evidence,
  and local-console handoff available after entry.
- Added an always-visible exit path that returns to the overview rather than leaving the user in an
  ambiguous embedded camera state.
- Verified the one-click transition and compact control placement at 390 × 844.

## Critique 37: the material-handling asset read as a generic cart

The facility scenario referenced a powered pallet jack, but its first 3D form did not communicate
power, controls, load interface, or route occupancy convincingly enough.

### Changes

- Rebuilt the carrier as a compact electric pallet jack with a battery/drive housing, articulated
  tiller, control head, emergency-reverse surface, operator display, beacon, load wheels, traction
  wheel, forks, and restrained tote.
- Staged the jack with the governed tote in prep and moved both through the controlled aisle to the
  BET receiving bay after release.
- Added a collision footprint while staged so human-scale movement respects the powered asset as
  installed equipment rather than walking through it.
- Tuned orientation and route interpolation so fork direction and load movement stay coherent at
  both endpoints.

## Critique 38: one checkbox compressed the powered-move inspection

The first move console combined equipment condition and rated load in one vague assertion. It did
not distinguish the observations a technician needs before linking physical readiness to a digital
move ticket.

### Changes

- Separated power/brake/emergency-reverse state, forks/load wheels/capacity, tote restraint/pallet
  condition, and aisle/door/receiving-bay clearance.
- Exposed independent DRIVE, FORKS, LOAD, ROUTE, and LOT channels in the visual move bay.
- Labeled the ticket as MES move execution while keeping physical inspection and scan evidence
  separate from the system of record.
- Exercised the held and released states on desktop and a 390 × 844 viewport; power travel remains
  unavailable until every observation and both tote reads are complete.

## Critique 39: human-scale entry did not guarantee a valid approach

The aisle camera used one front-facing offset for almost every asset. That looked acceptable in the
overview but sent the back-row prep, robot, and furnace views through the footprints of XRD, SEM,
and BET. Several arrivals began against a cabinet or inside unrelated geometry.

### Changes

- Added station-specific technician approach points derived from the actual two-row room layout.
- Routed prep, robot, and furnace through cross-aisle side approaches; preserved clear front
  approaches for XRD and SEM; used a right-side BET approach to avoid TGA/DSC; and retained the
  dedicated side approach for the front-boundary TGA/DSC bench.
- Increased walk-mode orbit allowance and adopted a modestly wider human-scale field of view so the
  working face, controls, and adjacent clearance remain visible on arrival.
- Visually audited all seven assets in full-viewport aisle mode and confirmed no approach begins
  inside another station or behind its cabinet.

## Critique 40: optional work orders inflated the first console bundle

The 3D scene was already lazy-loaded, but the TGA/DSC and facility scenario code shipped with the
initial XRD console even when the user had not selected either work order. That added cost before the
first equipment interaction and made future shift growth less scalable.

### Changes

- Split the TGA/DSC and facility shifts into on-demand client chunks while preserving the shared
  scenario deck and instantaneous state handoff.
- Added a restrained full-viewport work-order loader that mirrors the spatial-twin visual language
  instead of flashing a blank page during a cold module fetch.
- Reduced the main page chunk from roughly 184 KB to 32 KB; the optional TGA/DSC and facility chunks
  are approximately 28 KB and 36 KB respectively.
- Loaded both split scenarios through the real shift deck and confirmed their starting equipment,
  controls, and work-order state render after the transition.

## Critique 41: physical inspection and local operation were disconnected

The local HMI already enforced three physical observations, but aisle mode only hinted that the user
should find a separate camera control. After completing the walkaround, the user then had to reverse
that navigation before they could operate the station. The evidence model was sound; the embodied
workflow was not obvious.

### Changes

- Added a persistent `Inspect asset` action to the human-scale aisle HUD with live 0/3 evidence
  progress for the selected station.
- Routed that action directly into the selected asset's physical walkaround rather than asking the
  user to interpret camera terminology.
- Added a governed `Open local console` handoff when all three observations are captured, preserving
  the same station, inspection record, and full-viewport context.
- Exercised the complete XRD chain from aisle arrival through holder, HMI, and shutter observations
  into the local HMI; the first control action remains disabled before the walkaround and enabled
  after the three physical checks are linked.

## Critique 42: the walkable lab was visually rich but acoustically empty

Human-scale movement, equipment clearances, lighting, and operating handoffs created physical
presence, but the room remained unnaturally silent. Continuous ventilation and subdued electrical
room tone are part of how an operating laboratory feels, especially when the interface is asking the
user to inhabit the space rather than only read it.

### Changes

- Added an opt-in `Lab audio` control beside the facility lighting state in embedded and immersive
  3D views.
- Generated a low-level 60 Hz electrical component and filtered broadband air-handler component
  entirely in the browser, avoiding external media or licensing dependencies.
- Kept audio muted by default and started it only from an explicit user gesture, with a clearly
  visible on state and immediate mute action.
- Verified start, active state, mute, cleanup, console errors, and compact-screen placement; no
  sound is left playing after QA.

## Critique 43: the post-change BET control was an instant result

The facility shift correctly required a control after gas-service acceptance, but one button jumped
from “reference ready” to 181 m²/g. That erased the distinction between reference-material identity,
current sample context, native isotherm evidence, method-owned fitting, and the actual control
decision.

### Changes

- Added a dedicated post-change BET workbench for ALU-21 with separate physical/LIMS identity,
  pretreatment and dry-mass context, and accepted GAS-41/analysis-port linkage.
- Added a visual adsorption isotherm, a method-controlled fit region, retained native acquisition
  state, a 181 m²/g result, and a 173–191 m²/g control-band gauge.
- Added a blocked branch that attempts to substitute the reference certificate's assigned value for
  a current analyzer-control measurement; the workbench stays held and records the exception.
- Kept method-specific dosing, equilibrium, preparation, and acceptance details outside the
  simulation boundary while preserving the scientific evidence structure.
- Exercised the wrong branch, the complete governed acquisition, the in-control verdict, the
  handoff into service-transition eligibility review, and the stacked compact-screen layout.

## Critique 44: matched-pan identity was standing in for measurement control

The TGA/DSC work order correctly reconciled the governed platinum-pan pair, but its next action
jumped from “matched pair” to lot release. A physical match makes the consumables traceable; it does
not establish that the coupled mass and heat-flow channels are stable under the current method and
purge conditions.

### Changes

- Added a paired-pan blank workbench with explicit pan-set identity, empty-position condition, and
  retained purge/method-revision checks.
- Added a visual coupled blank for mass, DSC heat flow, and nitrogen flow, including method bands,
  native acquisition state, and a joint in-control verdict.
- Added a blocked branch that attempts release from matched-pan identity alone; the lot remains held
  and the data-integrity exception is recorded.
- Retained the accepted +0.03 mg mass offset and +0.04 mW heat-flow slope with the blank record before
  releasing LOT-91-T into execution.
- Exercised the blocked shortcut, governed acquisition, accepted release, phase transition, desktop
  composition, and stacked compact-screen layout in the running application.

## Critique 45: furnace recovery asserted a coordinated dry cycle without showing one

After the interrupted load and robot occupancy were reconciled, `Run verification` immediately
returned both machines to ready. That hid the safety boundary, furnace controller, and robot
handshake that make a coordinated recovery materially different from acknowledging an alarm.

### Changes

- Added a furnace–robot recovery console with separate cell-boundary, safeguarding, and retained
  SCADA/controller-context checks.
- Added a visual four-stage dry-cycle sequence for area clear, access closed, furnace proof, and
  robot handshake, with occupancy and machine-state readbacks retained together.
- Added a blocked branch that attempts release from alarm acknowledgement alone; the workcell
  remains held and the safety exception is logged.
- Reframed the post-cycle state as retained recovery evidence rather than implying the already
  completed 16-minute verification is still running.
- Exercised the alarm disposition, physical occupancy reconciliation, blocked shortcut, acquired
  dry cycle, correct return-to-ready handoff, desktop composition, and compact-screen stack.

## Critique 46: the room contradicted the furnace recovery record

The recovery console could now prove an empty chamber, yet the 3D carrier route still moved BC-207
toward FURN-04 and the chamber kept its interrupted-load glow. The static furnace walkaround also
continued to report a hot load after the workcell was returned to ready.

### Changes

- Reversed the physical recovery story in the spatial twin: BC-207 begins at the furnace threshold
  and moves to a marked quarantine stand outside the station footprint after reconciliation.
- Added a dedicated quarantine-zone prop with hold color, floor boundary, and status placard so the
  material disposition is visible in the room rather than existing only in the event ledger.
- Made the furnace chamber, controller strip, door-chain indicator, and local light respond to the
  work-order phase: interrupted/hot, controlled hold, then empty and recovery-proven.
- Made furnace walkaround observations phase-aware; after recovery they report the closed access
  loop, retained I-204 trace, empty chamber, and BC-207 quarantine location.
- Corrected the 2D fallback to show a quarantine hold and `RECOVERY PROVEN` rather than a carrier at
  the furnace and an already-complete empty-cell cycle still running.
- Visually inspected the recovered furnace in equipment focus and exercised all three updated
  physical observations through the local-console handoff.

## Critique 47: physical observations were frozen at first-shift conditions

The walkaround system was interactive, but most hotspot text came from one static equipment
snapshot. A technician could pass XRD control and still read the failed reference, accept BET
service and still see service isolation, or reconcile MOV-3024 and still inspect an unrelated lot.

### Changes

- Made XRD, robot, and SEM/EDS observations follow reference control, automated transfer, result
  review, and representative follow-up phases.
- Made BET port, gas, and vacuum observations follow service isolation, acceptance, acquisition,
  facility changeover, and result-exception states.
- Made TGA pan, purge, and furnace observations follow mixed-pan hold, matched blank, specimen run,
  and coupled-event review states.
- Made facility prep observations name the real MOV-3024 boundary and LOT-3024-A instead of the
  unrelated default prep lot; added phase-aware facility BET isolation and GAS-41 proof text.
- Made robot recovery observations follow unresolved occupancy, armed dry-cycle state, and the
  completed parked/handshake state.
- Browser-tested a furnace robot HMI after recovery and the prep-bay lot observation before and
  after physical tote reconciliation; both changed with the work-order record.

## Critique 48: local consoles leaked records from unrelated work orders

Station HMI visuals were equipment-specific, but their LES, LIMS, and CMMS profiles were keyed only
to the asset. Facility prep therefore exposed LOT-91 / BC-184, the facility BET console exposed the
vendor-recommissioning record, and the XRD furnace inherited BC-207 recovery context.

### Changes

- Added active-work-order console profiles for facility prep, facility robot coordination, GAS-41
  at BET-02, furnace-recovery robot work, the XRD campaign furnace, and SEM/EDS inclusion triage.
- Gave MOV-3024 a dedicated LES path—scan both totes, inspect the powered jack, secure load and
  route, retain the move receipt—and a LIMS chain of LOT-3024-A → MOV-3024 → REC-BET-02.
- Made facility LIMS lifecycle labels follow the station state, including move hold, move released,
  move received, service hold, control ready, window hold, and eligible.
- Replaced generic lineage captions with move/service-specific and interrupted-run-specific evidence
  meanings where the underlying artifact is not an ordinary specimen result.
- Made the furnace HMI mimic show an empty green chamber and proven door chain when the station is
  recovered instead of retaining its generic orange hot-zone graphic.
- Browser-verified the facility LES procedure, LIMS identifiers, evidence meanings, and
  `MOVE RELEASED` state after physical tote reconciliation.

## Critique 49: walking between instruments erased console work

The local consoles let the player complete governed HMI, LES, and LIMS actions, but selecting a
different station remounted the console and discarded that evidence. That made the lab feel like a
collection of disconnected demos rather than a persistent room.

### Changes

- Replaced the single transient console state with station-keyed sessions for active tab, completed
  HMI sequence steps, LES progress, and verified LIMS associations.
- Kept session data scoped to the current campaign run, so returning to an asset shows the work the
  player actually completed there without leaking records between stations.
- Removed parent keys that forced station access to remount whenever the selected asset changed.
- Browser-tested PREP-01 by verifying MOV-3024, walking to BET-02, returning to PREP-01, and
  confirming both the completed-tab checkmark and `ASSOCIATION VERIFIED` state persisted.

## Critique 50: research scaffolding leaked into the game world

The field guide still explained the simulator through its source job descriptions and external
research. That was useful during design, but it broke the fiction of entering a working materials
lab and made the interface feel like a training document instead of a game system.

### Changes

- Removed player-facing job-description and source language from the field guide and metadata.
- Recast the guide as an in-world operations reference anchored on a five-stage campaign loop:
  design, prepare, synthesize, measure, and learn.
- Added a compact visual fault vocabulary for QC drift, starved queues, cell faults, utility holds,
  contamination, and model holds—the conditions future sandbox play will surface as bottlenecks.
- Added a player-control boundary showing how physical assets, MES/SCADA/HMI, LES/LIMS, and the AI
  planner relate, including the rule that AI can propose but cannot override release gates.
- Changed player-facing deck, ledger, and debrief language from employment/training framing to
  campaign incidents, run records, system insight, and operator decisions.
- Visually inspected the new guide at desktop and compact viewport sizes and confirmed the removed
  employment/source language no longer appears in the application.

## Critique 51: incidents did not yet form a playable lab system

The work orders had realistic local decisions, but they remained isolated stories. There was no
place to choose a material candidate, route it through the room, see shared equipment capacity, or
experience how a machine failure propagates into scientific throughput.

### Changes

- Added a persistent Campaign Lab accessible from every scenario and made it the primary compact-
  screen entry point.
- Added three AI-proposed Ca–Ti–O experiment candidates with composition, thermal envelope,
  predicted phase fraction, and uncertainty shown in a visual design space.
- Added a live five-stage route through PREP-01, ROBO-02, FURN-04, XRD-03, and the evidence-gated
  model, including current jobs, cycle times, completion state, and a parallel equipment schedule.
- Implemented a full playable run with a robot cleanliness fault, a single-capacity furnace queue,
  and an overdue XRD reference check; each constraint changes clock time, route state, queue tokens,
  and the available player command.
- Added tempting but blocked shortcuts for bypassing the robot cleanliness witness and shortening a
  governed furnace run, with the scientific consequence explained in the live constraint console.
- Persisted the campaign lane in browser storage so closing and reopening Campaign Lab does not
  erase the current experiment.
- Browser-played the complete route, verified both shortcut blocks, and visually inspected initial,
  robot-fault, furnace-queue, XRD-hold, completed, and compact-screen states.

## Critique 52: a valid experiment was visually mistaken for a successful objective

The first sandbox run measured 95.8% target phase against a campaign objective of at least 96%.
Because every route step completed and the evidence was AI-eligible, the result initially looked
like an uncomplicated win even though the material objective was missed.

### Changes

- Separated route completion and evidence validity from material-objective success.
- Reframed the terminal state as `VALID RESULT · TARGET MISSED`, showed the −0.2 percentage-point
  gap, and styled it as a mixed amber/green outcome.
- Preserved the result as useful model evidence and research insight rather than discarding a
  scientifically valid negative experiment.
- Clarified that the throughput readout is lab-wide rather than the elapsed time of one serial run.

## Critique 53: the campaign route disappeared when the player returned to the room

Campaign Lab could model a robot fault and furnace queue, but closing it returned to a 3D room that
still showed only the unrelated incident route. The machine system and the physical environment
were therefore telling two different stories.

### Changes

- Broadcast campaign stage changes into the spatial twin and restored them from the persisted run
  when the room mounts.
- Added a second, explicitly labeled `RUN-042` physical route from PREP-01 through ROBO-02,
  FURN-04, and XRD-03, with an animated crucible carrier at the actual active asset.
- Made the active asset beacon, floor boundary, station picker, 3D label, and machine animation adopt
  the campaign run state, including amber cleanliness/QC holds and furnace queue state.
- Added a compact campaign HUD to the room that identifies the current machine, route stage, and
  valid-negative terminal state without opening another text panel.
- Added `VIEW IN 3D TWIN` to Campaign Lab; it closes the planner, selects the correct physical asset,
  enters the human-scale aisle, and preserves the campaign state.
- Browser-verified the handoff at the ROBO-02 cleanliness fault and the FURN-04 capacity queue. In
  both cases the camera arrived at the correct equipment, the carrier occupied the expected floor
  position, and the campaign fault label remained visible in the room.

## Critique 54: the local machine console reverted to an unrelated incident

The RUN-042 carrier and campaign hold were visible in the room, but opening a machine still loaded
the selected incident's controller, method, samples, and generic HMI sequence. The illusion broke at
the exact moment the player tried to operate the asset.

### Changes

- Made PREP-01, ROBO-02, FURN-04, and XRD-03 consoles adopt the active RUN-042 stage, including
  campaign controller IDs, live states, readouts, governed methods, and sample lineage.
- Added stage-specific HMI control sequences for formulation preparation, gripper recovery,
  six-position robot dosing, a capacity-one furnace queue, thermal-profile startup, and XRD Si
  qualification.
- Added stage-specific LES steps and LIMS chains from C-42 through BC-042, C42-980-4H, XRD-042, and
  PAT-042, with contamination, queue, QC, and valid-negative states preserved.
- Isolated console completion by campaign stage so an attestation from an incident or an earlier
  RUN-042 operation cannot satisfy a later operation.
- Browser-verified the furnace queue HMI, LES, and LIMS views against the physical carrier and
  confirmed RUN-039 occupancy, Q01, 62-minute remaining time, and BC-042 identity remained aligned.

## Critique 55: campaign progress could bypass the laboratory

The campaign planner could advance time and clear faults with one footer button. That demonstrated
the route, but it did not make the player behave like a scientist or technician operating a real
room. Machine interaction was optional scenery.

### Changes

- Replaced planner-side stage advancement with asset commands that enter the 3D lab at the active
  station.
- Added campaign-specific physical observations to every route stage: precursor and balance checks,
  robot gate/gripper/HMI state, furnace occupancy/queue/carrier state, and XRD holder/reference/
  shutter state.
- Scoped physical inspection evidence by campaign stage and required the console to be entered from
  the completed 3D walkaround; stale checks and direct console entry cannot unlock campaign HMI
  controls.
- Made ordered HMI feedback and a safe-state attestation advance the persisted campaign, account for
  recovery or cycle time, and return the player to the next physical asset automatically.
- Browser-played the complete FURN-04 queue transition: three physical checks unlocked the queue HMI,
  its ordered control sequence advanced the run by 62 minutes, and the room returned with a fresh
  0/3 walkaround under the active 980 °C profile.

## Critique 56: candidate selection was cosmetic

The design space offered C-42, Z-17, and D-08, but the physical lab always reverted to C-42's
formula, 980 °C profile, 95.8% result, and target miss. That made the core scientific decision look
interactive without producing a different experiment.

### Changes

- Created a shared campaign specification for all three candidates with formula, precursor set,
  target mass, thermal profile, prediction, uncertainty, measured outcome, objective gap, insight
  value, and furnace-limited rate.
- Propagated the selected candidate through 3D room labels, physical observations, PREP and furnace
  HMI readouts, ordered control operations, LES methods, LIMS identities, XRD results, model reward,
  and final objective verdict.
- Replaced the placeholder 94-minute calcination with candidate-specific ramp/dwell/cool durations
  of 330–480 minutes and changed the schedule scale and throughput metric to reflect the single-
  capacity furnace bottleneck.
- Isolated campaign inspection and console evidence by candidate as well as stage, preventing a
  completed C-42 check from unlocking Z-17.
- Browser-played C-42 to a valid 95.8% target miss at +484 minutes, then selected Z-17 and confirmed
  a fresh 0/3 PREP walkaround, Zr-doped formula, 22.50 g mass target, Z17-1020-3H30 furnace profile,
  330-minute thermal cycle, and a green 96.7% target-met result at +454 minutes.

## Critique 57: completed experiments did not become model memory

A result changed insight points, but the next campaign looked like a reset of the same RUN-042.
Measured outcomes did not appear in the design space, candidate cards, or a persistent campaign
record, so the AI loop stopped at `LEARN` instead of actually learning across experiments.

### Changes

- Added a persistent campaign result history with run number, candidate, measured target fraction,
  objective gap, validity outcome, and elapsed laboratory time.
- Plotted recent campaign results directly in the composition/temperature design space and added a
  compact model-memory ledger; candidate cards now distinguish predictions from measured outcomes.
- Assigned a new governed identity to each experiment (`RUN-043`, `BC-043`, `RUN-043-P`,
  `RUN-043-T`, `XRD-043`, and `PAT-043`) and propagated it through the room, queue, HMI operations,
  LES/LIMS records, and schedule.
- Included run number in physical-inspection and console-session keys so repeating the same candidate
  cannot inherit completed evidence from its previous execution.
- Browser-archived Z-17 / RUN-042 and confirmed the next planner opened as MAT-043 / RUN-043 with the
  96.7% result plotted, the candidate marked measured, a model-memory row retained, and all route
  equipment reset for a genuinely new experiment.

## Critique 58: XRD measurement happened off-screen

The XRD stage behaved like a generic equipment checklist and then revealed a result in the campaign
planner. The player never saw a reference pattern, specimen acquisition, fit quality, or the evidence
that separated a qualified measurement from a number appearing in the UI.

### Changes

- Added an instrument-native diffraction acquisition panel inside the XRD HMI with separate NIST Si
  and specimen trace bands, 10–80° 2θ framing, and candidate-specific simulated peak patterns.
- Expanded the governed sequence to home the specimen stage, prove shutter feedback, acquire the Si
  reference, and only then acquire the campaign pattern; each step visibly changes the instrument
  state and the specimen remains inhibited until the control passes.
- Added reference offset and limit, fitted phase fraction, Rwp, objective gap, and explicit target-met
  versus valid-negative verdicts without conflating scientific outcome with data validity.
- Browser-ran D-08 / RUN-043 through preparation, robot recovery and dosing, furnace queue and 900 °C
  six-hour profile, and XRD qualification. The console showed a +0.01° control pass followed by a
  distinct 95.1% pattern at Rwp 8.1% and a valid −0.9 pp target miss, which then entered the campaign
  design space and persistent two-run model memory.

## Critique 59: the surrounding console contradicted the active campaign

The 3D room and station modal understood the active run, but the persistent right rail could still
show incident-era station readouts, a different QC excursion, and an unrelated model request. That
made the same instrument appear to occupy two incompatible states.

### Changes

- Added a shared campaign-context adapter that converts the persisted run, candidate, and stage into
  the station state and technician readouts used throughout every shift view.
- Made the main station inspector and action card show the active campaign identity, current physical
  gate, qualified result, and objective gap instead of the underlying incident when those overlap.
- Replaced the generic planner panel during a campaign with a run-specific PLAN → EXECUTE → MEASURE →
  LEARN state, candidate design-space marker, model request, and the actual robot, furnace, XRD, or
  learning gate.
- Browser-verified that D-08 / RUN-043 now appears consistently as a 95.1% valid negative in the 3D
  twin, campaign action card, XRD inspector, and AI loop, with no stale +0.17° result or unrelated
  six-hour proposal in the active right-rail context.

## Critique 60: robot synthesis was still a generic button sequence

The 3D cell contained a convincing articulated arm, but its local HMI did not expose a cell program,
material positions, carrier binding, or mass execution. The player could not read how the robot was
actually turning a formulation into physical crucibles.

### Changes

- Added a robot-cell program view with a safeguarded boundary, articulated arm pose, gripper state,
  carrier infeed, dotted motion path, and a six-position crucible deck.
- Bound recovery and dosing visuals to the ordered HMI feedback: safeguard proof, tool cleaning,
  witness acquisition, carrier scan, position proof, and final dose execution each change the cell.
- Converted each candidate's total target mass into a per-position program and retained both values;
  C-42 / RUN-044 therefore executes `4.00 g × 6` as a `24.00 g` total under BC-044.
- Browser-verified recovery, the pre-execution program-proven state, the fully dosed six-position
  state, and the stacked narrow-display console. Also separated cleaning-mode readiness from the
  gripper witness so the recovery permissive no longer claims a not-yet-acquired witness is valid.

## Critique 61: the furnace hid both the bottleneck and thermal history

FURN-04 reported a queue and a profile name, but the capacity constraint and the scientific thermal
history were not visible where the player operated the furnace.

### Changes

- Added a capacity-one queue HMI that shows RUN-039 physically occupying the chamber, RUN-044 / BC-044
  in Q01, the 62-minute release boundary, hold-location proof, and the downstream time horizon.
- Added candidate-specific ramp, dwell, and cool traces with setpoint versus actual curves, total
  thermal duration, atmosphere, overtemperature feedback, door-chain proof, and a live start cursor.
- Browser-ran C-42 through the queue and then loaded C42-980-4H, confirming the HMI changed from a
  62-minute occupancy hold to a 980 °C / 4.0-hour / 360-minute profile and only displayed `PROFILE
  ACTIVE` after all safety feedback and the explicit start command were retained.

## Critique 62: material preparation had no physical weighing evidence

PREP-01 showed a balance-shaped mimic, but the player could not see the precursor identities, target
portions, enclosure proof, live balance value, or the actual material record released downstream.

### Changes

- Added a powder-preparation HMI with a local-exhaust enclosure, candidate-specific precursor lot
  cards, analytical-balance display, ±0.2 mg limit, stability trace, and portion-to-carrier release.
- Added chemically distinct mass programs for C-42, Z-17, and D-08; the Zr-doped program includes
  CA-21A / CaCO₃ at 12.39 g, TI-09C / TiO₂ at 9.50 g, and ZR-04B / ZrO₂ at 0.61 g for a 22.50 g target.
- Bound enclosure proof, balance tare, mass stabilization, and antistatic release to ordered local
  feedback, so a portion record cannot link to the carrier before all three physical states agree.
- Browser-verified Z-17 / RUN-045 from an untared enclosure hold through 0.48 m/s flow, a stable
  22.4998 g measurement at −0.2 mg, and final RUN-045-P → BC-045 release; caught and corrected a
  0.01 g rounding mismatch in the initial three-precursor program during that review.

## Critique 63: model memory did not change the playable design space

Qualified results accumulated in a ledger, but the same three candidates remained forever. The
`LEARN` step therefore changed a score without producing new experimental agency.

### Changes

- Added an adaptive candidate slot that remains visibly locked until two qualified campaign results
  have entered model memory, then expands the design space from three to four playable recipes.
- Added A-29 as a learned intermediate: CaTi₀.₉₈Zr₀.₀₂O₃, 1,000 °C, 3.75-hour dwell, 345-minute
  thermal cycle, 97.4% prediction at ±0.9%, and a distinct 97.0% qualified outcome.
- Propagated A-29 through preparation (13.28 g CaCO₃, 10.39 g TiO₂, 0.33 g ZrO₂), robot mass
  splitting, furnace program A29-1000-3H45, XRD peak pattern, objective verdict, and reward.
- Rejected the first draft of the adaptive formula during scientific review: a normalized cation
  ratio attached to O₃ was not charge-balanced. Replaced it with defensible B-site Zr substitution
  and recalculated all precursor fractions; also relabeled C-42 as CaTiO₃ + 8.3 mol% Ca excess rather
  than presenting its non-stoichiometric precursor ratio as a phase formula.
- Browser-verified that three retained results unlock a green A-29 candidate inside campaign control,
  while an in-progress run keeps all recipes disabled and preserves governance.

## Critique 64: a valid negative ended without a physical diagnosis path

An off-target but qualified XRD result entered model memory immediately, even when the next useful
scientific move was to inspect morphology and local chemistry. The player could see that a recipe
missed, but could not walk the specimen to microscopy, acquire representative evidence, or learn why
the result may have failed.

### Changes

- Added an optional ninth campaign stage that routes a qualified target miss from XRD-03 to SEM-01
  without forcing microscopy onto successful runs.
- Added a required SEM walkaround covering the chamber, column, and BSE / EDS system, followed by an
  ordered local sequence for chamber vacuum, four representative BSE fields, and a correlated EDS map.
- Built an instrument-native microscopy console with a four-field grayscale mosaic, candidate-aware
  EDS spectrum, live vacuum and coverage state, and a mechanism finding that remains explicitly
  labeled `hypothesis · not proof`.
- Linked the diagnosis back into campaign memory, the 3D room state, station inspector, AI learning
  gate, expanded 09 / 09 route, and equipment schedule; post-acquisition focus now returns to SEM-01
  instead of an unrelated instrument.
- Browser-ran D-08 / RUN-046 from its 95.1% valid negative through the complete diagnosis branch,
  retaining `Ti-rich cores` as the incomplete-conversion hypothesis. Desktop and 390 × 844 views were
  checked, including live 0 / 4 → 4 / 4 feedback and the final `D-08 · DIAG` model-memory record.

## Critique 65: BET and TGA/DSC still looked like generic equipment

Five campaign machines had instrument-native operating views, but BET-02 and TGA-01 still dropped the
player into the same generic mimic. Their incident modals contained scientific traces, yet the local
stations did not expose the manifolds, pans, coupled channels, or physical control sequence that
actually make those instruments different.

### Changes

- Added a BET-02 four-port gas-sorption HMI with physical tube valves, service-boundary isolation,
  turbo-pump evacuation, base-pressure and leak-rate feedback, adsorbate N₂ proof, and a native
  pressure / uptake plot that can carry the later isotherm state.
- Added a TGA-01 coupled analyzer HMI with a microbalance beam, twin pan positions, furnace envelope,
  purge path, six-position autosampler, and distinct mass, DSC, and N₂ channels.
- Bound the BET port, leak, and gas permissives and the TGA purge and carousel permissives to the
  actual ordered local-control feedback. The consoles no longer claim a state is true before the
  player has proven it.
- Preserved independent quality boundaries: a complete local control sequence creates acceptance or
  method-start evidence, but it does not silently release an open service ticket or failed baseline.
- Isolated scenario state so a retained phase-purity campaign no longer leaks its SEM diagnosis, 3D
  carrier route, or AI proposal into BET, furnace, TGA, or facility incidents.
- Browser-verified both consoles from 0 / 3 through 3 / 3 feedback. BET reached 3.2e−4 mbar, a
  0.6 µbar/min leak pass, and 4.8 bar N₂; TGA reached +0.00 mg, 60 mL/min N₂, and A / B homed. The
  completed TGA console was also checked at 390 × 844 with the native plot and action sequence stacked.

## Critique 66: the microscopy diagnosis did not change the next experiment

SEM/EDS could retain a mechanism hypothesis, but archiving the run simply reopened the same static
candidate list. The visual language said `LEARN` while the actual experiment space did not respond to
the microscopy evidence.

### Changes

- Added R-31, a diagnosis-gated recovery candidate that appears only after a D-08 target miss has a
  retained SEM/EDS diagnosis. It preserves stoichiometric CaTiO₃ while raising the thermal program from
  900 °C / 6 h to 990 °C / 4 h to test incomplete conversion without changing composition at the same time.
- Added a governed 24.00 g preparation program (13.35 g CaCO₃ + 10.65 g TiO₂), R31-990-4H furnace
  profile, candidate-specific XRD pattern, 96.6 ± 0.8% prediction, and 96.2% simulated qualified result.
- Changed the terminal diagnosis command from a generic next-campaign reset to `PROPOSE RECOVERY RUN`;
  the new run is preselected as R-31 and its message explains the controlled hypothesis test.
- Visually separated the amber mechanism-derived candidate from the green history-derived A-29 slot,
  so the player can distinguish a causal follow-up from a general adaptive proposal.
- Browser-verified RUN-046 / D-08 diagnosis unlocking the fifth candidate, the transition to RUN-047 /
  R-31, its 990 °C / 4 h / 96.6% envelope, and the physical PREP-01 record with the two correct precursor
  lots and mass values.

## Critique 67: the campaign lived inside an overlay instead of owning the lab

The active 3D station and campaign control could show RUN-047 / R-31 while the permanent work order,
checklist, and lineage rail still described WO-2841, LOT-91, and BC-184. That split made the interface
feel like a demo layered on a dashboard rather than one persistent laboratory world.

### Changes

- Made the lab shell campaign-aware: the permanent work order now carries the live run, formulation,
  temperature, dwell, progress, and seven physical gates from preparation through mechanism testing.
- Replaced the stale incident checklist during a campaign with stage-sensitive technician tasks. The
  active task opens campaign control directly, while completed and pending states follow the governed
  route rather than an unrelated scenario phase.
- Turned the lineage card into a live state machine: precursor recipe → prepared sample → carrier,
  carrier → thermal specimen → furnace profile, thermal specimen → XRD dataset → pattern, and finally
  specimen → representative SEM / EDS evidence.
- Removed two local-storage hydration mismatches by subscribing to campaign state as an external store
  and deriving the initial station only after the client campaign snapshot is available. Reloading an
  in-progress run no longer opens an error overlay or briefly claims the wrong station.
- Browser-verified the persisted RUN-047 / R-31 preparation state at desktop and 390 × 844: work order,
  3D station, inspector, AI loop, and sample lineage all show the same run identity and material route.

## Critique 68: every replay had the same operational world state

New recipes and run identifiers still encountered RUN-039, a 62-minute furnace wait, an 18-minute
robot recovery, and a +0.01° silicon result. The science changed, but the operating environment
repeated exactly, so subsequent campaigns felt scripted rather than scheduled inside a live lab.

### Changes

- Added a deterministic run-operations profile. Each run now receives a reproducible active-furnace
  owner, capacity wait, robot-recovery duration, reference age, and qualified silicon result.
- Propagated those operating conditions through campaign routing, the equipment schedule, shell task
  notes, station inspector, 3D walkaround observations, native furnace and XRD consoles, elapsed lab
  time, event messages, and shortcut-rejection feedback.
- Kept the values bounded by the same governed controls: the queue still cannot violate another run's
  thermal profile, the robot still requires a cleanliness witness, and each generated silicon result
  remains inside the ±0.05° 2θ acceptance band.
- Browser-verified RUN-047 as a distinct world state: FURN-04 is occupied by RUN-043, the campaign
  checklist reports a 60-minute capacity wait, and the route schedule carries those identities without
  changing R-31's scientific formulation or evidence chain.

## Critique 69: bottlenecks could be observed but never strategically changed

The campaign exposed furnace capacity and queue delay, but the player could only wait. That taught
incident response, not the facility-building tradeoff that makes an operations game replayable.

### Changes

- Added a persistent thermal-bay configuration decision inside campaign control. Before furnace
  allocation closes, the player can spend 120 research points and 48 simulated minutes to commission
  FURN-04's independent auxiliary chamber.
- Grounded commissioning in equipment evidence rather than a cosmetic upgrade: chamber B requires an
  empty cycle, a nine-point uniformity survey, independent temperature control, and retained IQ / OQ.
- Changed the campaign schedule and route after commissioning. RUN-043 remains governed in chamber A,
  while RUN-047 routes to qualified chamber B through a 9-minute readiness gate; the projected thermal
  rate changes from 0.17 to 0.31 runs per hour.
- Propagated the chosen configuration through persisted campaign state, elapsed time and insight,
  checklist delay, station view, native furnace sequence, event narrative, and subsequent campaigns.
- Rebuilt the 3D furnace as a visibly dual-chamber cabinet after commissioning: chamber A remains hot
  and occupied while chamber B is separately indicated as qualified and ready. Desktop focus view and
  the 390 × 844 campaign layout were visually checked after the live upgrade.

## Critique 70: commissioning was still a single abstract button

The facility decision changed real state, but one click claimed that an empty cycle, uniformity survey,
and qualification record all existed. That contradicted the simulator's strongest principle: physical
and measurement evidence should be operated, inspected, and retained by the player.

### Changes

- Replaced instant commissioning with a dedicated FURN-04B IQ / OQ workbench. The player must isolate
  chamber B without disturbing chamber A, prove physical emptiness and the door chain, run a 990 °C
  empty cycle, and retain a nine-point thermal-uniformity survey in order.
- Added a live dual-chamber visualization, ramp / dwell / cool trace, all nine measured temperatures,
  989.5 °C mean, 7.4 °C span, and an explicit ≤ 8.0 °C acceptance limit.
- Added an unsafe shortcut that attempts to copy chamber A's calibration. The workflow blocks it and
  explains that one chamber's calibration cannot prove the other's controller accuracy or uniformity.
- Kept commissioning effects behind the final evidence gate: research points, elapsed time, throughput,
  route assignment, and the 3D asset change only after the IQ / OQ record is accepted.
- Added a persistent read-only qualification view after commissioning, and visually checked the full
  record at desktop and 390 × 844 widths with its stacked mobile control sequence.

## Critique 71: the upgraded furnace existed in geometry but not in the asset system

After Chamber B passed IQ / OQ, the campaign route and 3D cabinet recognized the new capacity, but
the ordinary station inspector and CMMS still described a single box furnace. That made the expansion
feel like a campaign modifier instead of a persistent, governed change to the laboratory.

### Changes

- Made the dual-chamber configuration a facility-level station state. The lab inspector now reports
  Chamber A's live owner, Chamber B's qualified state, its measured 7.4 °C uniformity span, and the
  retained IQ / OQ record even when the current campaign is working at another station.
- Rebuilt the local furnace mimic as two independently indicated chambers: the occupied hot Chamber A
  and the qualified, cool Chamber B remain visibly distinct outside the commissioning workflow.
- Added a configuration-specific console session and asset controller identity so commissioning evidence
  cannot be confused with the original single-chamber record or a transient campaign execution.
- Added an auditable CMMS qualification record for FURN-04B with the 990 °C OQ cycle, nine-point mean,
  span-versus-limit decision, locked record ID, and next 180-day uniformity verification.
- Updated local-console naming and accessibility context to follow the configured asset rather than the
  original base catalog entry.

## Critique 72: equipment capacity existed without material availability

The player could qualify new furnace capacity, but every run still assumed that clean crucibles, prep
liners, and microscopy consumables would appear on demand. That removed a major laboratory operations
constraint and made repeated campaigns less like running a physical facility.

### Changes

- Added persistent point-of-use inventory for alumina crucibles, sealed prep liners, and conductive
  carbon tabs. Releasing a governed run now reserves six crucibles and one liner by lot; routing a
  valid-negative result to SEM reserves a conductive tab.
- Added real execution gates. A run cannot leave the planning state without sufficient clean ware, and
  microscopy cannot begin without a released mounting consumable; both blocks route the player to the
  physical replenishment workflow instead of silently manufacturing stock.
- Added a visual material-staging workbench with shaped bins, live/projected fill states, lot IDs,
  capacity bars, a three-stage material flow, and a compact low-stock indicator in campaign control.
- Made replenishment operable: scan the move tote and destination, reconcile three lots and quantities,
  inspect packaging and locations, then retain the receipt before counts change. An unscanned-receipt
  shortcut is blocked because visually plausible stock can still carry the wrong identity or expiry.
- Persisted inventory between campaigns and attached a 26-minute / 35-RP operations tradeoff, creating
  a second player-controlled bottleneck alongside furnace capacity without turning the main lab view
  into an inventory spreadsheet.

## Critique 73: consumables affected the game but had no place in the lab

The inventory system introduced real execution pressure, yet the digital twin still showed the same
static staging shelf regardless of stock. The player could replenish material without seeing the
physical point-of-use location change.

### Changes

- Propagated persistent inventory into the 3D scene and rebuilt the existing staging rack around the
  governed consumables: visible alumina crucibles, sealed liner packs, and conductive-tab cases now
  scale with the actual available counts.
- Added a physical amber receiving tote when any point-of-use material is below its next-execution
  threshold; after a retained replenishment receipt, the tote clears and the rack visibly fills.
- Added a rack beacon and a compact spatial HUD when PREP-01 is selected, carrying the same stock counts
  and low/ready state as campaign control without covering the equipment view.
- Kept the rack as part of the walkable scene rather than inventing another abstract station, preserving
  the relationship between receiving, storage, preparation, and the technician's aisle.

## Critique 74: the physical stock rack was still scenery

The changing rack finally gave inventory a place in the digital twin, but the player still had to leave
the lab view and rediscover material staging in campaign control. Instruments could be approached and
operated in place; consumables could not.

### Changes

- Made the 3D stock rack an interactive scene object with pointer feedback. Selecting it leaves the
  immersive aisle safely and opens the exact point-of-use receipt workflow for the current campaign.
- Turned the rack state HUD into a compact in-world control showing live counts and an explicit operate
  affordance, with keyboard focus styling and amber low-stock behavior.
- Added a dedicated material-staging route through the application shell so entering from the floor
  opens the receipt workbench immediately rather than dropping the technician at campaign overview.
- Preserved spatial context by selecting PREP-01 during the handoff; closing the workflow returns the
  player to the same lab and campaign state.

## Critique 75: robot motion did not express the operation

The robot arm was visually detailed and animated, but a cleanliness recovery and a six-position dosing
run produced the same generic sweep. The player still needed text to understand what the cell was doing.

### Changes

- Added campaign-aware robot motion states. Cleanliness recovery now places the arm at a dedicated
  witness dock with a restrained inspection motion; dosing indexes deliberately across six carrier
  positions; ordinary transfer retains the broader cell motion; inactive equipment settles to home.
- Added physical cell fixtures: a six-crucible carrier, ceramic ware, a gripper witness station, stateful
  clean/attention illumination, and a powder stream that moves between the active dose positions.
- Bound gripper proof from the native HMI back into the 3D witness dock and arm indicator so the physical
  scene visibly clears as technician evidence is completed.
- Preserved safeguards and focus transparency while making the campaign stage—not decorative animation—
  own the robot pose and material state.

## Critique 76: repeat campaigns replayed the same faults

Campaign recipes, queue times, and results varied, but every run still encountered a gripper
contamination hold and an aged XRD reference. The simulation taught two useful failures while making
the laboratory feel scripted rather than like a shift with changing equipment conditions.

### Changes

- Added deterministic run conditions across three robot states—nominal readiness, grip-force drift,
  and contamination—and three XRD-control states—current, trend review, and age due. Adjacent runs now
  produce different operating work without relying on random state the player cannot reproduce.
- Propagated each condition through the 3D station label and beacon, physical walkaround observations,
  local HMI sequence, LES method context, LIMS chain state, campaign route, technician checklist, and
  shift action card. A nominal check is shown as active work, not falsely styled as a fault.
- Made the HMI work technically distinct: contamination requires cleaning plus a coupon, grip drift
  requires jaw-pad inspection plus a force witness, and nominal setup requires tool identity plus a
  carrier handshake. XRD similarly distinguishes reviewing a current control, confirming a trend, and
  acquiring a fully due reference.
- Varied operational consequences: nominal setup carries no insight penalty, force verification costs
  less than contamination recovery, and elapsed time follows the actual condition. Unsafe bypass
  feedback now explains the specific consequence—contamination ambiguity or a dropped/misdosed carrier.
- Kept RUN-047 on its established contamination and 13-hour reference-due branch, then exercised that
  route through robot dosing, dual-furnace readiness, the thermal profile, the 3D XRD walkaround, and
  the native four-step reference-control console.

## Critique 77: the scientist could not author an experiment

The campaign connected AI proposals to physical execution, but the player could only choose from a
fixed candidate tray. That made the lab feel like a procedural trainer when the intended game also
needs to support scientists forming and testing their own materials hypotheses.

### Changes

- Added a full-screen scientist formulation workbench with a luminous perovskite lattice, visible
  A/B-site substitution, a governed thermal-profile preview, and four compact controls for Ca excess,
  Zr substitution, calcination temperature, and dwell time.
- Made every authored combination reproducible rather than random. A compact candidate ID encodes the
  four parameter choices and regenerates the formula, model prior, uncertainty, thermal occupancy,
  throughput, predicted and measured phase fraction, objective gap, insight reward, and design-space
  point wherever the candidate is later read.
- Retained authored candidates as a persistent fourth tray slot. They can be selected, archived, and
  re-run alongside AI and mechanism candidates, and their prior/result points participate in the same
  campaign memory rather than opening a disconnected minigame.
- Generated a mass-balanced precursor program for user formulations. The isolated browser run carried
  U-2121 from the composer through campaign release, 3D PREP-01 walkaround, station inspector, and the
  native balance record with distinct CaCO₃, TiO₂, and ZrO₂ lot masses totaling 24.00 g.

## Critique 78: saved campaign state could disagree during hydration

Returning from the isolated composer test exposed a server/client mismatch: station consoles read
local storage during their initial client render while the server emitted the default campaign. The
shift recovered, but a development error overlay appeared on a cold reload.

### Changes

- Made every station console begin from the same deterministic server defaults, then hydrate the saved
  campaign after mount before responding to later campaign events.
- Preserved RUN-047, station selection, and its XRD reference-due state across a cold reload without a
  hydration warning, duplicate console, or stale default workcell state.

## Critique 79: every experiment served the same purity objective

The formulation workbench expanded the scientific choices, but every run was still judged only on
whether target phase exceeded 96%. Temperature and furnace duration affected operations without giving
the scientist a reason to trade a little purity for lower energy or higher throughput.

### Changes

- Added three selectable scientific missions before release: phase purity (≥96.0%), a low-energy route
  (≥94.5% at ≤950 °C), and a fast campaign (≥95.5% with ≤360 minutes thermal occupancy). Mission choice
  locks when material is issued so the success criterion cannot be changed after seeing the result.
- Added a compact mission rail to campaign control with live objective text and persistent selection,
  keeping the new strategy visible without adding another document-style screen.
- Centralized mission evaluation so candidate results, history points, campaign messages, the shift
  work order, checklist, 3D room beacon, station inspector, XRD workbench, LES method, and LIMS chain all
  agree on the same pass or miss.
- Distinguished a scientific mission miss from a characterization failure. Valid XRD evidence is still
  retained; SEM/EDS is offered only when the phase floor itself is missed, not when an otherwise good
  composition merely exceeds an energy or occupancy constraint.
- Exercised the low-energy mission with D-08 in an isolated fresh campaign: the UI changed the governed
  objective to ≥94.5% / ≤950 °C while retaining its 900 °C, six-hour process and 480-minute physical
  furnace demand for the eventual multi-constraint result.

## Critique 80: mission selection still required hidden arithmetic

The mission rail created real tradeoffs, but candidate cards still showed only a point prediction. A
player had to remember every threshold, subtract the uncertainty mentally, and inspect process details
elsewhere to judge whether a proposal was a credible mission fit.

### Changes

- Added a prospective mission forecast that uses the model prediction, uncertainty interval, calcination
  temperature, and true furnace occupancy while keeping the deterministic measured outcome hidden.
- Classified each unrun candidate as a robust fit, model-edge choice, phase risk, temperature risk, or
  time risk. Completed candidates keep their historical pass/miss under the mission they actually ran;
  they are never silently rejudged when a later mission changes.
- Added tiny telemetry badges to the candidate tray and a mission-forecast strip under the selected
  synthesis envelope. The compact green/amber/red language makes tradeoffs scannable without turning
  experiment design into a tutorial page.
- Verified mission-dependent behavior in a clean production campaign: C-42 and Z-17 became temperature
  risks under the low-energy mission, while D-08 became a model-edge option because its 900 °C route
  passes the hard energy constraint but its confidence interval crosses the phase floor.

## Critique 81: the campaign still operated one run at a time

The route board made one experiment feel operationally credible, but a real scientist or technician
works against a shift backlog. Furnace demand, characterization load, and mission priorities only
become strategic when several experiments are competing for the same equipment.

### Changes

- Added three persistent unreleased planning slots. Any candidate—including a scientist-authored one—
  can be queued with its current scientific mission without consuming material or claiming equipment.
- Added live backlog capacity telemetry for aggregate thermal minutes, XRD minutes, qualified furnace
  lanes, and a visible congestion signal. This turns the optional second furnace chamber into a
  planning decision as well as an isolated wait-time upgrade.
- Added compact earlier/later/remove controls and automatic run-number reconciliation. Reprioritizing
  a plan preserves candidate and mission identity while making the next experiment explicit.
- Connected archive to backlog promotion: the next planned candidate and its original mission load
  automatically into the following governed run; remaining plans advance without breaking run IDs.
  Mechanism-recovery runs still take priority and shift the unreleased backlog safely.
- Exercised a mixed three-run shift in production preview—D-08 energy, C-42 purity, and Z-17 rate—then
  reordered Z-17 ahead of C-42. The board retained the correct missions, recomputed RUN-043 through
  RUN-045, and exposed 1,170 minutes of thermal demand against one qualified lane as furnace congestion.

## Critique 82: the planned shift disappeared outside campaign control

Backlog planning was operationally useful, but closing campaign control made those future experiments
vanish from the laboratory. A physical lab has WIP racks, traveler packets, labeled carriers, and a
visible queue; technicians should be able to notice congestion while walking the floor.

### Changes

- Added a three-position stainless WIP rack to the 3D lab, with physical traveler boxes, mission-colored
  identity bars, status beacons, empty-slot states, a rack sign, and a congestion-colored floor boundary.
- Propagated persistent backlog identity through the shared campaign snapshot into the spatial twin,
  so reprioritized candidate/mission plans change the physical rack without reopening a separate screen.
- Added a compact operable backlog HUD to the lab view. It reports plan count and aggregate furnace
  demand, safely exits immersive mode, and opens the same campaign-planning surface from the floor.
- The first browser pass exposed a clipped projected label and unreliable activation near the canvas
  edge. The rack was moved inward, the clipped label was removed, and interaction was separated into
  a stable scene HUD. The corrected control opened campaign planning successfully in production QA.

## Critique 83: instrument consoles ignored future work

The physical WIP rack made the backlog visible on the floor, but the actual furnace and diffractometer
still behaved as if only the active carrier existed. Utilization belongs near the machine state because
that is where a technician decides whether a queue, service action, or handoff is becoming risky.

### Changes

- Propagated the planned-run array into native station sessions with deterministic hydration and live
  campaign-event updates. Every active console status bar now reports the unreleased backlog count.
- Added a compact equipment-native queue strip to the furnace HMI. It carries the next three run IDs,
  candidate IDs, individual thermal occupancy, setpoint, aggregate load, and lane-aware pressure state.
- Added the same governed handoff pattern to XRD with the planned run IDs and 18-minute powder-scan
  demand, so characterization load is visible before specimens reach the instrument.
- Ran a full queued experiment from plan release through PREP-01, nominal robot readiness, six-position
  dosing, and the FURN-04 physical walkaround. The resulting native furnace HMI showed RUN-043 D-08,
  RUN-044 Z-17, and RUN-045 C-42 above the live RUN-040 occupancy / RUN-042 Q01 mimic, with 1,170 minutes
  correctly flagged as load pressure. The new strip remained visually subordinate to the equipment.

## Critique 84: backlog pressure was visible but not actionable

The new utilization cues showed exactly where the bottleneck was, yet the player could only drag plans
manually or buy more capacity. A real dispatch decision can improve flow without changing chemistry,
and the simulation should quantify that tradeoff rather than simply decorate the queue.

### Changes

- Added lane-aware thermal scheduling. The planner now simulates list scheduling across one or two
  qualified chambers and reports mean completion time in addition to aggregate furnace and XRD load.
- Added two governed resequencing actions: shortest thermal duration first and lowest setpoint first.
  Both preserve each candidate, mission, and unreleased material state, reissue future run numbers,
  retain a dispatch message, and consume four minutes of real planning time.
- Kept the manual earlier/later controls for scientific priority overrides; automated dispatch remains
  a transparent suggestion rather than an opaque optimizer.
- Tested shortest-duration dispatch while RUN-042 was physically held behind RUN-040. Z-17 and C-42
  moved ahead of the six-hour D-08 route, lowering mean furnace completion from 820 to 730 minutes while
  total thermal demand remained 1,170 minutes. The lab clock advanced by four minutes and the active
  carrier, mission, queue hold, and instrument state were unchanged.

## Critique 85: the thermal route always assumed a healthy furnace

The queue made furnace capacity credible, but once a slot opened every load followed the same flawless
start. That hid the equipment-condition work that often separates a trustworthy thermal history from a
plausible-looking but invalid result.

### Changes

- Added deterministic nominal, witness-thermocouple-drift, and door-seal conditions. The campaign rail,
  spatial twin, station inspector, route board, and action language now agree on the actual start hold.
- Added condition-specific physical observations and native recovery sequences: controller-offset plus
  independent overtemperature proof for thermocouple drift, and gasket/latch plus door-chain proof for
  seal nonuniformity. LES, SCADA, and CMMS context use the same condition evidence.
- Added a fault-shaped thermal trace, distinct HMI evidence cards, and explicit retained-recovery state.
  Recovery minutes are added to the real campaign clock before the governed profile duration, so poor
  equipment condition can turn an otherwise credible rate experiment into a mission miss.
- Corrected the queue transition so an available chamber no longer claims the profile is already active.
  The loaded specimen remains visibly held until condition recovery and the final start command pass.
- Exercised RUN-042 from the 37-minute Q01 hold through a +11.8 °C witness bias. The four-step recovery
  consumed 16 minutes, retained independent overtemperature proof, completed the 330-minute thermal
  cycle, and reached XRD at +417 campaign minutes with all material identity and backlog state intact.

## Critique 86: furnace faults lived in labels, not on the machine

The new recovery logic was scientifically coherent, but the first visual pass still showed the same
bright, apparently active chamber for every condition. A player walking the aisle should notice a loaded
but inhibited furnace and at least one physical clue before reading the station inspector.

### Changes

- Made stage-five furnace loads visibly cold-held rather than falsely glowing like an active 1,020 °C
  cycle. The amber chamber light is now deliberately subdued until the governed profile starts.
- Added a stainless witness thermocouple, illuminated connector, routed signal lead, and controller
  indication for the drift path. Applying the qualified offset changes both the probe and controller cue
  from amber to green while preserving the original bias as evidence in the HMI.
- Added a condition-sensitive door perimeter, hotter upper-seal witness, and visibly misaligned latch for
  the seal-loss path. Latch adjustment changes the physical handle proof independently of the door chain.
- Added real hinge hardware and an exhaust stack to improve the box-furnace silhouette even outside a
  fault. Browser QA caught an implausible signal lead running upward into the ceiling; it was rerouted
  down the door toward the local controller before the build was accepted.
- Replayed RUN-042 from a clean origin through preparation, robot setup, six-position dosing, queue
  release, and the thermocouple hold. The campaign control, physical asset, inspection observations, and
  local HMI all showed the same +11.8 °C condition and 16-minute recovery requirement.

## Critique 87: the furnace condition had no tempting wrong decision

The recovery path was realistic once opened, but campaign control only offered the correct action. That
made the fault a checklist instead of an operational judgment and concealed why a healthy-looking primary
controller is insufficient evidence.

### Changes

- Added a condition-specific shortcut beside the governed recovery action. Thermocouple drift tempts the
  player to start on controller PV alone; seal loss tempts them to accept closed-door feedback as proof.
- The safety system rejects either command for the right physical reason. OT-04 independence blocks the
  biased witness path, while the seal path explains why a closed limit switch cannot establish thermal
  uniformity across the hot zone.
- A rejected command retains the cold hold and every sample identity, but costs two campaign minutes.
  This turns an incorrect decision into visible schedule damage without simulating an implausible bypass
  of an engineered protective layer.
- Verified the RUN-042 branch in browser: the clock advanced from +67 to +69 minutes, the route remained
  on TC OFFSET HOLD, and the event message identified the failed OT-04 permissive before recovery remained
  available.

## Critique 88: the rate mission ignored every operational bottleneck

The mission claimed to reward a fast campaign, yet it judged only nominal furnace occupancy. Queue time,
robot setup, furnace recovery, XRD acquisition, and even a rejected operator command could never change
the outcome. That contradicted the visible lab clock and made capacity decisions scientifically irrelevant.

### Changes

- Redefined the rate mission as a qualified release-to-result cycle: at least 95.5% target phase within
  420 minutes. The prospective AI forecast uses a transparent 48-minute nominal handling/measurement
  allowance plus furnace occupancy; the final judgment uses the retained actual campaign timestamp.
- Stored and propagated the immutable result timestamp independently of later microscopy time. Campaign
  control, the shift checklist, station inspector, 3D carrier label, native XRD HMI, LIMS state, and AI
  planner now evaluate the same historical cycle rather than recomputing against the current clock.
- Kept scientific and operational uncertainty distinct: a candidate can remain a credible model-edge
  composition while its actual experiment is a valid mission miss because equipment availability or
  recovery consumed the time margin.
- Replayed the complete Z-17 rate experiment with a 37-minute queue, 16-minute thermocouple recovery,
  one rejected two-minute start attempt, 330-minute profile, and governed XRD acquisition. The retained
  result was 96.7% at 433 minutes: composition passed, cycle missed by 13 minutes. Every result surface
  reported the same valid miss after a follow-up QA pass corrected one stale “target met” planner label.

## Critique 89: an actual cycle miss still had no loss explanation

The corrected rate mission finally responded to real operating delays, but its result surface reduced a
433-minute experiment to a single “+13 min” gap. A technician could not see whether the constraint was
thermal chemistry, queueing, equipment recovery, or an avoidable decision without reconstructing the
entire event history.

### Changes

- Added a retained release-to-result loss budget to completed rate campaigns. Prep and robot handling,
  furnace queue, condition recovery, governed thermal time, XRD acquisition, and operator-decision loss
  are rendered as distinct segments rather than another text paragraph.
- Placed the 420-minute mission boundary directly on the time bar and report either remaining margin or
  overrun. The breakdown always uses the immutable result timestamp, so later diagnosis cannot rewrite
  the historical bottleneck analysis.
- Reconciled the budget against both faulted and healthy operations. The RUN-042 miss resolves to 30 min
  handling, 37 min queue, 16 min recovery, 330 min thermal, 18 min XRD, and 2 min decision loss: 433 min
  total. A fresh dual-chamber RUN-048 replay resolved to 30 + 14 + 4 + 330 + 18 = 396 minutes, visibly
  crossing the same target with 24 minutes of margin.
- Corrected the AI experiment-loop cursor so a retained XRD result moves from MEASURE to LEARN. Browser
  QA replayed preparation, robot dosing, furnace-lane qualification, thermal execution, and XRD release;
  the local HMIs, campaign result, planner state, and new loss budget all agreed on the 396-minute result.

## Critique 90: bottleneck analysis was retrospective, not playable

The loss budget explained a missed rate target but stopped at diagnosis. It still asked the player to
mentally infer whether another furnace lane would matter, and it offered no governed way to invest in
that change after learning from a completed run.

### Changes

- Added a capacity counterfactual beneath every retained rate result. It substitutes the deterministic
  queue for the alternate furnace configuration while holding the measured material, recovery, thermal
  profile, XRD acquisition, and decision history constant.
- The healthy dual-chamber replay now proves its operational value: removing FURN-04B changes RUN-048
  from 396 to 428 minutes and flips a 24-minute margin into an 8-minute miss. The faulted single-chamber
  replay shows the inverse: qualifying FURN-04B changes RUN-042 from 433 to 407 minutes and would recover
  the mission without pretending the original experiment was faster.
- Made that analysis actionable. A player can spend 120 research points and 48 post-run minutes to
  schedule an empty cycle and nine-point uniformity survey for the next campaign. The current result and
  its route remain immutable; the auxiliary lane activates only when the next experiment is started.
- Snapshotted the qualified chamber count and complete cycle decomposition into every newly retained
  result. Post-result plant changes can no longer mutate historical queue, recovery, or decision losses.
- Browser QA exercised the miss path, scheduled the qualification, and caught a contradictory
  “commissioning window closed” label elsewhere in the same panel. The thermal-bay card now shows the
  post-run work as scheduled consistently in its chamber, qualification, header, and command states.

## Critique 91: a compound failure exposed cross-system vocabulary drift

RUN-043 combined a robot grip-force witness, an already-qualified auxiliary furnace lane, a door-seal
loss, and an overdue XRD control. The equipment screens were visually convincing, but the AI rail called
the force check a cleanliness witness and described the auxiliary lane as a capacity-one queue. The
furnace HMI also asked to “qualify” a chamber whose IQ/OQ record had already been retained.

### Changes

- Made the AI experiment gate derive its wording from the same deterministic operations state as the
  equipment. It now distinguishes jaw-force, gripper cleanliness, nominal tooling, capacity-one queue,
  qualified-lane readiness, overdue reference, trend confirmation, and current-control review.
- Changed repeated auxiliary-furnace operation from “qualification” to start-readiness. The chamber now
  presents IQ/OQ as retained evidence, then asks for its independent thermocouple and pre-start survey
  before routing the new carrier.
- Replaced generic furnace walkaround markers with condition-specific physical checks. A seal-loss run
  now places GASKET, LATCH, and DOOR CHAIN markers on the machine; a thermocouple-drift run exposes
  WITNESS TC, CONTROLLER, and OVERTEMP. Observations explain why closed feedback or a stable primary PV
  cannot prove the missing physical condition.
- Moved the gasket marker onto the visibly hot upper perimeter, aligning the interactive evidence with
  the amber seal-loss cue and misaligned compression handle in the 3D asset.
- Replayed the full compound run after the FURN-04B upgrade: jaw-force recovery, 16-minute lane-B gate,
  21-minute seal recovery, a rejected closed-feedback shortcut, 330-minute thermal profile, and overdue
  Si control. The retained result was 96.7% at 424 minutes. Its immutable budget reconciled to 37 min
  handling, 16 min queue, 21 min recovery, 330 min thermal, 18 min XRD, and 2 min decision loss.

## Critique 92: authored materials inherited a stock diffraction pattern

The formulation composer let a scientist choose Ca excess, Zr substitution, calcination temperature,
and dwell, but the eventual XRD console fell back to the same Ca-rich trace for every custom recipe.
That broke the most important feedback loop: changing chemistry did not visibly change evidence.

### Changes

- Added procedural diffraction patterns for scientist-authored candidates. Zr substitution shifts the
  perovskite reflections to lower 2θ, while Ca imbalance introduces secondary reflections scaled by the
  simulated impurity fraction.
- Added anatase-like minor reflections for low-temperature or short-dwell routes and a high-angle
  dopant-sensitive reflection. The established campaign candidates keep their retained reference traces;
  only user-authored recipes are derived from their recorded composition and process parameters.
- Replayed the full U-2121 route from the scientist workbench through powder preparation, contamination
  recovery, six-position robot dosing, qualified furnace-B readiness, the 1,000 °C / 3.5 h program, and
  current-control XRD acquisition. Its console showed a distinct multi-peak pattern and retained 96.5%
  target phase at a 402-minute release-to-result cycle.
- Corrected one remaining lineage sentence that described a dual-chamber run as waiting for a
  single-capacity furnace. The live lineage now names the assigned qualified lane and its readiness proof.

## Critique 93: custom evidence still dead-ended at “learn”

U-2121 produced distinct evidence and a retained positive residual, but LEARN was only a status label.
The player still had to leave the result, reopen the composer, and remember which mission lever to change.

### Changes

- Added an authored-material posterior panel that compares model prior and measured phase fraction on a
  normalized 90–100% axis, retains the residual, and shows uncertainty contraction from one qualified
  observation.
- Generate a mission-specific next recipe without mutating the completed result: shorter dwell for rate,
  lower setpoint for energy, and longer dwell for purity. The proposal exposes its recipe ID, governed
  thermal program, prior, and uncertainty before the player commits it.
- Let the player queue that follow-up directly into the unreleased backlog. Archiving the result promotes
  the planned custom recipe into the next run while preserving its full encoded composition, even though
  it was not the custom candidate displayed during the previous experiment.
- Exercised U-2121’s +0.6 percentage-point residual into U-2120, a 1,000 °C / 2.5 h rate experiment.
  The plan entered the backlog as RUN-045, then promoted into campaign control with the correct custom
  formula and 270-minute furnace occupancy.
- Browser QA caught a percent-string parsing error that rendered the first residual as NaN and collapsed
  its posterior markers. Numeric parsing now handles displayed percent units explicitly.

## Critique 94: the learning policy and loss bar confused different constraints

The first rate follow-up shortened dwell correctly, but a policy that always shortens dwell would either
stop at the minimum or keep ignoring a lost phase floor. Its 331-minute result also exposed a separate
display error: because the overall mission failed, the cycle bar mislabeled an 89-minute time margin as
an overrun.

### Changes

- Made authored follow-ups outcome-aware. A rate result that clears the phase floor explores shorter
  dwell; a shortened route that misses phase instead steps Zr chemistry, then restores thermal dose if
  the composition boundary is exhausted. Energy and purity routes likewise change direction when their
  scientific floor is not met.
- Replayed U-2120 through its 1,000 °C / 2.5 h route. The result was fast at 331 minutes but measured
  95.3%, missing the rate mission’s phase floor by 0.2 percentage points. The posterior correctly changed
  its next lever from SHORTER DWELL to INCREASE ZR and proposed U-2220 at the same thermal occupancy.
- Separated the cycle-time verdict from the composite mission verdict. A phase-limited miss now keeps a
  green 89-minute time margin while the result and model gate remain amber on phase; only an actual cycle
  overrun marks the loss budget as over target.
- Clarified that uncertainty contraction belongs to the measured current point. The untested follow-up
  keeps its own wider prior rather than implying that one observation eliminated uncertainty everywhere
  in the nearby design space.

## Critique 95: reload preserved results but erased the operator audit trail

Campaign state and retained evidence survived reloads, while the event ledger returned to three tutorial
entries. That created an impossible lab state: a qualified result with no durable record of the physical
checks, control actions, failed shortcuts, or planning decisions that produced it.

### Changes

- Persist the XRD/campaign event ledger independently from the active run, bounded to the latest 80
  entries. Reload restores both event text and the shift clock from the latest retained timestamp.
- Added campaign-control decisions to the same event stream as station operations. Candidate releases,
  inventory receipts, rejected shortcuts, capacity qualification, dispatch changes, and AI-generated
  follow-up queues now become chronological campaign events rather than transient panel messages.
- Kept replay behavior explicit: replaying the original guided incident clears its ledger, while normal
  navigation, reload, and multi-run campaign work preserve it.
- Verified persistence by queuing U-2220 from the U-2120 result. The ledger advanced from three to four
  events, recorded the follow-up and immutable source result at 08:17, then reloaded with all four entries
  intact.

## Critique 96: a marginal XRD miss offered actions without a scientific decision

The completed U-2120 result exposed both ROUTE TO SEM / EDS and START NEXT CAMPAIGN as footer buttons.
Those controls were individually valid, but they hid the central research decision: pay for more evidence
or accept model risk and make another material.

### Changes

- Added a visual post-result evidence gate for qualified custom results below their phase floor. A retained
  specimen sits between two explicit routes: correlated SEM / EDS microscopy or the model-authored next
  synthesis.
- Made the routes consequential. Microscopy consumes one conductive tab and 26 shift minutes to obtain a
  mechanism hypothesis; direct synthesis consumes no current shift time but commits the unverified model
  lever and six clean crucibles at its next material issue.
- Blocked campaign rollover until the scientist chooses an evidence route. The model panel generates a
  candidate but no longer queues it implicitly; the scientist owns the commit decision.
- Kept backward compatibility for retained campaigns that had already queued a follow-up before the gate
  existed, treating that backlog commitment as the selected direct-synthesis route.
- Browser QA covered both the uncommitted fork and the direct-synthesis state. The new micrograph and
  lattice previews remain equipment-like and legible without adding another paragraph-heavy modal.

## Critique 97: microscopy evidence did not change the proposed chemistry

The diagnostic branch ran correctly but revealed a scientific contradiction. SEM / EDS assigned Ca-rich
secondary grains, while the mission-only throughput policy still proposed increasing Zr. Paying for
mechanism evidence had no effect on the experiment policy.

### Changes

- Added evidence priority to custom follow-up design. Ca-rich secondary grains now reduce Ca excess by one
  governed formulation step; Ti-rich cores extend dwell to test incomplete conversion. Mission-only rate,
  energy, and purity policies remain the fallback when microscopy is absent.
- Verified the policy independently at the recipe boundary: U-2120 produces model-only U-2220, Ca-rich
  evidence produces U-1120, and Ti-rich evidence produces U-2121.
- Labeled diagnosed posteriors as SEM / EDS-informed evidence updates and retain the representative phase
  map as the next formulation's mechanism basis.
- Exercised the entire diagnostic route in the browser: enter SEM-01 through the 3D walkaround, inspect the
  chamber, column, and BSE/EDS detectors, establish vacuum, acquire four representative BSE fields, retain
  the EDS map, attest safe state, and return the diagnosis to campaign control.
- Verified that the diagnosis consumes the carbon tab, adds the 26-minute microscopy cycle, retains
  `Ca-rich secondary grains` as a hypothesis rather than proof, and unlocks a governed next experiment.

## Critique 98: the next recipe lost its experimental rationale at release

After a model or evidence-informed follow-up became the active run, campaign control showed the new
formulation but no longer made the comparison to its parent explicit. A technician could execute it, yet
the scientist could not quickly verify that only the intended factor changed.

### Changes

- Added a controlled-experiment contract directly above the live equipment route for linked custom runs.
  It retains the parent and current recipe IDs, distinguishes model residual from SEM / EDS evidence, and
  exposes the changed factor before release.
- Display the unchanged formulation and process factors as held constants. The U-2120 → U-2220 replay,
  for example, shows Zr 2% → 4% while Ca excess, 1,000 °C setpoint, and 2.5-hour dwell remain fixed.
- Added an expected readout tied to the selected lever and a result-state phase response after XRD. The
  contract survives every station handoff rather than living only in the model panel.
- Replayed RUN-046 from release through PREP-01, a ROBO-02 force-witness recovery, six-position dosing,
  FURN-04B assignment, an independent-thermocouple offset recovery, the governed thermal profile, and a
  current-control XRD acquisition. U-2220 passed at 95.5% in 354 minutes and retained a +0.2 percentage-
  point response against U-2120.

## Critique 99: one successful run was treated as a finished optimization

At the minimum dwell, the mission-aware policy had no shorter thermal step left. It responded to a rate
pass by extending dwell, sacrificing throughput without a stated scientific objective. More importantly,
one boundary result at exactly 95.5% is not a robust qualification.

### Changes

- Stop proposing a process change when a throughput candidate meets the phase floor at the minimum dwell.
  The recipe policy now returns a confirmation requirement rather than inventing a worse optimization.
- Added a visual reproducibility gate with replicate one qualified and replicate two unplanned. It shows
  the exact recipe, phase floor, observed value, and `NO LEVER CHANGE` control condition.
- Let the scientist queue a governed confirmation replicate into the normal unreleased backlog. The repeat
  keeps formulation, program, and mission constant and produces an audit-ledger campaign decision.
- Browser QA queued U-2220 as RUN-047 after the 95.5% / 354-minute pass. The campaign retains RUN-046 as
  `n = 1`, shows the second slot as planned, and does not claim robustness before the repeat exists.

## Critique 100: a confirmation repeat would have returned an identical synthetic number

The reproducibility gate initially repeated the same static recipe result. That guaranteed a pass and made
replication ceremonial, even when the first observation sat exactly on the scientific floor.

### Changes

- Added deterministic run-to-run phase variation only after the first observation of an unchanged recipe.
  The formulation, process program, and equipment route remain identical; the measurement response can now
  expose insufficient process margin.
- Propagated the retained observed value rather than the recipe default through XRD acquisition and fit,
  history, mission evaluation, campaign control, overview task cards, the AI experiment loop, the 3D XRD
  readout, and result-driven follow-up policy.
- Added a reproducibility-result panel that compares both run IDs, observed phase fractions, cycle times,
  phase spread, mission floor, and robustness verdict. A failed repeat explicitly returns the scientist to
  the design space rather than certifying the material.
- Replayed RUN-047 end to end. Low crucible stock first blocked release, requiring a scanned and reconciled
  point-of-use receipt. The repeat then encountered gripper contamination, a nine-minute furnace readiness
  gate, door-seal uniformity loss, and an overdue Si reference before acquiring the qualified pattern.
- Verified the XRD console showed 95.3% and −0.2 percentage point before attestation; overview, history, and
  campaign control retained the same 95.3% / 364-minute result. RUN-046 at 95.5% versus RUN-047 at 95.3%
  now yields `BOUNDARY FAILED · CANDIDATE NOT ROBUST` and proposes U-2320 or a diagnostic branch.

## Critique 101: the 3D lab reduced a failed repeat to a generic mission miss

Campaign control explained the reproducibility failure, but closing it returned the player to a spatial
lab labeled only `VALID MISSION MISS`. The central room, task rail, station inspector, and AI loop hid the
fact that the same recipe had already passed once.

### Changes

- Added the prior unchanged-recipe observation to the shared campaign snapshot, allowing every spatial and
  overview surface to distinguish a first result from a confirmation repeat.
- The active checklist now asks the player to `Judge reproducibility` and shows the replicate spread rather
  than another isolated phase result.
- Updated the 3D campaign beacon, material carrier, XRD station state, right-side result card, station
  inspector, and AI experiment loop to expose `REPEAT FAILED`, `NOT ROBUST`, 95.5% → 95.3%, and the
  0.2-percentage-point spread.
- Browser visual QA confirmed that the overview remains visually equipment-first: the 3D lab stays central,
  while the repeat failure is legible in compact machine-status language without reopening campaign control.

## Critique 102: the repeat comparison ignored changed equipment context

RUN-046 and RUN-047 held chemistry and thermal program constant, but their operational routes differed.
Treating the 0.2-percentage-point shift as an isolated material effect would overstate what the experiment
actually demonstrated.

### Changes

- Added a comparability audit above the replicate values. It compares robot, furnace, and XRD condition
  pathways using the retained deterministic equipment state for each run.
- RUN-046 → RUN-047 now exposes FORCE CHECK → CLEAN RECOVERY, TC OFFSET → SEAL RECOVERY, and CURRENT SI →
  DUE SI. All interventions were recovered and qualified, but they remain experimental covariates.
- Changed the failed-repeat headline from a categorical candidate judgment to `ROBUSTNESS NOT DEMONSTRATED`
  and label attribution as conditional when route conditions differ.
- Kept the operational verdict strict: the mission margin was still lost, so the candidate cannot be called
  robust. The new audit prevents the AI loop from claiming that chemistry alone caused the difference.
- Browser QA confirmed the additional evidence remains a compact instrument-style strip rather than a
  narrative explanation, preserving the low-text control-room aesthetic.

## Critique 103: the posterior forgot the first replicate

After RUN-047, the learning panel moved its measured marker to 95.3% and reported that run's residual as if
RUN-046 at 95.5% no longer existed. The reproducibility panel remembered both observations while the model
view learned from only one.

### Changes

- Aggregate retained observations for the active authored recipe before rendering its posterior. The panel
  now reports the two-run mean, repeat count, and mean residual against the recipe prior.
- Plot the prior, earlier replicate, and current result as distinct markers on the 90–100% phase axis. The
  current result remains cyan while retained replicate evidence is amber.
- Make posterior uncertainty respond to observation count while keeping the untested follow-up at its wider
  recipe prior. U-2220 now shows a 95.4% mean, `n = 2 REPEATS`, a −0.8 percentage-point mean residual, and
  uncertainty contracting from ±2.1% to ±1.2%.
- Browser visual QA confirmed the richer posterior remains compact and that the next U-2320 candidate still
  carries ±2.1% uncertainty rather than inheriting confidence from a different composition.

## Critique 104: facility growth was buried inside a results panel

The second thermal lane already changed campaign capacity, but the player encountered it as a qualification
button inside a scheduling panel. That made a physical laboratory expansion feel like a spreadsheet toggle
rather than a change to the place where experiments happen.

### Changes

- Added a top-down facility configuration view with the installed preparation, robotic synthesis, thermal,
  XRD, SEM/EDS, BET, TGA, and utility assets arranged around a visible material-transfer spine and personnel
  aisle.
- Exposed only one real expansion socket: FURN-04B. Its status, cost, qualification duration, lane effect,
  campaign wait, and build currency come from live campaign state rather than a disconnected construction UI.
- Connected the expansion directly to the existing FURN-04B IQ/OQ workflow. A qualified campaign opens the
  retained nine-point uniformity record; an unqualified campaign must commission the chamber without
  disturbing chamber A.
- Made the simulation rule explicit in compact equipment language: facility changes affect future routes and
  never rewrite retained experimental results.
- Browser QA confirmed the blueprint is visually equipment-first, shows both qualified furnace chambers in
  the progressed campaign, and opens the already-retained commissioning evidence from the build view.

## Verification discipline

Each branch was exercised in the browser through both correct and incorrect decisions. Visual QA
covered a wide desktop viewport and a 390 × 844 mobile viewport, including the scenario deck and a
stacked instrument workbench. TypeScript, lint, and production build checks are run before publish.
