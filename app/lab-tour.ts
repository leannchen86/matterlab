import type { Vector3Tuple } from './lab-scene-config.ts';

export const DEFAULT_FOV = 55;
export const OVERVIEW_POSITION: Vector3Tuple = [10.5, 11.8, 19.5];
export const OVERVIEW_TARGET: Vector3Tuple = [-1.55, 0.72, -0.18];

// Original cinematic tour introduced in 1ed26c4 (1 September 2026), using its ENTER LAB → TOUR framing.
export const TOUR_DURATION_SECONDS = 24;
export const TOUR_CAMERA_IDS = ['C01', 'C04', 'C08', 'C09', 'C11', 'C13', 'C16'] as const;
