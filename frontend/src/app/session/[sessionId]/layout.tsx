import { SessionFrame } from "@/components/session/session-frame";

export default async function SessionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SessionFrame sessionId={sessionId}>{children}</SessionFrame>;
}
