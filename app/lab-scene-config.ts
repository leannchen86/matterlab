export type CameraMode = 'overview' | 'walk' | 'focus';

export type StationId = 'PREP-01' | 'ROBO-02' | 'FURN-04' | 'XRD-03' | 'SEM-01' | 'BET-02' | 'TGA-01';

export type StationKind = 'prep' | 'robot' | 'furnace' | 'xrd' | 'sem' | 'bet' | 'tga';

export type Vector3Tuple = [number, number, number];

export type StationSceneSpec = {
  id: StationId;
  kind: StationKind;
  position: Vector3Tuple;
  focusOffset: Vector3Tuple;
  focusTargetOffset: Vector3Tuple;
  walkOffset: Vector3Tuple;
  colliderHalfSize: [number, number];
  platformHeight: number;
  labelPosition: Vector3Tuple;
};

export type SceneQualityPolicy = {
  dpr: [number, number];
  shadows: false | 'percentage';
  shadowMapSize: number;
  environmentResolution: number;
};

const STATION_SCENE_SPECS: Record<StationId, StationSceneSpec> = {
  'PREP-01': {
    id: 'PREP-01',
    kind: 'prep',
    position: [-5.25, 0, -2.15],
    focusOffset: [2.4, 2.75, 4.35],
    focusTargetOffset: [0, 1.05, 0],
    walkOffset: [-2.35, 1.68, 2.15],
    colliderHalfSize: [1.72, 1.58],
    platformHeight: 0.055,
    labelPosition: [0, 2.98, -0.2],
  },
  'ROBO-02': {
    id: 'ROBO-02',
    kind: 'robot',
    position: [-1.75, 0, -2.15],
    focusOffset: [2.4, 2.75, 4.35],
    focusTargetOffset: [0.42, 1.05, 0],
    walkOffset: [-2.5, 1.68, 2.15],
    colliderHalfSize: [1.72, 1.58],
    platformHeight: 0.055,
    labelPosition: [0, 2.98, -0.2],
  },
  'FURN-04': {
    id: 'FURN-04',
    kind: 'furnace',
    position: [1.75, 0, -2.15],
    focusOffset: [-2.15, 2.75, 4.35],
    focusTargetOffset: [0, 1.05, 0],
    walkOffset: [2.35, 1.68, 2.15],
    colliderHalfSize: [1.72, 1.58],
    platformHeight: 0.055,
    labelPosition: [-0.38, 2.98, -0.2],
  },
  'XRD-03': {
    id: 'XRD-03',
    kind: 'xrd',
    position: [-5.25, 0, 1.75],
    focusOffset: [2.4, 2.75, 4.35],
    focusTargetOffset: [0, 1.05, 0],
    walkOffset: [0, 1.68, 5.45],
    colliderHalfSize: [1.72, 1.58],
    platformHeight: 0.09,
    labelPosition: [0.5, 2.72, 0.2],
  },
  'SEM-01': {
    id: 'SEM-01',
    kind: 'sem',
    position: [-1.75, 0, 1.75],
    focusOffset: [2.4, 2.75, 4.35],
    focusTargetOffset: [0, 1.05, 0],
    walkOffset: [0, 1.68, 5.2],
    colliderHalfSize: [1.72, 1.58],
    platformHeight: 0.09,
    labelPosition: [0, 2.72, 0.2],
  },
  'BET-02': {
    id: 'BET-02',
    kind: 'bet',
    position: [1.75, 0, 1.75],
    focusOffset: [-2.15, 2.75, 4.35],
    focusTargetOffset: [0, 1.05, 0],
    walkOffset: [2.35, 1.68, 3.65],
    colliderHalfSize: [1.72, 1.58],
    platformHeight: 0.055,
    labelPosition: [0, 2.72, 0.2],
  },
  'TGA-01': {
    id: 'TGA-01',
    kind: 'tga',
    position: [1.75, 0, 5.35],
    focusOffset: [2.25, 2.75, 4.35],
    focusTargetOffset: [0, 1.05, 0],
    walkOffset: [-4.45, 1.68, 1.65],
    colliderHalfSize: [1.72, 1.58],
    platformHeight: 0.055,
    labelPosition: [0, 2.72, 0.2],
  },
};

export const STATION_SCENE_ORDER: StationSceneSpec[] = [
  STATION_SCENE_SPECS['PREP-01'],
  STATION_SCENE_SPECS['ROBO-02'],
  STATION_SCENE_SPECS['FURN-04'],
  STATION_SCENE_SPECS['XRD-03'],
  STATION_SCENE_SPECS['SEM-01'],
  STATION_SCENE_SPECS['BET-02'],
  STATION_SCENE_SPECS['TGA-01'],
];

export const STATION_MENU_ORDER: readonly StationId[] = [
  'ROBO-02',
  'FURN-04',
  'XRD-03',
  'SEM-01',
  'BET-02',
  'TGA-01',
  'PREP-01',
];

export const SCENE_QUALITY: Record<CameraMode, SceneQualityPolicy> = {
  overview: { dpr: [1, 1.25], shadows: false, shadowMapSize: 1024, environmentResolution: 64 },
  walk: { dpr: [1, 1.2], shadows: false, shadowMapSize: 1024, environmentResolution: 64 },
  focus: { dpr: [1, 1.25], shadows: 'percentage', shadowMapSize: 1024, environmentResolution: 96 },
};

export function getStationSceneSpec(stationId: string): StationSceneSpec {
  switch (stationId) {
    case 'PREP-01':
    case 'ROBO-02':
    case 'FURN-04':
    case 'XRD-03':
    case 'SEM-01':
    case 'BET-02':
    case 'TGA-01':
      return STATION_SCENE_SPECS[stationId];
    default:
      throw new Error(`Unknown laboratory station: ${stationId}`);
  }
}

export function getCampaignStationId(stage: number): StationId | null {
  if (stage <= 0) return null;
  if (stage === 1) return 'PREP-01';
  if (stage <= 3) return 'ROBO-02';
  if (stage <= 5) return 'FURN-04';
  if (stage <= 7) return 'XRD-03';
  return 'SEM-01';
}
