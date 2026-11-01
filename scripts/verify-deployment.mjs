import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultOrigin = "https://emote-exchange.onrender.com";
const routes = [
  "/",
  "/healthz",
  "/api/snapshot",
  "/events?client=dashboard",
  "/auth/login?role=broadcaster",
  "/overlay",
];

function matchesOverlay(value, origin) {
  if (value === `${origin}/overlay`) return true;
  try {
    const page = new URL(origin);
    const overlay = new URL(value);
    return (
      page.protocol === "http:" &&
      overlay.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(page.hostname) &&
      ["localhost", "127.0.0.1"].includes(overlay.hostname) &&
      page.port === overlay.port &&
      overlay.pathname === "/overlay" &&
      !overlay.username &&
      !overlay.password &&
      !overlay.search &&
      !overlay.hash
    );
  } catch {
    return false;
  }
}

export function parseOrigin(input) {
  const url = new URL(input);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !(url.protocol === "https:" || (url.protocol === "http:" && local))
  ) {
    throw new Error(
      "Use an HTTPS origin or an HTTP loopback origin without credentials or a path.",
    );
  }
  return url.origin;
}

export async function inspectDeployment(input, request = fetch) {
  const origin = parseOrigin(input);
  let snapshot;
  const checks = await Promise.all(
    routes.map(async (route) => {
      let response;
      try {
        response = await request(`${origin}${route}`, {
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
          headers: { Accept: route.startsWith("/events") ? "text/event-stream" : "*/*" },
        });
        const status = response.status;
        const type = response.headers.get("content-type")?.toLowerCase() ?? "";
        let ok = false;
        let detail = "Expected route response missing";
        if (route === "/" || route === "/overlay") {
          ok = status === 200 && type.includes("text/html");
          detail = ok ? "HTML available" : "Expected 200 HTML";
        } else if (route === "/healthz" || route === "/api/snapshot") {
          if (status === 200 && type.includes("application/json")) {
            const value = await response.json();
            if (route === "/healthz") ok = value?.ok === true;
            else {
              ok =
                value?.v === 1 &&
                value.app === "Emote Exchange" &&
                matchesOverlay(value.overlayUrl, origin);
              if (ok) snapshot = value;
            }
          }
          detail = ok
            ? "Application JSON verified"
            : route === "/healthz"
              ? "Expected 200 health JSON"
              : "Expected app snapshot with same-origin overlay URL";
        } else if (route.startsWith("/events")) {
          ok = status === 200 && type.includes("text/event-stream");
          detail = ok
            ? "SSE route opens; delivery needs live verification"
            : "Expected 200 event stream";
        } else if (route.startsWith("/auth/login")) {
          const location = response.headers.get("location");
          if ([302, 303].includes(status) && location) {
            const destination = new URL(location, origin);
            ok =
              destination.origin === "https://id.twitch.tv" &&
              destination.pathname === "/oauth2/authorize" &&
              destination.searchParams.get("redirect_uri") === `${origin}/auth/callback`;
          }
          detail = ok
            ? "Twitch authorization redirect verified"
            : "Expected Twitch redirect with matching callback";
        }
        return { route, status, ok, detail };
      } catch {
        return {
          route,
          status: response?.status ?? 0,
          ok: false,
          detail: "Request failed, timed out or returned malformed data",
        };
      } finally {
        if (response?.body && !response.bodyUsed) await response.body.cancel().catch(() => {});
      }
    }),
  );
  const dashboardProtected = ["/api/snapshot", "/events?client=dashboard"].every(
    (route) => checks.find((check) => check.route === route)?.status === 401,
  );
  if (dashboardProtected) {
    const publicChecks = await Promise.all(
      ["/api/snapshot?client=overlay", "/events?client=overlay"].map(async (route) => {
        let response;
        try {
          response = await request(`${origin}${route}`, {
            redirect: "manual",
            signal: AbortSignal.timeout(8000),
            headers: {
              Accept: route.startsWith("/events") ? "text/event-stream" : "application/json",
            },
          });
          const type = response.headers.get("content-type") ?? "";
          let ok =
            response.status === 200 &&
            type.includes(route.startsWith("/events") ? "text/event-stream" : "application/json");
          if (ok && route.startsWith("/api/")) {
            const data = await response.json();
            ok =
              data?.v === 1 &&
              Number.isSafeInteger(data.seq) &&
              data.app === "Emote Exchange" &&
              typeof data.simulatorRunning === "boolean" &&
              Array.isArray(data.moments) &&
              Array.isArray(data.market?.listings) &&
              Array.isArray(data.market?.traders) &&
              Object.keys(data).every((key) =>
                ["v", "seq", "app", "simulatorRunning", "market", "moments"].includes(key),
              );
          }
          return {
            route,
            status: response.status,
            ok,
            detail: ok
              ? "Public OBS projection verified; owner sign-in required for private status"
              : "Expected public OBS projection",
          };
        } catch {
          return {
            route,
            status: response?.status ?? 0,
            ok: false,
            detail: "Public OBS check failed",
          };
        } finally {
          if (response?.body && !response.bodyUsed) await response.body.cancel().catch(() => {});
        }
      }),
    );
    if (publicChecks.every((check) => check.ok))
      for (const check of checks)
        if (
          check.status === 401 &&
          ["/api/snapshot", "/events?client=dashboard"].includes(check.route)
        ) {
          check.ok = true;
          check.detail = "Owner sign-in required (expected protection)";
        }
    checks.push(...publicChecks);
  }
  const routesReady = checks.every((check) => check.ok);
  const twitchReady =
    routesReady &&
    snapshot?.auth?.broadcaster?.connected === true &&
    snapshot?.eventsub?.status === "connected";
  return { origin, checks, routesReady, twitchReady, dashboardProtected };
}

export function renderReport(report) {
  return [
    `origin: ${JSON.stringify(report.origin)}`,
    `routesReady: ${report.routesReady}`,
    `twitchReady: ${report.twitchReady}`,
    `dashboardProtected: ${report.dashboardProtected ?? false}`,
    `checks[${report.checks.length}]{route,status,result,detail}:`,
    ...report.checks.map(
      (c) =>
        `  ${JSON.stringify(c.route)},${c.status},${c.ok ? "pass" : "fail"},${JSON.stringify(c.detail)}`,
    ),
    "manualCheck: Verify a viewer command and its queued reply; route checks alone do not prove live trading.",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const help = `usage: ${JSON.stringify("pnpm verify:deployment [https://your-public-origin]")}\nexitCodes: 0 ready; 1 not ready; 2 invalid arguments`;
  if (args.length === 1 && args[0] === "--help") console.log(help);
  else {
    try {
      if (args.length > 1 || args.some((arg) => arg.startsWith("-")))
        throw new Error("Invalid arguments");
      const origin = parseOrigin(args[0] ?? defaultOrigin);
      const report = await inspectDeployment(origin);
      console.log(
        `tool: ${JSON.stringify(fileURLToPath(import.meta.url).replace(homedir(), "~"))}`,
      );
      console.log(renderReport(report));
      process.exitCode = report.routesReady && report.twitchReady ? 0 : 1;
    } catch {
      console.log(
        `error: Supply one HTTPS origin or HTTP loopback origin without credentials, path or query.\n${help}`,
      );
      process.exitCode = 2;
    }
  }
}
