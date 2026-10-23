import { ApiError, api } from "@/lib/api";
import type { Lighting, ProctorAck, ProctorEventType, VisionPayload } from "./api";
import { ActiveTimer, GazeTracker, Latch, classifyGaze, describeDirection, type Blendshape, type Landmark } from "./gaze";
import { IdentityWatch, faceShape, facesCamera } from "./identity";
import { loadFaceLandmarker, loadObjectDetector, type FaceLandmarker, type ObjectDetector } from "./load-models";
import { listenForVoice, type VoiceMeter } from "./voice";

const DETECT_MS = 100;
const VISION_MS = 2000;
const OBJECT_MS = 1000;
const FACE_MISSING_SECONDS = 2;
const EVENT_COOLDOWN_MS = 8000;
const BLUR_GRACE_MS = 2000;
const MUTE_GRACE_MS = 3000;
const RETRY_MS = 3000;
const STATUS_HOLD_MS = 800;
const ERROR_STATUS_MS = 5000;
// ponytail: detector scores picked by eye on a laptop webcam. Tune them on real attempts before tightening the limit.
const PHONE_SCORE = 0.5;
const PERSON_SCORE = 0.6;
const PHONE_HITS = 2;
// A second person needs a few frames in a window, and both they and a phone stay "seen" for a while, so a flickering detection counts once.
const CROWD_FRAMES = 3;
const SEEN_HOLD_MS = 6000;
const PASTE_CHARS = 80;
const STILL = { width: 320, height: 240, quality: 0.6 };
// Only these are about what the camera saw, so only these keep a still. The server keeps a limited number.
const SEEN_ON_CAMERA = new Set(["face_missing", "multiple_people", "suspicious_gaze", "suspicious_phone", "voice_detected", "identity_change", "virtual_camera"]);
const VIRTUAL_CAMERA = /obs|virtual|manycam|snap camera|xsplit|droidcam|epoccam|camo|mmhmm|vcam|nvidia broadcast/i;

export type ProctorTone = "idle" | "active" | "attention";

export type WarningNotice = {
  type: string;
  details: string;
  /** What this one added to the count. Zero means it is noted for review only. */
  weight: number;
  count: number;
  limit: number;
  locked: boolean;
};

export type ProctorUi = {
  onStatus: (status: string, tone: ProctorTone) => void;
  onWarnings: (warnings: number, limit: number) => void;
  onWarning: (notice: WarningNotice) => void;
  onLocked: () => void;
  /** Monitoring ended without a lock, for example when the camera was unplugged. */
  onStopped: (reason: string) => void;
};

type PendingEvent = { type: ProctorEventType; details: string; still: string | null };

export class ProctorEngine {
  private stopped = false;
  private ready = false;
  private detectTimer = 0;
  private visionTimer = 0;
  private retryTimer = 0;
  private blurTimer = 0;
  private muteTimers = new Map<MediaStreamTrack, number>();
  private landmarker: FaceLandmarker | null = null;
  private objects: ObjectDetector | null = null;
  private audio: AudioContext | null = null;
  private voice: VoiceMeter | null = null;
  private gaze = new GazeTracker();
  private mouth = new ActiveTimer();
  private missing = new ActiveTimer();
  private identity = new IdentityWatch();
  private phone = new Latch();
  private screens = new Latch();
  private phoneHits = 0;
  private phoneUntil = 0;
  private crowdUntil = 0;
  private lastLip: number | null = null;
  private lastObjects = 0;
  private lastErrorAt = 0;
  private people = 0;
  // Detection runs ten times a second and the server hears every two. These hold the worst of each window.
  private peak = { faces: 0, crowdFrames: 0, missingSeconds: 0, gazeAwaySeconds: 0, mouthSeconds: 0, voiceSeconds: 0 };
  private status = { shown: "", candidate: "", since: 0 };
  private copied = "";
  private eventSent = new Map<ProctorEventType, number>();
  private pending: PendingEvent[] = [];
  private flushing: Promise<void> | null = null;
  private transportNoted = false;

  constructor(
    private readonly sessionId: string,
    private readonly video: HTMLVideoElement,
    private readonly ui: ProctorUi,
  ) {}

  /** Call straight from the click. Full-screen and audio need the click's permission, so both are asked for before any await. */
  start(): Promise<void> {
    if (document.fullscreenEnabled && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => undefined);
    this.audio = typeof AudioContext === "undefined" ? null : new AudioContext();
    return this.begin();
  }

  private async begin(): Promise<void> {
    this.ui.onStatus("Requesting the camera and microphone…", "idle");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (this.stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.video.srcObject = stream;
      await this.video.play();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Camera or microphone permission was blocked.";
      this.report("camera_unavailable", message);
      throw new Error("Allow the camera and microphone before the coding round.");
    }
    if (this.stopped) return;
    this.ui.onStatus("Loading the face model…", "idle");
    try {
      this.landmarker = await loadFaceLandmarker();
      this.objects = await loadObjectDetector().catch(() => null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Face model failed to load.";
      this.report("camera_unavailable", message);
      throw new Error(message);
    }
    if (this.stopped) return;
    if (this.audio) {
      void this.audio.resume().catch(() => undefined);
      this.voice = listenForVoice(stream, this.audio);
    }
    this.watchTracks(stream);
    this.listen();
    this.ready = true;
    this.checkSetup(stream);
    this.ui.onStatus("Monitoring active.", "active");
    this.detectTimer = window.setInterval(this.detect, DETECT_MS);
    this.visionTimer = window.setInterval(this.sendVision, VISION_MS);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.ready = false;
    window.clearInterval(this.detectTimer);
    window.clearInterval(this.visionTimer);
    window.clearTimeout(this.blurTimer);
    this.muteTimers.forEach((timer) => window.clearTimeout(timer));
    document.removeEventListener("visibilitychange", this.onVisibility);
    document.removeEventListener("fullscreenchange", this.onFullscreen);
    document.removeEventListener("copy", this.onCopy);
    document.removeEventListener("cut", this.onCopy);
    document.removeEventListener("paste", this.onPaste, true);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("focus", this.onFocus);
    screenDetails()?.removeEventListener?.("change", this.onScreens);
    escapeLock()?.unlock();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    this.voice?.close();
    this.voice = null;
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
    // The models stay loaded for the next start; only the camera is released.
    this.landmarker = null;
    this.objects = null;
    const stream = this.video.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    this.video.srcObject = null;
  }

  /** Sends every queued warning. The coding round waits on this before it submits. */
  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private listen(): void {
    document.addEventListener("visibilitychange", this.onVisibility);
    document.addEventListener("fullscreenchange", this.onFullscreen);
    document.addEventListener("copy", this.onCopy);
    document.addEventListener("cut", this.onCopy);
    document.addEventListener("paste", this.onPaste, true);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("focus", this.onFocus);
    screenDetails()?.addEventListener?.("change", this.onScreens);
    if (document.fullscreenElement) void lockEscape();
  }

  private watchTracks(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      const what = track.kind === "video" ? "camera" : "microphone";
      track.addEventListener("ended", () => this.lose(`The ${what} was disconnected.`));
      track.addEventListener("mute", () => {
        window.clearTimeout(this.muteTimers.get(track));
        this.muteTimers.set(track, window.setTimeout(() => this.lose(`The ${what} stopped sending.`), MUTE_GRACE_MS));
      });
      track.addEventListener("unmute", () => window.clearTimeout(this.muteTimers.get(track)));
    }
  }

  private lose(reason: string): void {
    if (this.stopped) return;
    this.report("camera_unavailable", reason);
    this.stop();
    this.ui.onStopped(`${reason} Turn it back on to keep going.`);
  }

  private checkSetup(stream: MediaStream): void {
    const label = stream.getVideoTracks()[0]?.label ?? "";
    if (VIRTUAL_CAMERA.test(label)) this.report("virtual_camera", `The camera "${label}" looks like virtual camera software.`);
    this.onScreens();
  }

  private onScreens = (): void => {
    if (this.screens.rising(Boolean(screenDetails()?.isExtended))) this.report("second_screen", "More than one display is connected to this computer.");
  };

  private onVisibility = (): void => {
    if (!document.hidden) return;
    window.clearTimeout(this.blurTimer);
    this.report("tab_hidden", "Assessment tab became hidden.");
  };

  // A notification or a system dialog can take focus for a moment. Only a longer absence counts.
  private onBlur = (): void => {
    window.clearTimeout(this.blurTimer);
    this.blurTimer = window.setTimeout(() => {
      if (!document.hidden && !document.hasFocus()) this.report("tab_hidden", "The assessment window lost focus for more than 2 seconds.");
    }, BLUR_GRACE_MS);
  };

  private onFocus = (): void => window.clearTimeout(this.blurTimer);

  private onFullscreen = (): void => {
    if (document.fullscreenElement) {
      void lockEscape();
      return;
    }
    if (this.ready) this.report("fullscreen_exit", "Left full-screen.");
  };

  // The editor writes its own clipboard data, so the copied text is read after it has run.
  private onCopy = (event: ClipboardEvent): void => {
    this.copied = event.clipboardData?.getData("text/plain") || window.getSelection()?.toString() || "";
  };

  private onPaste = (event: ClipboardEvent): void => {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text.trim().length < PASTE_CHARS) return;
    const pasted = squash(text);
    const copied = squash(this.copied);
    if (copied && (copied.includes(pasted) || pasted.includes(copied))) return;
    this.report("external_paste", `Pasted ${text.length} characters that were not copied inside the assessment.`);
  };

  private detect = (): void => {
    if (!this.landmarker || this.video.readyState < 2) return;
    const now = performance.now();
    try {
      const result = this.landmarker.detectForVideo(this.video, now);
      const faces = result.faceLandmarks?.length ?? 0;
      const missingSeconds = this.missing.push(faces === 0, now);
      const peak = this.peak;
      peak.faces = Math.max(peak.faces, faces);
      peak.missingSeconds = Math.max(peak.missingSeconds, missingSeconds);
      peak.voiceSeconds = Math.max(peak.voiceSeconds, this.voice?.read(now) ?? 0);
      let direction: ReturnType<GazeTracker["sample"]>["direction"] = "center";
      if (faces > 0) {
        const landmarks = result.faceLandmarks?.[0] ?? [];
        const blendshapes = readBlendshapes(result.faceBlendshapes?.[0]?.categories);
        const sample = this.gaze.sample(classifyGaze(landmarks, blendshapes), now);
        direction = sample.direction;
        peak.gazeAwaySeconds = Math.max(peak.gazeAwaySeconds, sample.gazeAwaySeconds);
        const mouth = mouthIsMoving(this.lastLip, landmarks, blendScore(blendshapes, "jawOpen"));
        this.lastLip = mouth.opening;
        peak.mouthSeconds = Math.max(peak.mouthSeconds, this.mouth.push(mouth.moving, now));
        if (faces === 1 && direction === "center") this.checkIdentity(landmarks, now);
      } else if (missingSeconds >= FACE_MISSING_SECONDS) {
        this.gaze.reset();
        this.mouth.reset();
        this.lastLip = null;
      }
      this.detectObjects(now);
      const people = Math.max(faces, this.people);
      if (people > 1) peak.crowdFrames += 1;
      if (missingSeconds >= FACE_MISSING_SECONDS) this.publish("Your face is not in view.", "attention", now);
      else if (people > 1) this.publish("More than one person is in view.", "attention", now);
      else if (direction !== "center") this.publish(`${describeDirection(direction)}.`, "attention", now);
      else this.publish("Monitoring active.", "active", now);
    } catch (error) {
      if (now - this.lastErrorAt < ERROR_STATUS_MS) return;
      this.lastErrorAt = now;
      this.ui.onStatus(error instanceof Error ? error.message : "A monitoring frame failed.", "attention");
    }
  };

  private checkIdentity(landmarks: Landmark[], now: number): void {
    if (!facesCamera(landmarks)) return;
    const shape = faceShape(landmarks, this.video.videoWidth / Math.max(1, this.video.videoHeight));
    if (shape && this.identity.sample(shape, now)) this.report("identity_change", "The face in view no longer matches the one seen when monitoring started.");
  }

  private detectObjects(now: number): void {
    if (!this.objects || now - this.lastObjects < OBJECT_MS) return;
    this.lastObjects = now;
    const found = this.objects.detectForVideo(this.video, now).detections.flatMap((item) => item.categories);
    this.people = found.filter((item) => item.categoryName === "person" && item.score >= PERSON_SCORE).length;
    // Two readings in a row, so a single misread frame of a remote or a mug does not cost the candidate.
    this.phoneHits = found.some((item) => item.categoryName === "cell phone" && item.score >= PHONE_SCORE) ? this.phoneHits + 1 : 0;
    if (this.phoneHits >= PHONE_HITS) this.phoneUntil = now + SEEN_HOLD_MS;
    if (this.phone.rising(now < this.phoneUntil)) this.report("suspicious_phone", "A phone was seen by the camera.");
  }

  private publish(text: string, tone: ProctorTone, now: number): void {
    const status = this.status;
    if (text !== status.candidate) {
      status.candidate = text;
      status.since = now;
    }
    if (text === status.shown || now - status.since < STATUS_HOLD_MS) return;
    status.shown = text;
    this.ui.onStatus(text, tone);
  }

  private sendVision = (): void => {
    if (!this.ready || this.video.readyState < 2) return;
    const peak = this.peak;
    const now = performance.now();
    if (peak.crowdFrames >= CROWD_FRAMES) this.crowdUntil = now + SEEN_HOLD_MS;
    const seen = Math.max(peak.faces, this.people);
    const payload: VisionPayload = {
      face_visible: peak.missingSeconds < FACE_MISSING_SECONDS,
      people_count: now < this.crowdUntil ? Math.max(2, seen) : Math.min(1, seen),
      lighting: brightness(this.video),
      gaze_away_seconds: peak.gazeAwaySeconds,
      mouth_motion_seconds: peak.mouthSeconds,
      voice_seconds: peak.voiceSeconds,
      source: "mediapipe_browser",
    };
    this.peak = { faces: 0, crowdFrames: 0, missingSeconds: 0, gazeAwaySeconds: 0, mouthSeconds: 0, voiceSeconds: 0 };
    const unusual = !payload.face_visible || payload.people_count > 1 || payload.gaze_away_seconds > 0 || payload.voice_seconds > 0;
    const still = unusual ? this.capture() : null;
    void api.visionObservation(this.sessionId, payload).then(
      (ack) => {
        this.transportNoted = false;
        this.apply(ack, still);
      },
      (error) => this.noteTransport(error),
    );
  };

  private report(type: ProctorEventType, details: string): void {
    const previous = this.eventSent.get(type) ?? 0;
    if (previous !== 0 && performance.now() - previous < EVENT_COOLDOWN_MS) return;
    this.eventSent.set(type, performance.now());
    this.pending.push({ type, details, still: SEEN_ON_CAMERA.has(type) ? this.capture() : null });
    void this.flush();
  }

  private async drain(): Promise<void> {
    window.clearTimeout(this.retryTimer);
    while (this.pending.length) {
      const item = this.pending[0];
      try {
        const ack = await api.proctorEvent(this.sessionId, item.type, item.details);
        this.pending.shift();
        this.apply(ack, item.still);
      } catch (error) {
        // The server turned it down, so sending it again would not help.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          this.pending.shift();
          continue;
        }
        this.noteTransport(error);
        this.retryTimer = window.setTimeout(() => void this.flush(), RETRY_MS);
        return;
      }
    }
    this.transportNoted = false;
  }

  private noteTransport(error: unknown): void {
    if (this.stopped || this.transportNoted) return;
    this.transportNoted = true;
    this.status.shown = "";
    this.ui.onStatus(error instanceof ApiError ? error.message : "Monitoring could not be saved. Retrying.", "attention");
  }

  private apply(ack: ProctorAck, still: string | null): void {
    this.ui.onWarnings(ack.warnings, ack.warning_limit);
    for (const item of ack.recorded) {
      if (still && item.id && SEEN_ON_CAMERA.has(item.type)) void api.uploadEvidence(this.sessionId, item.id, still).catch(() => undefined);
      this.ui.onWarning({
        type: item.type,
        details: item.details,
        weight: item.weight,
        count: item.warnings,
        limit: ack.warning_limit,
        locked: ack.disqualified && item.warnings >= ack.warning_limit,
      });
    }
    if (!ack.disqualified) return;
    this.ui.onStatus("Assessment locked: warning limit reached.", "attention");
    this.ui.onLocked();
    this.stop();
  }

  /** A small still for the recruiter to check the call. Null when the camera has no frame yet. */
  private capture(): string | null {
    if (this.video.readyState < 2) return null;
    const canvas = Object.assign(document.createElement("canvas"), { width: STILL.width, height: STILL.height });
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(this.video, 0, 0, STILL.width, STILL.height);
    return canvas.toDataURL("image/jpeg", STILL.quality);
  }
}

function squash(text: string): string {
  return text.replace(/\s+/g, "");
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

function mouthIsMoving(lastLip: number | null, landmarks: Landmark[], jawOpen: number): { moving: boolean; opening: number | null } {
  const top = landmarks[13];
  const bottom = landmarks[14];
  if (!top || !bottom) return { moving: jawOpen >= JAW_OPEN, opening: lastLip };
  const opening = Math.abs(bottom.y - top.y);
  const lipMoving = lastLip !== null && Math.abs(opening - lastLip) > LIP_DELTA;
  return { moving: lipMoving || jawOpen >= JAW_OPEN, opening };
}

let sharedCanvas: HTMLCanvasElement | null = null;

function brightness(video: HTMLVideoElement): Lighting {
  sharedCanvas ??= Object.assign(document.createElement("canvas"), { width: 32, height: 24 });
  const context = sharedCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "good";
  context.drawImage(video, 0, 0, sharedCanvas.width, sharedCanvas.height);
  const pixels = context.getImageData(0, 0, sharedCanvas.width, sharedCanvas.height).data;
  let sum = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    sum += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
  }
  const level = sum / (pixels.length / 4);
  if (level < 55) return "too_dark";
  if (level > 235) return "too_bright";
  return "good";
}

type ScreenWithDisplays = Screen & Partial<EventTarget> & { isExtended?: boolean };

function screenDetails(): ScreenWithDisplays | null {
  return typeof window === "undefined" ? null : (window.screen as ScreenWithDisplays);
}

type EscapeLock = { lock: (keys?: string[]) => Promise<void>; unlock: () => void };

function escapeLock(): EscapeLock | null {
  const keyboard = (navigator as Navigator & { keyboard?: EscapeLock }).keyboard;
  if (!keyboard || typeof keyboard.lock !== "function" || typeof keyboard.unlock !== "function") return null;
  return keyboard;
}

// Holding Escape means a quick press, like closing the editor's suggestions, does not drop full-screen. Leaving still counts.
async function lockEscape(): Promise<void> {
  try {
    await escapeLock()?.lock(["Escape"]);
  } catch {
    // Not every browser lets a page hold Escape.
  }
}
