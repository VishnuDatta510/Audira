import { ApiError, api } from "@/lib/api";
import type { Lighting, ProctorAck, ProctorEventType, VisionPayload } from "./api";
import { ActiveTimer, GazeTracker, Latch, classifyGaze, describeDirection, type Blendshape } from "./gaze";
import { loadFaceLandmarker, loadObjectDetector, type FaceLandmarker, type ObjectDetector } from "./load-models";

const VISION_INTERVAL_MS = 2000;
const OBJECT_INTERVAL_MS = 2500;
const FACE_MISSING_SECONDS = 2;
const EVENT_COOLDOWN_MS = 8000;
const PHONE_SCORE = 0.55;
const PERSON_SCORE = 0.6;

export type WarningNotice = {
  type: string;
  details: string;
  count: number;
  limit: number;
  locked: boolean;
};

export type ProctorSignals = {
  faceVisible: boolean;
  people: number;
  direction: "center" | "side" | "up" | "down";
  gazeAwaySeconds: number;
  mouthSeconds: number;
};

export type ProctorUi = {
  onStatus: (status: string) => void;
  onWarnings: (warnings: number, limit: number) => void;
  onWarning: (notice: WarningNotice) => void;
  onSignals: (signals: ProctorSignals) => void;
  onLocked: () => void;
};

export class ProctorEngine {
  private stopped = false;
  private frame = 0;
  private landmarker: FaceLandmarker | null = null;
  private objects: ObjectDetector | null = null;
  private objectsBusy = false;
  private gaze = new GazeTracker();
  private mouth = new ActiveTimer();
  private missing = new ActiveTimer();
  private phone = new Latch();
  private lastLip: number | null = null;
  private lastVision = 0;
  private lastObjects = 0;
  private lastPeople = 0;
  private lastLabel = "";
  private eventSent = new Map<ProctorEventType, number>();
  private warningLimit = 5;
  private transportNoted = false;
  private fullscreenArmed = false;
  private fullscreenNote = "";
  private restoringFullscreen = false;
  private monitoringReady = false;
  private onVisibility = () => {
    if (document.hidden) void this.report("tab_hidden", "Assessment tab became hidden.");
  };
  private onFullscreen = () => {
    if (document.fullscreenElement) {
      this.fullscreenArmed = true;
      void this.lockEscape();
      return;
    }
    if (!this.fullscreenArmed || this.stopped) return;
    void this.restoreFullscreen();
    void this.report("fullscreen_exit", "Tried to leave full-screen.");
  };
  private onEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !this.fullscreenArmed || this.stopped || !document.fullscreenElement) return;
    event.preventDefault();
    event.stopPropagation();
    void this.report("fullscreen_exit", "Tried to leave full-screen.");
  };
  private onBlur = () => {
    if (document.hidden) return;
    void this.report("tab_hidden", "The assessment window lost focus.");
  };
  private lastSignalsAt = 0;

  constructor(
    private readonly sessionId: string,
    private readonly video: HTMLVideoElement,
    private readonly ui: ProctorUi,
  ) {}

  async start(): Promise<void> {
    try {
      const config = await api.config();
      this.warningLimit = config.proctor_warning_limit;
    } catch {
      // Monitoring can still start. The server applies the warning limit to each observation.
    }
    this.ui.onWarnings(0, this.warningLimit);
    this.ui.onStatus("Requesting the camera and microphone…");
    try {
      this.video.srcObject = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      await this.video.play();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Camera or microphone permission was blocked.";
      void this.report("camera_unavailable", message);
      throw new Error("Allow the camera and microphone before the coding round.");
    }
    document.addEventListener("visibilitychange", this.onVisibility);
    document.addEventListener("fullscreenchange", this.onFullscreen);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("keydown", this.onEscape, true);
    try {
      await document.documentElement.requestFullscreen();
      await this.lockEscape();
    } catch {
      this.fullscreenNote = " Full-screen was declined.";
    }
    this.ui.onStatus("Loading the face model…");
    try {
      this.landmarker = await loadFaceLandmarker();
      this.objects = await loadObjectDetector().catch(() => null);
    } catch (error) {
      this.stop();
      const message = error instanceof Error ? error.message : "Face model failed to load.";
      void this.report("camera_unavailable", message);
      throw new Error(message);
    }
    if (this.stopped) return;
    this.monitoringReady = true;
    this.ui.onStatus("Monitoring active. Looking toward the screen.");
    this.frame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.stopped = true;
    this.monitoringReady = false;
    cancelAnimationFrame(this.frame);
    this.fullscreenArmed = false;
    document.removeEventListener("visibilitychange", this.onVisibility);
    document.removeEventListener("fullscreenchange", this.onFullscreen);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("keydown", this.onEscape, true);
    unlockEscape();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    this.landmarker?.close();
    this.landmarker = null;
    const stream = this.video.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    this.video.srcObject = null;
  }

  private tick = (): void => {
    if (this.stopped) return;
    this.frame = requestAnimationFrame(this.tick);
    if (!this.landmarker || this.video.readyState < 2) return;
    const now = performance.now();
    let faceCount = 0;
    let gazeAwaySeconds = 0;
    let mouthSeconds = 0;
    try {
      const result = this.landmarker.detectForVideo(this.video, now);
      faceCount = result.faceLandmarks?.length ?? 0;
      const missingSeconds = this.missing.push(faceCount === 0, now);
      if (faceCount > 0) {
        const landmarks = result.faceLandmarks?.[0];
        const blendshapes = readBlendshapes(result.faceBlendshapes?.[0]?.categories);
        const sample = this.gaze.sample(classifyGaze(landmarks, blendshapes), now);
        gazeAwaySeconds = sample.gazeAwaySeconds;
        const mouth = mouthIsMoving(this.lastLip, landmarks, blendScore(blendshapes, "jawOpen"));
        this.lastLip = mouth.opening;
        mouthSeconds = this.mouth.push(mouth.moving, now);
        this.publishDirection(sample.direction);
        this.publishSignals({ faceVisible: true, people: Math.max(faceCount, this.lastPeople), direction: sample.direction, gazeAwaySeconds, mouthSeconds }, now);
      } else if (missingSeconds >= FACE_MISSING_SECONDS) {
        this.gaze.reset();
        this.mouth.reset();
        this.lastLip = null;
        this.publishDirection("center");
        this.publishSignals({ faceVisible: false, people: Math.max(faceCount, this.lastPeople), direction: "center", gazeAwaySeconds: 0, mouthSeconds: 0 }, now);
      }
      this.scheduleObjects(now);
      if (now - this.lastVision >= VISION_INTERVAL_MS) {
        this.lastVision = now;
        const people = Math.max(faceCount, this.lastPeople);
        void this.sendVision({
          face_visible: missingSeconds < FACE_MISSING_SECONDS,
          people_count: people,
          lighting: brightness(this.video),
          gaze_away_seconds: gazeAwaySeconds,
          mouth_motion_seconds: mouthSeconds,
          source: "mediapipe_browser",
        });
      }
    } catch (error) {
      this.ui.onStatus(error instanceof Error ? error.message : "Monitoring frame failed.");
    }
  };

  private async lockEscape(): Promise<void> {
    const keyboard = escapeLock();
    if (!keyboard || !document.fullscreenElement) return;
    try {
      await keyboard.lock(["Escape"]);
    } catch {
      // The browser refused to hold Escape. Leaving full-screen still counts, and we try to return.
    }
  }

  private async restoreFullscreen(): Promise<void> {
    if (this.stopped || this.restoringFullscreen || document.fullscreenElement) return;
    this.restoringFullscreen = true;
    try {
      await document.documentElement.requestFullscreen();
      await this.lockEscape();
      this.fullscreenNote = "";
    } catch {
      this.fullscreenNote = " Full-screen was left.";
      this.lastLabel = "";
      this.ui.onStatus("Full-screen was left. The attempt was counted.");
    } finally {
      this.restoringFullscreen = false;
    }
  }

  private publishDirection(direction: "center" | "side" | "up" | "down"): void {
    const label = `Monitoring active. ${describeDirection(direction)}.${this.fullscreenNote}`;
    if (label === this.lastLabel) return;
    this.lastLabel = label;
    this.ui.onStatus(label);
  }

  private publishSignals(signals: ProctorSignals, now: number): void {
    if (now - this.lastSignalsAt < 500) return;
    this.lastSignalsAt = now;
    this.ui.onSignals(signals);
  }

  private scheduleObjects(now: number): void {
    if (!this.objects || this.objectsBusy || now - this.lastObjects < OBJECT_INTERVAL_MS) return;
    this.lastObjects = now;
    this.objectsBusy = true;
    void this.objects.detect(this.video).then((detected) => {
      this.lastPeople = detected.filter((item) => item.class === "person" && item.score > PERSON_SCORE).length;
      const phone = detected.some((item) => item.class === "cell phone" && item.score > PHONE_SCORE);
      if (this.phone.rising(phone)) void this.report("suspicious_phone", "Cell phone detected by the client-side object detector.");
    }).catch(() => {
      this.lastPeople = 0;
    }).finally(() => {
      this.objectsBusy = false;
    });
  }

  private async sendVision(payload: VisionPayload): Promise<void> {
    try {
      this.apply(await api.visionObservation(this.sessionId, { ...payload }));
    } catch (error) {
      this.noteTransport(error);
    }
  }

  private async report(eventType: ProctorEventType, details: string): Promise<void> {
    const previous = this.eventSent.get(eventType) ?? 0;
    if (previous !== 0 && performance.now() - previous < EVENT_COOLDOWN_MS) return;
    this.eventSent.set(eventType, performance.now());
    try {
      this.apply(await api.proctorEvent(this.sessionId, eventType, details));
    } catch (error) {
      this.noteTransport(error);
    }
  }

  private noteTransport(error: unknown): void {
    if (this.stopped || this.transportNoted) return;
    this.transportNoted = true;
    this.ui.onStatus(error instanceof ApiError ? error.message : "Monitoring could not be saved.");
  }

  private apply(ack: ProctorAck | null): void {
    if (!ack || this.stopped) return;
    this.ui.onWarnings(ack.warnings, ack.warning_limit);
    ack.recorded.forEach((item, index) => {
      const count = ack.warnings - ack.recorded.length + index + 1;
      this.ui.onWarning({
        type: item.type,
        details: item.details,
        count,
        limit: ack.warning_limit,
        locked: ack.disqualified && count >= ack.warning_limit,
      });
    });
    if (!ack.disqualified) return;
    this.ui.onStatus("Assessment locked: warning limit reached.");
    this.ui.onLocked();
    this.stop();
  }
}

function readBlendshapes(categories: { categoryName?: string; score?: number }[] | undefined): Blendshape[] {
  return (categories ?? []).flatMap((category) => {
    if (!category.categoryName || typeof category.score !== "number") return [];
    return [{ categoryName: category.categoryName, score: category.score }];
  });
}

const LIP_DELTA = 0.009;
const JAW_OPEN = 0.35;

function blendScore(blendshapes: Blendshape[], name: string): number {
  return blendshapes.find((shape) => shape.categoryName === name)?.score ?? 0;
}

function mouthIsMoving(lastLip: number | null, landmarks: { x: number; y: number }[] | undefined, jawOpen: number): { moving: boolean; opening: number | null } {
  const top = landmarks?.[13];
  const bottom = landmarks?.[14];
  if (!top || !bottom) return { moving: jawOpen >= JAW_OPEN, opening: lastLip };
  const opening = Math.abs(bottom.y - top.y);
  const lipMoving = lastLip !== null && Math.abs(opening - lastLip) > LIP_DELTA;
  return { moving: lipMoving || jawOpen >= JAW_OPEN, opening };
}

function brightness(video: HTMLVideoElement): Lighting {
  const canvas = brightnessCanvas();
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "good";
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    sum += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
  }
  const level = sum / (pixels.length / 4);
  if (level < 55) return "too_dark";
  if (level > 235) return "too_bright";
  return "good";
}

type EscapeLock = { lock: (keys?: string[]) => Promise<void>; unlock: () => void };

function escapeLock(): EscapeLock | null {
  const keyboard = (navigator as Navigator & { keyboard?: EscapeLock }).keyboard;
  if (!keyboard || typeof keyboard.lock !== "function" || typeof keyboard.unlock !== "function") return null;
  return keyboard;
}

function unlockEscape(): void {
  escapeLock()?.unlock();
}

let sharedCanvas: HTMLCanvasElement | null = null;

function brightnessCanvas(): HTMLCanvasElement {
  sharedCanvas ??= Object.assign(document.createElement("canvas"), { width: 32, height: 24 });
  return sharedCanvas;
}
