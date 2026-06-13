"use client";

import { useEffect } from "react";

/**
 * App-level error boundary. Next.js mounts this when a server / client
 * component below `/app` throws an unhandled error. We render a minimal,
 * fully-English fallback so users (including Telegram WebApp viewers on
 * a non-English locale) never see a localized "не могу подключить" page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#0d1117", color: "#e6edf3", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
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
            <div style={{ fontSize: 56, marginBottom: 12 }}>⚠️</div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: "0 0 8px",
                letterSpacing: "-0.02em",
              }}
            >
              Something went wrong
            </h1>
            <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 20px" }}>
              We hit an unexpected error. Try again — if it keeps happening,
              please reach out on Telegram.
            </p>
            <button
              onClick={reset}
              style={{
                background: "#6366f1",
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
          </div>
        </div>
      </body>
    </html>
  );
}
