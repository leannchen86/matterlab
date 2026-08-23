type Scenario = 'xrd' | 'bet' | 'furnace';
type Scores = { safety: number; traceability: number; integrity: number; uptime: number };

const trails: Record<Scenario, { label: string; detail: string }[]> = {
  xrd: [
    { label: 'QC RESTORED', detail: 'reference' },
    { label: 'ID CONTROLLED', detail: 'quarantine' },
    { label: 'CELL RELEASED', detail: '5 eligible' },
    { label: 'AI HELD', detail: 'anomaly' },
    { label: 'EVIDENCE BUILT', detail: 'SEM / EDS' },
  ],
  bet: [
    { label: 'SERVICE ACCEPTED', detail: 'blank + leak' },
    { label: 'PREP LINKED', detail: 'degas record' },
    { label: 'RUN RELEASED', detail: '4 samples' },
    { label: 'CONTROL FLAGGED', detail: '168 m²/g' },
    { label: 'RECHECK QUEUED', detail: 'AI held' },
  ],
  furnace: [
    { label: 'TRACE RETAINED', detail: '742 °C' },
    { label: 'LOAD HELD', detail: 'BC-207' },
    { label: 'CELL VERIFIED', detail: 'empty cycle' },
    { label: 'RUN CENSORED', detail: 'excluded' },
    { label: 'REPLAN READY', detail: 'replacement' },
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
      <header><span>RETAINED EVIDENCE TRAIL</span><b>5 / 5 LINKED</b></header>
      {exceptionCount > 0 && <div className="recovery-band" role="status"><i>!</i><b>{exceptionCount} BLOCKED {exceptionCount === 1 ? 'ATTEMPT' : 'ATTEMPTS'}</b><span>recovered · retained in ledger</span></div>}
      <div>{trails[scenario].map((item, index) => <article key={item.label}><i>{index + 1}</i><b>{item.label}</b><small>{item.detail}</small></article>)}</div>
      <footer><span>PHYSICAL</span><i>→</i><span>DIGITAL</span><i>→</i><span>SCIENTIFIC</span><i>→</i><span>AI-ELIGIBLE</span></footer>
    </div>
  </div>;
}
