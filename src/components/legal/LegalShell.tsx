import Link from "next/link";

const OF_BLUE = "#00AFF0";

/**
 * Rich block model used by the legal pages. Lets each page mix paragraphs,
 * bullet lists, and sub-headings without bespoke JSX per page. Keep blocks
 * small and faithful to the source PDFs supplied by counsel.
 */
export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "h3"; text: string };

export type LegalSection = { heading: string; blocks: LegalBlock[] };

/**
 * Shared dark-theme shell for /terms, /privacy, /dmca, /acceptable-use,
 * /content-policy. Pure presentational server component — each page passes
 * its title + section data. Brand header logo links back home.
 */
export function LegalShell({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  /** Optional paragraphs printed before the first numbered section. */
  intro?: string[];
  sections: LegalSection[];
}) {
  return (
    <div style={{ background: "#080b12", minHeight: "100vh", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      <nav style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-[820px] mx-auto px-8 h-[66px] flex items-center">
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/logo.png" alt="ppvs.io" style={{ height: "28px", width: "auto", objectFit: "contain" }} />
          </Link>
        </div>
      </nav>
      <main className="max-w-[820px] mx-auto px-8 py-16">
        <Link href="/" style={{ fontSize: "13px", color: OF_BLUE }}>← Back to home</Link>
        <h1 className="text-white" style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em", margin: "20px 0 8px" }}>{title}</h1>
        <p style={{ fontSize: "13px", color: "#4b5563", marginBottom: "28px" }}>Last updated: {updated}</p>

        {intro && intro.length > 0 && (
          <div style={{ marginBottom: "28px" }}>
            {intro.map((t, i) => (
              <p key={i} style={{ fontSize: "15px", color: "#cbd5e1", lineHeight: 1.8, marginBottom: "12px" }}>{t}</p>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-9">
          {sections.map((s, i) => (
            <section key={i}>
              <h2 className="text-white" style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>{`${i + 1}. ${s.heading}`}</h2>
              {s.blocks.map((b, j) => {
                if (b.kind === "p") {
                  return (
                    <p key={j} style={{ fontSize: "14.5px", color: "#9aa6b8", lineHeight: 1.85, marginBottom: "12px" }}>{b.text}</p>
                  );
                }
                if (b.kind === "h3") {
                  return (
                    <h3 key={j} className="text-white" style={{ fontSize: "15px", fontWeight: 600, margin: "8px 0 10px" }}>{b.text}</h3>
                  );
                }
                // ul
                return (
                  <ul key={j} style={{ listStyle: "disc", paddingLeft: "22px", marginBottom: "14px" }}>
                    {b.items.map((it, k) => (
                      <li key={k} style={{ fontSize: "14.5px", color: "#9aa6b8", lineHeight: 1.85, marginBottom: "6px" }}>{it}</li>
                    ))}
                  </ul>
                );
              })}
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
