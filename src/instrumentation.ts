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

  await setupProxy();

  // Start the Sales-Alert bot's getUpdates poller. Idempotent + a no-op
  // when TELEGRAM_BOT_TOKEN isn't set, so it's safe to always call.
  try {
    const { startAlertBotPolling } = await import("@/lib/alert-bot");
    startAlertBotPolling();
  } catch (e) {
    console.error("[instrumentation] alert bot start failed:", e instanceof Error ? e.message : e);
  }

  // Keep models with auto-replies enabled connected so their first-message
  // auto-reply fires instantly instead of after the next reconnect.
  try {
    const { startAutoReplyKeepAlive } = await import("@/lib/auto-reply-keepalive");
    startAutoReplyKeepAlive();
  } catch (e) {
    console.error("[instrumentation] auto-reply keep-alive start failed:", e instanceof Error ? e.message : e);
  }
}

async function setupProxy() {
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
