export type Lighting = "good" | "too_dark" | "too_bright";

export type VisionPayload = {
  face_visible: boolean;
  people_count: number;
  lighting: Lighting;
  gaze_away_seconds: number;
  mouth_motion_seconds: number;
  voice_seconds: number;
  source: string;
};

export type ProctorEventType =
  | "tab_hidden"
  | "fullscreen_exit"
  | "suspicious_phone"
  | "camera_unavailable"
  | "multiple_people"
  | "second_screen"
  | "virtual_camera"
  | "external_paste"
  | "identity_change";

export type RecordedWarning = {
  id: string;
  type: string;
  details: string;
  /** How much this one counted toward the limit. Zero means it is only for review. */
  weight: number;
  /** The warning total right after this one was recorded. */
  warnings: number;
};

export type ProctorAck = {
  warnings: number;
  warning_limit: number;
  disqualified: boolean;
  recorded: RecordedWarning[];
};

type StoredEvent = { id?: string; type?: string; details?: string; weight?: number };
type Outcome = { warnings: number; event?: StoredEvent };

export function toProctorAck(body: {
  warnings: number;
  warning_limit: number;
  disqualified?: boolean;
  event?: StoredEvent;
  observations?: Outcome[];
}): ProctorAck {
  const outcomes: Outcome[] = body.observations ?? (body.event ? [{ warnings: body.warnings, event: body.event }] : []);
  const recorded = outcomes.flatMap((item) => {
    const type = item.event?.type;
    if (!type || type === "mouth_motion") return [];
    return [{ id: item.event?.id ?? "", type, details: item.event?.details ?? "", weight: item.event?.weight ?? 1, warnings: item.warnings }];
  });
  return {
    warnings: body.warnings,
    warning_limit: body.warning_limit,
    disqualified: Boolean(body.disqualified),
    recorded,
  };
}
