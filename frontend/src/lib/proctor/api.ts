export type Lighting = "good" | "too_dark" | "too_bright";

export type VisionPayload = {
  face_visible: boolean;
  people_count: number;
  lighting: Lighting;
  gaze_away_seconds: number;
  mouth_motion_seconds: number;
  source: string;
};

export type ProctorEventType = "tab_hidden" | "fullscreen_exit" | "suspicious_phone" | "camera_unavailable" | "multiple_people";

export type RecordedWarning = {
  type: string;
  details: string;
};

export type ProctorAck = {
  warnings: number;
  warning_limit: number;
  disqualified: boolean;
  recorded: RecordedWarning[];
};

type StoredEvent = { type?: string; details?: string };

export function toProctorAck(body: {
  warnings: number;
  warning_limit: number;
  disqualified?: boolean;
  event?: StoredEvent;
  observations?: { event?: StoredEvent }[];
}): ProctorAck {
  const recorded = body.observations
    ? body.observations.flatMap((item) => {
        const type = item.event?.type;
        if (!type || type === "mouth_motion") return [];
        return [{ type, details: item.event?.details ?? "" }];
      })
    : body.event?.type
      ? [{ type: body.event.type, details: body.event.details ?? "" }]
      : [];
  return {
    warnings: body.warnings,
    warning_limit: body.warning_limit,
    disqualified: Boolean(body.disqualified),
    recorded,
  };
}
