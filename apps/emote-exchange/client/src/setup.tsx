import { useState } from "react";
import type { FoundationSnapshot } from "../../src/public-state.ts";

export function SetupChecklist({
  snapshot,
  current,
}: {
  snapshot: FoundationSnapshot | null;
  current: boolean;
}) {
  const connected = current && snapshot?.auth.broadcaster.connected;
  const overlay = current && (snapshot?.overlayClients ?? 0) > 0;
  const online =
    connected &&
    snapshot?.eventsub.status === "connected" &&
    snapshot.eventsub.streamStatus === "online";
  const steps = [
    {
      label: "Connect Twitch",
      done: connected,
      href: "#twitch-title",
      detail: connected
        ? `Connected as @${snapshot?.auth.broadcaster.login}`
        : "Connect your broadcaster account for live chat. Demo works without it.",
    },
    {
      label: "Overlay connected",
      done: overlay,
      href: "#overlay-title",
      detail: overlay
        ? `${snapshot?.overlayClients} overlay browser connection${snapshot?.overlayClients === 1 ? "" : "s"}. Check placement in OBS.`
        : "Add the Browser source in OBS, or open the overlay to preview it.",
    },
    {
      label: "Go live",
      done: online,
      href: "#eventsub-title",
      detail: online
        ? "Twitch reported that your stream is live."
        : snapshot?.eventsub.streamStatus === "offline" && current
          ? "Twitch reported that your stream is offline."
          : "Waiting for a Twitch stream event. Start your stream in OBS when ready.",
    },
  ];
  return (
    <section className="overlay-setup setup-checklist" aria-labelledby="setup-title">
      <p className="eyebrow">STREAM SETUP</p>
      <h2 id="setup-title">Setup checklist</h2>
      <p className="copy-feedback">Demo mode works without Twitch.</p>
      <ol className="setup-steps">
        {steps.map((step, index) => (
          <li key={step.label}>
            <span
              className={`setup-step-mark${step.done ? " setup-step-mark--done" : ""}`}
              aria-hidden="true"
            >
              {step.done ? "✓" : index + 1}
            </span>
            <div>
              <h3>
                <a href={step.href}>{step.label}</a>
                <span className="setup-step-state">{step.done ? "Complete" : "Waiting"}</span>
              </h3>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="copy-feedback" role="status">
        {current && `${steps.filter((step) => step.done).length} of 3 setup steps complete. `}
        {!current && "Waiting for local updates."}
      </p>
    </section>
  );
}

export function OverlayUrlPanel({
  url,
  clients,
  current,
}: {
  url: string;
  clients: number;
  current: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }
  return (
    <section className="overlay-setup" aria-labelledby="overlay-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR STREAM, YOUR EXCHANGE</p>
          <h2 id="overlay-title">Your overlay</h2>
        </div>
        <a className="button button-secondary" href={url} target="_blank" rel="noreferrer">
          Open overlay <span aria-hidden="true">↗</span>
        </a>
      </div>
      <p className="copy-feedback" role="status">
        {!current
          ? "Waiting for overlay connection status."
          : clients > 0
            ? `${clients} overlay browser connection${clients === 1 ? "" : "s"} receiving updates.`
            : "No overlay browser connected."}
      </p>
      <div className="overlay-details">
        <div className="overlay-url-block">
          <label htmlFor="overlay-url">Browser source URL</label>
          <div className="url-control">
            <input
              id="overlay-url"
              type="text"
              value={url}
              readOnly
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button className="button button-secondary" type="button" onClick={copyUrl}>
              Copy URL
            </button>
          </div>
          <p className="copy-feedback" role="status">
            {copyStatus === "copied"
              ? "OBS URL copied to your clipboard."
              : copyStatus === "failed"
                ? "Clipboard unavailable. Select the URL above and copy it manually."
                : "Add a Browser source in OBS and paste this URL."}
          </p>
        </div>
        <dl className="canvas-specs">
          <div>
            <dt>Width × height</dt>
            <dd>1920 × 1080</dd>
          </div>
          <div>
            <dt>Background</dt>
            <dd>Transparent</dd>
          </div>
        </dl>
      </div>
      <details>
        <summary>OBS settings</summary>
        <ul className="obs-settings">
          <li>
            Turn off <strong>Shutdown source when not visible</strong>.
          </li>
          <li>
            Turn off <strong>Refresh browser when scene becomes active</strong>.
          </li>
          <li>
            Turn on <strong>Control audio via OBS</strong> when testing implemented sound cues.
          </li>
          <li>Check full and half scale over bright and dark scenes.</li>
        </ul>
      </details>
    </section>
  );
}
