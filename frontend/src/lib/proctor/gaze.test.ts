import assert from "node:assert/strict";
import test from "node:test";
import { GAZE, GazeTracker, classifyGaze, type Landmark } from "./gaze.ts";

function face(irisShift: { x: number; y: number } = { x: 0, y: 0 }): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  landmarks[33] = { x: 0.3, y: 0.4 };
  landmarks[133] = { x: 0.42, y: 0.4 };
  landmarks[159] = { x: 0.36, y: 0.37 };
  landmarks[145] = { x: 0.36, y: 0.43 };
  landmarks[468] = { x: 0.36 + irisShift.x, y: 0.4 + irisShift.y };
  landmarks[263] = { x: 0.7, y: 0.4 };
  landmarks[362] = { x: 0.58, y: 0.4 };
  landmarks[386] = { x: 0.64, y: 0.37 };
  landmarks[374] = { x: 0.64, y: 0.43 };
  landmarks[473] = { x: 0.64 + irisShift.x, y: 0.4 + irisShift.y };
  return landmarks;
}

test("centered irises are not an away gaze", () => {
  assert.equal(classifyGaze(face()), "center");
});

test("iris shifted sideways is a side gaze", () => {
  assert.equal(classifyGaze(face({ x: -0.05, y: 0 })), "side");
});

test("a clear downward iris is down, and a mild drop stays centered", () => {
  assert.equal(classifyGaze(face({ x: 0, y: 0.03 })), "down");
  assert.equal(classifyGaze(face({ x: 0, y: 0.01 })), "center");
});

test("both eyes blinking is ignored", () => {
  const frame = classifyGaze(face({ x: -0.05, y: 0 }), [
    { categoryName: "eyeBlinkLeft", score: 0.9 },
    { categoryName: "eyeBlinkRight", score: 0.9 },
  ]);
  assert.equal(frame, "blink");
});

test("blendshapes still classify when iris landmarks are missing", () => {
  assert.equal(classifyGaze([{ x: 0.5, y: 0.5 }], [{ categoryName: "eyeLookOutLeft", score: 0.8 }]), "side");
});

test("eye look-out above 0.4 is away, and a look up above 0.5 is up", () => {
  assert.equal(classifyGaze(undefined, [{ categoryName: "eyeLookOutRight", score: 0.45 }]), "side");
  assert.equal(classifyGaze(undefined, [{ categoryName: "eyeLookOutLeft", score: 0.4 }]), "center");
  assert.equal(classifyGaze(undefined, [{ categoryName: "eyeLookUpLeft", score: 0.55 }]), "up");
});

test("side gaze starts counting only after it holds, and a blink does not reset it", () => {
  const tracker = new GazeTracker();
  const start = 1_000;
  assert.equal(tracker.sample("side", start).gazeAwaySeconds, 0);
  assert.equal(tracker.sample("side", start + GAZE.confirmMs).gazeAwaySeconds, 0);
  const later = tracker.sample("side", start + GAZE.confirmMs + 2_000);
  assert.equal(later.direction, "side");
  assert.ok(Math.abs(later.gazeAwaySeconds - 2) < 0.01);
  const blinked = tracker.sample("blink", start + GAZE.confirmMs + 3_000);
  assert.ok(Math.abs(blinked.gazeAwaySeconds - 3) < 0.01);
});

test("looking down does not count until the keyboard grace has passed", () => {
  const tracker = new GazeTracker();
  const start = 5_000;
  tracker.sample("down", start);
  tracker.sample("down", start + GAZE.confirmMs);
  const duringGrace = tracker.sample("down", start + GAZE.confirmMs + 2_000);
  assert.equal(duringGrace.gazeAwaySeconds, 0);
  const afterGrace = tracker.sample("down", start + GAZE.confirmMs + GAZE.downGraceMs + 1_000);
  assert.ok(Math.abs(afterGrace.gazeAwaySeconds - 1) < 0.01);
});

test("returning to center clears the away timer", () => {
  const tracker = new GazeTracker();
  const start = 10_000;
  tracker.sample("side", start);
  tracker.sample("side", start + GAZE.confirmMs);
  tracker.sample("center", start + 2_000);
  const settled = tracker.sample("center", start + 2_000 + GAZE.confirmMs);
  assert.equal(settled.direction, "center");
  assert.equal(settled.gazeAwaySeconds, 0);
});
