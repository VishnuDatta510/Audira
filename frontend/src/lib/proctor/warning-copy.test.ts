import assert from "node:assert/strict";
import test from "node:test";
import { toProctorAck } from "./api.ts";
import { describeWarning } from "./warning-copy.ts";

test("gaze, light, and people toasts use the measured detail", () => {
  assert.deepEqual(describeWarning("suspicious_gaze", "Off-screen gaze observed for 10.4 seconds."), {
    title: "Looking away from the screen",
    detail: "Your eyes stayed off the screen for 10.4 seconds.",
  });
  assert.equal(describeWarning("low_light", "Lighting observation: too_bright.").title, "Too much light");
  assert.equal(describeWarning("low_light", "Lighting observation: too_dark.").title, "Too little light");
  assert.equal(describeWarning("multiple_people", "Camera detected 2 people.").detail, "The camera saw 2 people.");
  assert.equal(describeWarning("fullscreen_exit", "Tried to leave full-screen.").title, "Tried to leave full-screen");
  assert.equal(describeWarning("tab_hidden", "").title, "Left this tab");
  assert.equal(describeWarning("tab_hidden", "The assessment window lost focus.").title, "Left the window");
  assert.equal(describeWarning("suspicious_phone", "").title, "Phone detected");
});

test("quiet vision frames do not become toasts, and a real warning does", () => {
  const quiet = toProctorAck({ warnings: 1, warning_limit: 5, disqualified: false, observations: [] });
  assert.deepEqual(quiet.recorded, []);
  const warned = toProctorAck({
    warnings: 2,
    warning_limit: 5,
    disqualified: false,
    observations: [{ event: { type: "face_missing", details: "Face was not detected by the camera." } }],
  });
  assert.equal(warned.recorded[0]?.type, "face_missing");
  const phone = toProctorAck({ warnings: 3, warning_limit: 5, disqualified: false, event: { type: "suspicious_phone", details: "Cell phone detected." } });
  assert.equal(phone.recorded[0]?.type, "suspicious_phone");
});
