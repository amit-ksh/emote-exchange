export function isAllowedHost(
  host: string | undefined,
  port: number,
  publicOrigin?: string,
): boolean {
  if (publicOrigin) return host === new URL(publicOrigin).host;
  return host === `localhost:${port}` || host === `127.0.0.1:${port}`;
}

export function isAllowedOrigin(
  origin: string | undefined,
  port: number,
  publicOrigin?: string,
): boolean {
  if (publicOrigin) return origin === publicOrigin;
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
}
