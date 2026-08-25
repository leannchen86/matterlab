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

export function DebriefVisual({ scenario, scores, exceptionCount = 0 }: { scenario: Scenario; scores: Scores; exceptionCount?: number }) {
  const values = [scores.safety, scores.traceability, scores.integrity, scores.uptime];
  const point = (value: number, index: number) => {
    const angle = -Math.PI / 2 + index * Math.PI / 2;
    const radius = 41 * value / 100;
    return `${55 + Math.cos(angle) * radius},${55 + Math.sin(angle) * radius}`;
  };
  const grid = (value: number) => values.map((_, index) => point(value, index)).join(' ');
  return <div className="debrief-visual">
    <div className="debrief-radar" aria-label={`Shift profile: safety ${scores.safety}, traceability ${scores.traceability}, data integrity ${scores.integrity}, uptime ${scores.uptime}`}>
      <span>SHIFT PROFILE</span>
      <svg viewBox="0 0 110 110" role="img" aria-hidden="true">
        {[25, 50, 75, 100].map((level) => <polygon key={level} className="radar-grid" points={grid(level)} />)}
        <path className="radar-axis" d="M55 9V101M9 55H101" />
        <polygon className="radar-value" points={values.map(point).join(' ')} />
        {values.map((value, index) => { const [x, y] = point(value, index).split(','); return <circle key={index} cx={x} cy={y} r="2.5" />; })}
        <text x="55" y="7" textAnchor="middle">SAFETY</text><text x="104" y="57">TRACE</text><text x="55" y="108" textAnchor="middle">INTEGRITY</text><text x="6" y="57" textAnchor="end">UPTIME</text>
      </svg>
    </div>
    <div className={`debrief-trail${exceptionCount ? ' recovered' : ''}`}>
      <header><span>WHAT YOU PROVED</span><b>{trails[scenario].length} CHECKS SAVED</b></header>
      {exceptionCount > 0 && <div className="recovery-band" role="status"><i>!</i><b>{exceptionCount} BLOCKED {exceptionCount === 1 ? 'ATTEMPT' : 'ATTEMPTS'}</b><span>recovered · retained in ledger</span></div>}
      <div>{trails[scenario].map((item, index) => <article key={item.label}><i>{index + 1}</i><b>{item.label}</b><small>{item.detail}</small></article>)}</div>
      <footer><span>CHECKED</span><i>→</i><span>RECORDED</span><i>→</i><span>REVIEWED</span></footer>
    </div>
  </div>;
}
