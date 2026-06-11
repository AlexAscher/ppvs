export function buildTelegramClientOptions() {
  // The VPS↔Telegram link flaps (connections drop right after connect), so a
  // single attempt often times out — especially the login handshake. Give
  // connects a few retries and a slightly longer request timeout.
  const base = { connectionRetries: 3, timeout: 20 };
  if (process.env.TELEGRAM_PROXY_IP) {
    return {
      ...base,
      useWSS: false,
      proxy: {
        ip: process.env.TELEGRAM_PROXY_IP,
        port: Number(process.env.TELEGRAM_PROXY_PORT ?? 1080),
        socksType: 5 as const,
        username: process.env.TELEGRAM_PROXY_USER,
        password: process.env.TELEGRAM_PROXY_PASS,
      },
    };
  }
  return { ...base, useWSS: true };
}
