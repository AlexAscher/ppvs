/**
 * Next.js instrumentation hook — runs once per server start.
 *
 * Optional: routes Node.js outbound `fetch` (Supabase auth, Supabase DB,
 * any other HTTPS our route handlers make) through an HTTP CONNECT proxy.
 * Useful when the host can't reach Supabase's IPs directly (e.g. RU ISP
 * without a system-wide VPN). gramJS for Telegram already has its own
 * proxy config (`TELEGRAM_PROXY_IP/PORT`) and is unaffected by this.
 *
 * Only HTTP proxies are supported via the env var. If you only have SOCKS
 * (V2Ray default port 10808 is SOCKS5), run a tiny SOCKS-to-HTTP shim like
 *   gost -L=http://:10810 -F=socks5://127.0.0.1:10808
 * and point HTTPS_PROXY at the HTTP side. (Native SOCKS support requires
 * `node:tls` which Turbopack pulls into the Edge bundle and warns about.)
 *
 * Configuration via .env.local:
 *   HTTPS_PROXY=http://127.0.0.1:10810
 * Then restart `npm run dev`.
 *
 * Defaults to no-op if no proxy env var is set.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    null;
  if (!proxyUrl) return;

  if (/^socks/i.test(proxyUrl)) {
    console.warn(
      `[instrumentation] SOCKS proxy ${proxyUrl} ignored — only HTTP proxies are supported here. ` +
        `Run a SOCKS-to-HTTP shim (e.g. \`gost -L=http://:10810 -F=socks5://...\`) and point HTTPS_PROXY at it.`,
    );
    return;
  }

  try {
    const { setGlobalDispatcher, ProxyAgent } = await import("undici");
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.log(`[instrumentation] Routing Node.js fetch via HTTP proxy ${proxyUrl}`);
  } catch (e) {
    console.error("[instrumentation] proxy setup failed:", e instanceof Error ? e.message : e);
  }
}
