type Scenario = 'xrd' | 'bet' | 'furnace' | 'tga' | 'facility';
type Scores = { safety: number; traceability: number; integrity: number; uptime: number };

const trails: Record<Scenario, { label: string; detail: string }[]> = {
  xrd: [
    { label: 'MACHINE CHECK PASSED', detail: 'silicon QC material' },
    { label: 'LABEL CORRECTED', detail: 'sample 06 set aside' },
    { label: 'FIVE RESULTS ACCEPTED', detail: 'identity confirmed' },
    { label: 'UNKNOWN PEAK PRESERVED', detail: 'not explained away' },
    { label: 'FOUR FIELDS CHECKED', detail: 'element map' },
  ],
  bet: [
    { label: 'ANALYZER CHECKED', detail: 'empty run + leak test' },
    { label: 'TUBE MATCHED', detail: 'preparation record' },
    { label: 'TEST COMPLETED', detail: '4 samples' },
    { label: 'LOW QC RESULT FLAGGED', detail: '168 m²/g' },
    { label: 'REPEAT QUEUED', detail: 'recipe unchanged' },
  ],
  furnace: [
    { label: 'OLD TRACE SAVED', detail: '742 °C' },
    { label: 'SAMPLE IDENTIFIED', detail: 'BC-207' },
    { label: 'EMPTY TEST PASSED', detail: 'furnace + robot' },
    { label: 'OLD RUN EXCLUDED', detail: 'not comparable' },
    { label: 'NEW RUN READY', detail: 'safe restart' },
  ],
  tga: [
    { label: 'FAILED EMPTY CHECK SAVED', detail: '+0.28 mg' },
    { label: 'PANS MATCHED', detail: 'PANSET-14' },
    { label: 'EMPTY TEST PASSED', detail: 'paired pans' },
    { label: 'GAS OVERLAP FLAGGED', detail: '412 °C' },
    { label: 'REPEAT QUEUED', detail: 'recipe unchanged' },
  ],
  facility: [
    { label: 'LOAD SECURED', detail: 'route clear' },
    { label: 'TOTE MATCHED', detail: 'LOT-3024-A' },
    { label: 'GAS CHECK PASSED', detail: 'leak test' },
    { label: 'ANALYZER CHECKED', detail: 'MS-ALU-21' },
    { label: 'EARLY RUNS EXCLUDED', detail: 'before passing check' },
  ],
};

export function DebriefVisual({ scenario, exceptionCount = 0, elapsedMinutes = 0, logCount = 0 }: { scenario: Scenario; scores: Scores; exceptionCount?: number; elapsedMinutes?: number; logCount?: number }) {
  return <div className="debrief-visual">
    <div className="debrief-outcomes" aria-label={`Mission outcome: ${logCount} recorded events, ${exceptionCount} unsupported actions blocked, ${elapsedMinutes} elapsed lab minutes`}>
      <span>MISSION OUTCOME</span>
      <div><b>{logCount}</b><small>EVIDENCE EVENTS</small></div>
      <div className={exceptionCount ? 'attention' : ''}><b>{exceptionCount}</b><small>UNSUPPORTED</small></div>
      <div><b>+{elapsedMinutes}</b><small>LAB MINUTES</small></div>
      <p>{exceptionCount ? 'Recovered: unsupported attempts were blocked, and the evidence stayed intact.' : 'Defensible run: every decision was backed by saved evidence.'}</p>
    </div>
    <div className={`debrief-trail${exceptionCount ? ' recovered' : ''}`}>
      <header><span>WHAT YOU PROVED</span><b>{trails[scenario].length} CHECKS SAVED</b></header>
      {exceptionCount > 0 && <div className="recovery-band" role="status"><i>!</i><b>{exceptionCount} UNSUPPORTED {exceptionCount === 1 ? 'ATTEMPT' : 'ATTEMPTS'}</b><span>blocked · recorded</span></div>}
      <div>{trails[scenario].map((item, index) => <article key={item.label}><i>{index + 1}</i><b>{item.label}</b><small>{item.detail}</small></article>)}</div>
      <footer><span>CHECKED</span><i>→</i><span>RECORDED</span><i>→</i><span>REVIEWED</span></footer>
    </div>
  </div>;
}
