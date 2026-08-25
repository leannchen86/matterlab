type Scenario = 'xrd' | 'bet' | 'furnace' | 'tga' | 'facility';
type Scores = { safety: number; traceability: number; integrity: number; uptime: number };

const trails: Record<Scenario, { label: string; detail: string }[]> = {
  xrd: [
    { label: 'MACHINE CHECK PASSED', detail: 'XRD reference' },
    { label: 'LABEL CORRECTED', detail: 'sample 06 held' },
    { label: 'SAMPLES RELEASED', detail: '5 ready' },
    { label: 'UNKNOWN PEAK HELD', detail: 'not ignored' },
    { label: 'FOUR FIELDS CHECKED', detail: 'element map' },
  ],
  bet: [
    { label: 'ANALYZER CHECKED', detail: 'blank + leak' },
    { label: 'TUBE MATCHED', detail: 'preparation record' },
    { label: 'TEST COMPLETED', detail: '4 samples' },
    { label: 'LOW REFERENCE FLAGGED', detail: '168 m²/g' },
    { label: 'REPEAT QUEUED', detail: 'change held' },
  ],
  furnace: [
    { label: 'OLD TRACE SAVED', detail: '742 °C' },
    { label: 'SAMPLE HELD', detail: 'BC-207' },
    { label: 'EMPTY TEST PASSED', detail: 'furnace + robot' },
    { label: 'OLD RUN EXCLUDED', detail: 'not comparable' },
    { label: 'NEW RUN READY', detail: 'safe restart' },
  ],
  tga: [
    { label: 'FAILED BASELINE SAVED', detail: '+0.28 mg' },
    { label: 'PANS MATCHED', detail: 'PANSET-14' },
    { label: 'EMPTY TEST PASSED', detail: 'paired pans' },
    { label: 'GAS OVERLAP FLAGGED', detail: '412 °C' },
    { label: 'REPEAT QUEUED', detail: 'change held' },
  ],
  facility: [
    { label: 'LOAD SECURED', detail: 'route clear' },
    { label: 'TOTE MATCHED', detail: 'LOT-3024-A' },
    { label: 'GAS CHECK PASSED', detail: 'leak test' },
    { label: 'ANALYZER CHECKED', detail: 'ALU-21' },
    { label: 'UNCERTAIN RUNS HELD', detail: 'before proof' },
  ],
};

export function DebriefVisual({ scenario, exceptionCount = 0, elapsedMinutes = 0, logCount = 0 }: { scenario: Scenario; scores: Scores; exceptionCount?: number; elapsedMinutes?: number; logCount?: number }) {
  return <div className="debrief-visual">
    <div className="debrief-outcomes" aria-label={`Mission outcome: ${elapsedMinutes} elapsed minutes, ${exceptionCount} blocked attempts, ${logCount} recorded events`}>
      <span>MISSION OUTCOME</span>
      <div><b>+{elapsedMinutes}</b><small>LAB MINUTES</small></div>
      <div className={exceptionCount ? 'attention' : ''}><b>{exceptionCount}</b><small>BLOCKED ACTIONS</small></div>
      <div><b>{logCount}</b><small>RECORDED EVENTS</small></div>
      <p>{exceptionCount ? 'You recovered without losing the evidence.' : 'Clean run: no unsafe or unsupported action was attempted.'}</p>
    </div>
    <div className={`debrief-trail${exceptionCount ? ' recovered' : ''}`}>
      <header><span>WHAT YOU PROVED</span><b>{trails[scenario].length} CHECKS SAVED</b></header>
      {exceptionCount > 0 && <div className="recovery-band" role="status"><i>!</i><b>{exceptionCount} BLOCKED {exceptionCount === 1 ? 'ATTEMPT' : 'ATTEMPTS'}</b><span>recovered · retained in ledger</span></div>}
      <div>{trails[scenario].map((item, index) => <article key={item.label}><i>{index + 1}</i><b>{item.label}</b><small>{item.detail}</small></article>)}</div>
      <footer><span>CHECKED</span><i>→</i><span>RECORDED</span><i>→</i><span>REVIEWED</span></footer>
    </div>
  </div>;
}
