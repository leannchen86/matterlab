type LabEventMap = {
  'campaign-state': { stage: number };
  'open-campaign': { view?: 'facility' };
  'open-material-staging': Record<string, never>;
  'open-console': { stationId: string; physicalChecks: string[] };
  'return-to-lab': { stationId: string };
  'station-event':
    | { type: 'control'; stationId: string; text: string; action: string }
    | { type: 'attestation'; stationId: string; text: string }
    | { type: 'campaign'; text: string };
};

type LabEventType = keyof LabEventMap;

const labEvents = new EventTarget();

export function emitLabEvent<Type extends LabEventType>(type: Type, detail: LabEventMap[Type]): void {
  labEvents.dispatchEvent(new CustomEvent(type, { detail }));
}

export function subscribeLabEvent<Type extends LabEventType>(type: Type, listener: (detail: LabEventMap[Type]) => void): () => void {
  const receive = (event: Event) => listener((event as CustomEvent<LabEventMap[Type]>).detail);
  labEvents.addEventListener(type, receive);
  return () => labEvents.removeEventListener(type, receive);
}
