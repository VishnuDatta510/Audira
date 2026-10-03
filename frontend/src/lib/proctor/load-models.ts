const VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

const MEDIAPIPE_LOG_NOISE = /^(INFO:|W\d{4}\s)|XNNPACK delegate|OpenGL error checking is disabled|Feedback manager requires a model|FaceBlendshapesGraph acceleration/;

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
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

export type DetectedObject = { class: string; score: number };

export type FaceLandmarker = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => {
    faceLandmarks?: { x: number; y: number }[][];
    faceBlendshapes?: { categories?: { categoryName?: string; score?: number }[] }[];
  };
  close: () => void;
};

export type ObjectDetector = {
  detect: (video: HTMLVideoElement) => Promise<DetectedObject[]>;
};

export async function loadFaceLandmarker(): Promise<FaceLandmarker> {
  silenceMediapipeLogs();
  const vision = await import("@mediapipe/tasks-vision");
  const files = await vision.FilesetResolver.forVisionTasks(VISION_WASM);
  const landmarker = await vision.FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: FACE_MODEL },
    runningMode: "VIDEO",
    numFaces: 2,
    outputFaceBlendshapes: true,
  });
  return landmarker as unknown as FaceLandmarker;
}

export async function loadObjectDetector(): Promise<ObjectDetector> {
  const tf = await import("@tensorflow/tfjs");
  await tf.ready();
  const coco = await import("@tensorflow-models/coco-ssd");
  return coco.load() as Promise<ObjectDetector>;
}
