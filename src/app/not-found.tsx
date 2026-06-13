/**
 * 404 catch-all. Replaces Next.js's default localized fallback so users
 * (including Telegram WebApp viewers on a non-English locale) always see
 * an English page instead of a localized "Страница не найдена".
 */
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d1117",
        color: "#e6edf3",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 20,
          padding: 32,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 12 }}>🔍</div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
          }}
        >
          Page not found
        </h1>
        <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 20px" }}>
          This link is broken, expired, or never existed.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            background: "#6366f1",
            color: "white",
            textDecoration: "none",
            borderRadius: 10,
            padding: "11px 22px",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Back to home
        </a>
      </div>
    </div>
  );
}
