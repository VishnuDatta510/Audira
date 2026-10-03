export type Landmark = { x: number; y: number };
export type Blendshape = { categoryName: string; score: number };
export type GazeDirection = "center" | "side" | "up" | "down";
export type GazeFrame = GazeDirection | "blink" | "unknown";

export const GAZE = {
  horizontalIris: 0.34,
  upwardIris: 0.28,
  downwardIris: 0.45,
  horizontalBlend: 0.4,
  upwardBlend: 0.5,
  downwardBlend: 0.62,
  blink: 0.5,
  confirmMs: 350,
  downGraceMs: 5000,
} as const;

const LEFT_EYE = { outer: 33, inner: 133, upper: 159, lower: 145, iris: 468 };
const RIGHT_EYE = { outer: 263, inner: 362, upper: 386, lower: 374, iris: 473 };

export type GazeSample = {
  direction: GazeDirection;
  gazeAwaySeconds: number;
};

export function describeDirection(direction: GazeDirection): string {
  switch (direction) {
    case "center":
      return "Looking toward the screen";
    case "side":
      return "Looking to the side";
    case "up":
      return "Looking up";
    case "down":
      return "Looking down";
    default: {
      const neverDirection: never = direction;
      return neverDirection;
    }
  }
}

function blendScore(blendshapes: Blendshape[] | undefined, name: string): number {
  return blendshapes?.find((shape) => shape.categoryName === name)?.score ?? 0;
}

function eyeOffset(landmarks: Landmark[], eye: typeof LEFT_EYE): { nx: number; ny: number } | null {
  const outer = landmarks[eye.outer];
  const inner = landmarks[eye.inner];
  const upper = landmarks[eye.upper];
  const lower = landmarks[eye.lower];
  const iris = landmarks[eye.iris];
  if (!outer || !inner || !upper || !lower || !iris) return null;
  const width = Math.abs(outer.x - inner.x);
  const height = Math.abs(upper.y - lower.y);
  if (width < 0.004 || height < 0.002) return null;
  const centerX = (outer.x + inner.x) / 2;
  const centerY = (upper.y + lower.y) / 2;
  return { nx: (iris.x - centerX) / width, ny: (iris.y - centerY) / height };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function classifyGaze(landmarks?: Landmark[], blendshapes?: Blendshape[]): GazeFrame {
  if ((!landmarks || landmarks.length === 0) && (!blendshapes || blendshapes.length === 0)) return "unknown";
  const blinkLeft = blendScore(blendshapes, "eyeBlinkLeft");
  const blinkRight = blendScore(blendshapes, "eyeBlinkRight");
  if (blinkLeft >= GAZE.blink && blinkRight >= GAZE.blink) return "blink";

  const offsets = landmarks && landmarks.length > RIGHT_EYE.iris
    ? [eyeOffset(landmarks, LEFT_EYE), eyeOffset(landmarks, RIGHT_EYE)].filter((offset): offset is { nx: number; ny: number } => offset !== null)
    : [];
  const lookSide = Math.max(
    blendScore(blendshapes, "eyeLookOutLeft"),
    blendScore(blendshapes, "eyeLookOutRight"),
    blendScore(blendshapes, "eyeLookInLeft"),
    blendScore(blendshapes, "eyeLookInRight"),
  );
  const lookUp = Math.max(blendScore(blendshapes, "eyeLookUpLeft"), blendScore(blendshapes, "eyeLookUpRight"));
  const lookDown = average([blendScore(blendshapes, "eyeLookDownLeft"), blendScore(blendshapes, "eyeLookDownRight")]);
  const nx = offsets.length ? average(offsets.map((offset) => offset.nx)) : 0;
  const ny = offsets.length ? average(offsets.map((offset) => offset.ny)) : 0;
  const side = (offsets.length > 0 && Math.abs(nx) >= GAZE.horizontalIris) || lookSide > GAZE.horizontalBlend;
  const up = (offsets.length > 0 && ny <= -GAZE.upwardIris) || lookUp > GAZE.upwardBlend;
  const down = (offsets.length > 0 && ny >= GAZE.downwardIris) || lookDown > GAZE.downwardBlend;
  if (side) return "side";
  if (up) return "up";
  if (down) return "down";
  if (!offsets.length && lookSide === 0 && lookUp === 0 && lookDown === 0 && (!blendshapes || blendshapes.length === 0)) {
    return "unknown";
  }
  return "center";
}

export class ActiveTimer {
  private since: number | null = null;

  push(active: boolean, now: number): number {
    if (!active) {
      this.since = null;
      return 0;
    }
    this.since ??= now;
    return (now - this.since) / 1000;
  }

  reset(): void {
    this.since = null;
  }
}

export class Latch {
  private active = false;

  rising(next: boolean): boolean {
    const fire = next && !this.active;
    this.active = next;
    return fire;
  }
}

export class GazeTracker {
  private primed = false;
  private candidate: GazeDirection = "center";
  private candidateSince = 0;
  private stable: GazeDirection = "center";
  private awaySince: number | null = null;
  private downSince: number | null = null;

  sample(frame: GazeFrame, now: number): GazeSample {
    if (frame === "blink" || frame === "unknown") return this.snapshot(now);
    if (!this.primed) {
      this.primed = true;
      this.candidate = frame;
      this.candidateSince = now;
      return this.snapshot(now);
    }
    if (frame !== this.candidate) {
      this.candidate = frame;
      this.candidateSince = now;
    }
    if (now - this.candidateSince >= GAZE.confirmMs) this.stable = frame;
    if (this.stable === "side" || this.stable === "up") {
      this.downSince = null;
      this.awaySince ??= now;
    } else if (this.stable === "down") {
      this.downSince ??= now;
      if (now - this.downSince >= GAZE.downGraceMs) this.awaySince ??= this.downSince + GAZE.downGraceMs;
      else this.awaySince = null;
    } else {
      this.downSince = null;
      this.awaySince = null;
    }
    return this.snapshot(now);
  }

  reset(): void {
    this.primed = false;
    this.candidate = "center";
    this.stable = "center";
    this.awaySince = null;
    this.downSince = null;
  }

  private snapshot(now: number): GazeSample {
    const awayMs = this.awaySince === null ? 0 : Math.max(0, now - this.awaySince);
    return { direction: this.stable, gazeAwaySeconds: awayMs / 1000 };
  }
}
