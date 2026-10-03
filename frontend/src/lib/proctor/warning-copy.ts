const WARNING_TYPES = [
  "tab_hidden",
  "fullscreen_exit",
  "face_missing",
  "multiple_people",
  "low_light",
  "suspicious_gaze",
  "suspicious_lip_movement",
  "suspicious_phone",
  "camera_unavailable",
] as const;

type WarningType = (typeof WARNING_TYPES)[number];

export type WarningCopy = { title: string; detail: string };

function isWarningType(value: string): value is WarningType {
  return (WARNING_TYPES as readonly string[]).includes(value);
}

export function describeWarning(type: string, details: string): WarningCopy {
  if (!isWarningType(type)) return { title: "Monitoring warning", detail: details || "A monitoring warning was recorded." };
  switch (type) {
    case "tab_hidden":
      if (details.toLowerCase().includes("lost focus")) return { title: "Left the window", detail: "The assessment window lost focus." };
      return { title: "Left this tab", detail: "The assessment tab was hidden." };
    case "fullscreen_exit":
      return { title: "Tried to leave full-screen", detail: "That attempt was counted. The assessment stays full-screen." };
    case "face_missing":
      return { title: "Face not visible", detail: "Your face left the camera." };
    case "multiple_people": {
      const count = details.match(/(\d+)/)?.[1];
      return { title: "More than one person", detail: count ? `The camera saw ${count} people.` : "The camera saw more than one person." };
    }
    case "low_light":
      if (details.includes("too_bright")) return { title: "Too much light", detail: "The camera image is too bright to see your face." };
      return { title: "Too little light", detail: "The camera image is too dark to see your face." };
    case "suspicious_gaze": {
      const seconds = details.match(/([\d.]+) seconds/)?.[1];
      return {
        title: "Looking away from the screen",
        detail: seconds ? `Your eyes stayed off the screen for ${seconds} seconds.` : "Your eyes stayed off the screen.",
      };
    }
    case "suspicious_lip_movement":
      return { title: "Mouth movement flagged", detail: details || "Mouth movement was recorded for review." };
    case "suspicious_phone":
      return { title: "Phone detected", detail: "A phone is visible in the camera." };
    case "camera_unavailable":
      return { title: "Camera unavailable", detail: details || "The camera could not keep monitoring." };
    default: {
      const neverType: never = type;
      return neverType;
    }
  }
}
