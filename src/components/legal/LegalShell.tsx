import Link from "next/link";

const OF_BLUE = "#00AFF0";

export type LegalSection = { heading: string; paragraphs: string[] };

/**
 * Shared dark-theme shell for the static legal pages (/terms, /privacy,
 * /dmca). Pure presentational server component — each page passes its own
 * title + section data. The amber placeholder banner is a deliberate
 * reminder that the copy is a template to be replaced with reviewed legal
 * text; remove it once real copy is in.
 */
export function LegalShell({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <div style={{ background: "#080b12", minHeight: "100vh", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      <nav style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-[760px] mx-auto px-8 h-[66px] flex items-center">
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/logo.png" alt="ppvs.io" style={{ height: "28px", width: "auto", objectFit: "contain" }} />
          </Link>
        </div>
      </nav>
      <main className="max-w-[760px] mx-auto px-8 py-16">
        <Link href="/" style={{ fontSize: "13px", color: OF_BLUE }}>← Back to home</Link>
        <h1 className="text-white" style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em", margin: "20px 0 8px" }}>{title}</h1>
        <p style={{ fontSize: "13px", color: "#4b5563", marginBottom: "12px" }}>Last updated: {updated}</p>
        <p style={{ fontSize: "12px", color: "#9ca3af", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "10px 12px", marginBottom: "32px", lineHeight: 1.6 }}>
          This is a placeholder template. Replace it with your own legal copy, reviewed by counsel, before relying on it.
        </p>
        <div className="flex flex-col gap-8">
          {sections.map((s, i) => (
            <section key={i}>
              <h2 className="text-white" style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>{s.heading}</h2>
              {s.paragraphs.map((p, j) => (
                <p key={j} style={{ fontSize: "14px", color: "#8b95a8", lineHeight: 1.8, marginBottom: "10px" }}>{p}</p>
              ))}
            </section>
          ))}
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "48px", paddingTop: "24px", fontSize: "13px", color: "#374151" }}>
          © 2026 ppvs.io. All rights reserved.
        </div>
      </main>
    </div>
  );
}
