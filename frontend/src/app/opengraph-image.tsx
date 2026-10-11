import { ImageResponse } from "next/og";

export const alt = "Audira, the technical interview that listens";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const WAVE = "M2 19 q1.1 -2.1 2.2 0" + " t2.2 0".repeat(12);

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#103a2e",
          backgroundImage: "radial-gradient(circle at 85% 20%, #1d6a55 0%, transparent 55%)",
          color: "#f1f8f4",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="76" height="76" viewBox="0 0 32 32">
            <defs>
              <clipPath id="c">
                <rect x="11.2" y="14" width="9.6" height="10" />
              </clipPath>
            </defs>
            <rect width="32" height="32" rx="9.5" fill="#1d6a55" />
            <path d="M8.6 25 L16 7.2 L23.4 25" fill="none" stroke="#f1f8f4" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
            <path clipPath="url(#c)" d={WAVE} fill="none" stroke="#e8ad4b" strokeWidth="2.3" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.02em" }}>Audira</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 84, fontWeight: 700, lineHeight: 1.04, letterSpacing: "-0.04em" }}>
            <span>The technical interview</span>
            <span style={{ display: "flex" }}>
              that&nbsp;<span style={{ color: "#e8ad4b" }}>listens.</span>
            </span>
          </div>
          <div style={{ fontSize: 30, color: "#a9c9bb", maxWidth: 900, lineHeight: 1.35 }}>
            A coding round, two spoken rounds that follow up, and a report that explains every score.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
