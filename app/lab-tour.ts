import { STATION_SCENE_ORDER, type StationId, type Vector3Tuple } from './lab-scene-config.ts';

export const DEFAULT_FOV = 55;
export const OVERVIEW_POSITION: Vector3Tuple = [10.5, 11.8, 19.5];
export const OVERVIEW_TARGET: Vector3Tuple = [-1.55, 0.72, -0.18];
export const TOUR_SHOT_MS = 6000;
export type TourShot = { readonly name: string; readonly stationId?: StationId; readonly position: Vector3Tuple; readonly target: Vector3Tuple; readonly fov: number };
const overview: TourShot = { name: 'The laboratory', position: OVERVIEW_POSITION, target: OVERVIEW_TARGET, fov: DEFAULT_FOV };
const names = { prep: 'Powder preparation', robot: 'Robot cell', furnace: 'Box furnace', xrd: 'Powder XRD', sem: 'SEM / EDS', bet: 'Gas sorption', tga: 'Thermal analysis' };

// Deliberate, stationary views from the open aisle. A brief fade joins the shots;
// interpolating between them would send the camera through instruments and walls.
export const TOUR_SHOTS: readonly TourShot[] = [overview, ...STATION_SCENE_ORDER.map((scene) => {
  const offset = (value: Vector3Tuple) => scene.position.map((coordinate, i) => coordinate + value[i]) as Vector3Tuple;
  return { name: names[scene.kind], stationId: scene.id, position: offset(scene.focusOffset), target: offset(scene.focusTargetOffset), fov: DEFAULT_FOV };
}), overview];
