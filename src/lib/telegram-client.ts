export function buildTelegramClientOptions() {
  const base = { connectionRetries: 1, timeout: 15 };
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
