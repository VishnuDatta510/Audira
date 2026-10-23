import assert from "node:assert/strict";
import test from "node:test";
import { IDENTITY, IdentityWatch, faceShape, facesCamera } from "./identity.ts";
import { VoiceGate } from "./voice.ts";

type Point = { x: number; y: number };

function face({ width = 1, length = 1, shiftX = 0 }: { width?: number; length?: number; shiftX?: number } = {}): Point[] {
  const points: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const at = (index: number, x: number, y: number) => {
    points[index] = { x: 0.5 + (x - 0.5) * width + shiftX, y: 0.5 + (y - 0.5) * length };
  };
  at(33, 0.38, 0.42);
  at(133, 0.46, 0.42);
  at(362, 0.54, 0.42);
  at(263, 0.62, 0.42);
  at(1, 0.5, 0.52);
  at(168, 0.5, 0.42);
  at(10, 0.5, 0.28);
  at(152, 0.5, 0.72);
  at(234, 0.32, 0.5);
  at(454, 0.68, 0.5);
  at(129, 0.46, 0.55);
  at(358, 0.54, 0.55);
  at(61, 0.44, 0.62);
  at(291, 0.56, 0.62);
  return points;
}

function feed(watch: IdentityWatch, points: Point[], from: number, count: number): boolean {
  let fired = false;
  for (let i = 0; i < count; i += 1) fired = watch.sample(faceShape(points, 4 / 3)!, from + i * IDENTITY.sampleGapMs) || fired;
  return fired;
}

test("the same face at another distance keeps its shape", () => {
  const near = faceShape(face(), 4 / 3)!;
  const far = faceShape(face({ width: 0.6, length: 0.6 }), 4 / 3)!;
  near.forEach((value, index) => assert.ok(Math.abs(value - far[index]) < 1e-9));
});

test("only a face turned to the camera is compared", () => {
  assert.equal(facesCamera(face()), true);
  const turned = face();
  turned[1] = { x: 0.56, y: 0.52 };
  assert.equal(facesCamera(turned), false);
});

test("a steady face is never flagged, and a longer face that stays is flagged once", () => {
  const watch = new IdentityWatch();
  const checks = IDENTITY.checkSamples * (IDENTITY.confirmChecks + 2);
  assert.equal(feed(watch, face(), 0, IDENTITY.baselineSamples + checks), false);
  const other = face({ length: 1.4 });
  const start = (IDENTITY.baselineSamples + checks) * IDENTITY.sampleGapMs;
  assert.equal(feed(watch, other, start, IDENTITY.checkSamples * (IDENTITY.confirmChecks - 1)), false);
  assert.equal(feed(watch, other, start + 1e6, IDENTITY.checkSamples * 3), true);
  assert.equal(feed(watch, other, start + 2e6, IDENTITY.checkSamples * 3), false);
});

test("speech has to rise above the room and keep going", () => {
  const gate = new VoiceGate();
  for (let t = 0; t < 1000; t += 100) gate.push(0.004, t);
  assert.equal(gate.push(0.05, 1000), 0);
  assert.equal(gate.push(0.004, 1100), 0.1);
  assert.equal(gate.push(0.004, 1400), 0);
  let seconds = 0;
  for (let t = 2000; t <= 5000; t += 100) seconds = gate.push(0.05, t);
  assert.equal(seconds, 3);
});
