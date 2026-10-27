export interface ExchangeConfig {
  port: number;
  publicOrigin: string;
}

export function readConfig(environment: Record<string, string | undefined>): ExchangeConfig {
  const portText = environment.PORT ?? "4100";
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a whole number between 1 and 65535.");
  }
  const publicOrigin = environment.PUBLIC_ORIGIN ?? `http://localhost:${port}`;
  if (publicOrigin !== `http://localhost:${port}` && publicOrigin !== `http://127.0.0.1:${port}`) {
    throw new Error("PUBLIC_ORIGIN must be an exact HTTP loopback origin at PORT.");
  }
  return { port, publicOrigin };
}
