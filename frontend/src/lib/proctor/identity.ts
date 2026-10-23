import type { Landmark } from "./gaze";

// Distances across the face that stay put while someone talks or blinks: nose, chin, face width, eye corners.
const PAIRS: [number, number][] = [
  [1, 152],
  [10, 152],
  [234, 454],
  [129, 358],
  [33, 133],
  [362, 263],
  [168, 1],
  [133, 362],
  [152, 61],
  [152, 291],
];
const EYE_SPAN: [number, number] = [33, 263];

export const IDENTITY = {
  baselineSamples: 20,
  checkSamples: 10,
  sampleGapMs: 150,
  // ponytail: uncalibrated threshold on landmark ratios, not face recognition. Tune it on real attempts, or swap in a face embedding model if this misses swaps.
  threshold: 0.12,
  confirmChecks: 3,
} as const;

function span(landmarks: Landmark[], [a, b]: [number, number], aspect: number): number {
  const p = landmarks[a];
  const q = landmarks[b];
  if (!p || !q) return 0;
  return Math.hypot((p.x - q.x) * aspect, p.y - q.y);
}

/** Face proportions scaled by the eye span, so moving closer to the camera changes nothing. */
export function faceShape(landmarks: Landmark[], aspect: number): number[] | null {
  const eyes = span(landmarks, EYE_SPAN, aspect);
  if (eyes < 0.02) return null;
  return PAIRS.map((pair) => span(landmarks, pair, aspect) / eyes);
}

/** The nose sits between the eyes, so the head faces the camera and the proportions compare fairly. */
export function facesCamera(landmarks: Landmark[]): boolean {
  const nose = landmarks[1];
  const left = landmarks[EYE_SPAN[0]];
  const right = landmarks[EYE_SPAN[1]];
  if (!nose || !left || !right) return false;
  const middle = (left.x + right.x) / 2;
  return Math.abs(nose.x - middle) < Math.abs(right.x - left.x) * 0.12;
}

export function shapeDifference(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + Math.abs(value - b[index]) / b[index], 0) / a.length;
}

function mean(rows: number[][]): number[] {
  return rows[0].map((_, index) => rows.reduce((sum, row) => sum + row[index], 0) / rows.length);
}

/** Learns the face at the start, then flags when a different face settles in. Only for a person to review. */
export class IdentityWatch {
  private baseline: number[] | null = null;
  private batch: number[][] = [];
  private lastAt = -Infinity;
  private strikes = 0;
  private flagged = false;

  sample(shape: number[], now: number): boolean {
    if (now - this.lastAt < IDENTITY.sampleGapMs) return false;
    this.lastAt = now;
    this.batch.push(shape);
    if (!this.baseline) {
      if (this.batch.length >= IDENTITY.baselineSamples) {
        this.baseline = mean(this.batch);
        this.batch = [];
      }
      return false;
    }
    if (this.batch.length < IDENTITY.checkSamples) return false;
    const different = shapeDifference(mean(this.batch), this.baseline) > IDENTITY.threshold;
    this.batch = [];
    this.strikes = different ? this.strikes + 1 : 0;
    if (!different) this.flagged = false;
    if (this.flagged || this.strikes < IDENTITY.confirmChecks) return false;
    this.flagged = true;
    return true;
  }
}
