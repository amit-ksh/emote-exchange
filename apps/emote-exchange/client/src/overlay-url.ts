export function defaultOverlayUrl(pageOrigin: string): string {
  const url = new URL("/overlay", pageOrigin);
  if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    url.hostname = "127.0.0.1";
  return url.href;
}

export function isOverlayUrl(value: string, pageOrigin: string): boolean {
  try {
    const url = new URL(value);
    const page = new URL(pageOrigin);
    const local =
      url.protocol === "http:" &&
      page.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      ["localhost", "127.0.0.1"].includes(page.hostname) &&
      url.port === page.port;
    return (
      (local || (url.protocol === "https:" && url.origin === page.origin)) &&
      url.pathname === "/overlay" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
