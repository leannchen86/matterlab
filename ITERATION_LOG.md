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

## Verification discipline

Each branch was exercised in the browser through both correct and incorrect decisions. Visual QA
covered a wide desktop viewport and a 390 × 844 mobile viewport, including the scenario deck and a
stacked instrument workbench. TypeScript, lint, and production build checks are run before publish.
