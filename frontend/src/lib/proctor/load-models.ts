// Pinned to the installed package and to fixed model versions, so detection never changes under a live hiring round.
const VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const OBJECT_MODEL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite";

const MEDIAPIPE_LOG_NOISE = /^(INFO:|W\d{4}\s)|XNNPACK delegate|OpenGL error checking is disabled|Feedback manager requires a model|FaceBlendshapesGraph acceleration|GL version|Graph successfully started|Created TensorFlow Lite/;

let mediapipeLogsSilenced = false;

/** MediaPipe writes startup notes to stderr. Next.js shows those as a crash overlay. */
export function silenceMediapipeLogs(): void {
  if (mediapipeLogsSilenced || typeof window === "undefined") return;
  mediapipeLogsSilenced = true;
  for (const method of ["error", "warn"] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      const text = args.map((arg) => (typeof arg === "string" ? arg : arg instanceof Error ? arg.message : "")).join(" ");
      if (MEDIAPIPE_LOG_NOISE.test(text)) return;
      original(...args);
    };
  }
}

export type Landmark = { x: number; y: number; z?: number };

export type FaceLandmarker = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => {
    faceLandmarks?: Landmark[][];
    faceBlendshapes?: { categories?: { categoryName?: string; score?: number }[] }[];
  };
};

export type ObjectDetector = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => {
    detections: { categories: { categoryName: string; score: number }[] }[];
  };
};

type Vision = typeof import("@mediapipe/tasks-vision");

let files: Promise<{ vision: Vision; fileset: Awaited<ReturnType<Vision["FilesetResolver"]["forVisionTasks"]>> }> | null = null;
let face: Promise<FaceLandmarker> | null = null;
let objects: Promise<ObjectDetector> | null = null;

function fileset() {
  silenceMediapipeLogs();
  files ??= import("@mediapipe/tasks-vision").then(async (vision) => ({ vision, fileset: await vision.FilesetResolver.forVisionTasks(VISION_WASM) }));
  return files;
}

/** One instance per page, reused when monitoring restarts. A failed load clears so the next try starts fresh. */
export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  face ??= fileset()
    .then(async ({ vision, fileset }) => {
      const options = { runningMode: "VIDEO" as const, numFaces: 2, outputFaceBlendshapes: true };
      try {
        // The GPU keeps the main thread free for the editor. Machines without WebGL fall back to the CPU.
        return await vision.FaceLandmarker.createFromOptions(fileset, { ...options, baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" } });
      } catch {
        return await vision.FaceLandmarker.createFromOptions(fileset, { ...options, baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" } });
      }
    })
    .then((landmarker) => landmarker as unknown as FaceLandmarker)
    .catch((error) => {
      face = null;
      throw error;
    });
  return face;
}

export function loadObjectDetector(): Promise<ObjectDetector> {
  objects ??= fileset()
    .then(({ vision, fileset }) =>
      vision.ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: OBJECT_MODEL, delegate: "CPU" },
        runningMode: "VIDEO",
        scoreThreshold: 0.35,
        maxResults: 6,
        categoryAllowlist: ["person", "cell phone"],
      }),
    )
    .then((detector) => detector as unknown as ObjectDetector)
    .catch((error) => {
      objects = null;
      throw error;
    });
  return objects;
}

/** Start downloading on the screen before the coding round, so pressing the button only asks for the camera. */
export function preloadModels(): void {
  void loadFaceLandmarker().catch(() => undefined);
  void loadObjectDetector().catch(() => undefined);
}
