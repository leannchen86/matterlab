export function MissionTelemetry({ elapsedMinutes, blockedAttempts, evidenceCount }: { elapsedMinutes: number; blockedAttempts: number; evidenceCount: number }) {
  return <div className="mission-telemetry" role="status" aria-label={`${elapsedMinutes} elapsed minutes, ${blockedAttempts} blocked attempts, ${evidenceCount} new records`}>
    <span>LAB TIME<b>+{elapsedMinutes} min</b></span>
    <span className={blockedAttempts ? 'attention' : ''}>BLOCKED<b>{blockedAttempts}</b></span>
    <span>RECORDS<b>{evidenceCount}</b></span>
  </div>;
}

