import { VoiceInterview } from "@/components/interview/voice-interview";
import { SessionDashboard } from "@/components/session/session-dashboard";
import type { VoiceSectionId } from "@/lib/types";

function voiceSection(value: string | undefined): VoiceSectionId | null {
  if (value === "project" || value === "fundamentals") return value;
  return null;
}

export default async function SessionWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const { sessionId } = await params;
  const raw = (await searchParams).section;
  const section = voiceSection(Array.isArray(raw) ? raw[0] : raw);
  if (section) return <VoiceInterview sessionId={sessionId} section={section} />;

  return <SessionDashboard sessionId={sessionId} />;
}
