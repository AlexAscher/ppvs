"use client";

/**
 * Top-level error boundary — replaces Next.js's root-layout fallback when
 * even the layout itself crashes. Renders its own <html>/<body> so the
 * page is always English regardless of how badly the app failed (this is
 * the screen the user would see if the IP / backend couldn't even mount).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: "#0d1117", color: "#e6edf3", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
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
            <div style={{ fontSize: 56, marginBottom: 12 }}>🛠️</div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: "0 0 8px",
                letterSpacing: "-0.02em",
              }}
            >
              Service temporarily unavailable
            </h1>
            <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 20px" }}>
              We can&apos;t reach the server right now. Check your connection
              and try again — if the issue persists, please message the model
              on Telegram.
            </p>
            <button
              onClick={reset}
              style={{
                background: "#00AFF0",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "11px 22px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {error?.digest && (
              <div style={{ fontSize: 10, color: "#484f58", marginTop: 14 }}>
                Ref: {error.digest}
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
