import type { ChatOutLog, ChatOutPublicState } from "@emote-exchange/twitch-kit";
import { useEffect, useState } from "react";

export function readChatOut(value: unknown): ChatOutPublicState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (
    typeof source.quiet !== "boolean" ||
    typeof source.sending !== "boolean" ||
    !Number.isSafeInteger(source.pending) ||
    (source.pending as number) < 0 ||
    (source.pending as number) > 100 ||
    ![null, "bot", "broadcaster"].includes(source.sender as string | null) ||
    !Array.isArray(source.logs) ||
    source.logs.length > 100
  )
    return null;
  const logs: ChatOutLog[] = [];
  for (const value of source.logs) {
    if (!value || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.id !== "string" ||
      !/^chat-log:\d+$/.test(entry.id) ||
      typeof entry.at !== "number" ||
      !Number.isFinite(entry.at) ||
      !["twitch", "sim"].includes(entry.origin as string) ||
      typeof entry.text !== "string" ||
      [...entry.text].length > 500 ||
      !["sent", "dropped", "would-have-said"].includes(entry.kind as string) ||
      typeof entry.is_sent !== "boolean" ||
      (entry.drop_reason !== null &&
        (typeof entry.drop_reason !== "string" || !/^[a-z_]{1,32}$/.test(entry.drop_reason))) ||
      (entry.httpStatus !== null &&
        (!Number.isInteger(entry.httpStatus) ||
          (entry.httpStatus as number) < 100 ||
          (entry.httpStatus as number) > 599))
    )
      return null;
    logs.push({
      id: entry.id,
      at: entry.at,
      origin: entry.origin as ChatOutLog["origin"],
      text: entry.text,
      kind: entry.kind as ChatOutLog["kind"],
      is_sent: entry.is_sent,
      drop_reason: entry.drop_reason as ChatOutLog["drop_reason"],
      httpStatus: entry.httpStatus as number | null,
    });
  }
  return {
    quiet: source.quiet,
    pending: source.pending as number,
    sending: source.sending,
    sender: source.sender as ChatOutPublicState["sender"],
    logs,
  };
}
function OutputLog({ entries, empty }: { entries: ChatOutLog[]; empty: string }) {
  return entries.length ? (
    <ol className="chat-log">
      {entries
        .slice()
        .reverse()
        .map((entry) => (
          <li className="chat-log-item" key={entry.id}>
            <div className="chat-log-meta">
              <span>
                {entry.kind === "sent" ? "Sent" : entry.kind === "dropped" ? "Dropped" : "Preview"}
                {entry.origin === "sim" ? " · SIM" : ""}
              </span>
              <time dateTime={new Date(entry.at).toISOString()}>
                {new Date(entry.at).toLocaleTimeString()}
              </time>
            </div>
            <p>{entry.text}</p>
            {entry.drop_reason && (
              <p className="copy-feedback">
                {entry.drop_reason.replaceAll("_", " ")}
                {entry.httpStatus ? ` · HTTP ${entry.httpStatus}` : ""}
              </p>
            )}
          </li>
        ))}
    </ol>
  ) : (
    <p className="copy-feedback">{empty}</p>
  );
}
export function ChatOutPanel({
  output,
  connected,
}: {
  output?: ChatOutPublicState;
  connected: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pendingQuiet, setPendingQuiet] = useState<boolean | null>(null);
  useEffect(() => {
    if (pendingQuiet === output?.quiet) setPendingQuiet(null);
  }, [output?.quiet, pendingQuiet]);
  async function action(path: "test" | "preview" | "quiet", quiet?: boolean) {
    setBusy(true);
    try {
      const response = await fetch(`/api/chat-out/${path}`, {
        method: "POST",
        headers: { "X-CTA": "1", "Content-Type": "application/json" },
        ...(path === "quiet" ? { body: JSON.stringify({ quiet }) } : {}),
      });
      if (!response.ok) throw new Error();
      setFeedback(
        path === "test"
          ? "Test message queued. Check the sent log below."
          : path === "preview"
            ? "Preview added to activity."
            : quiet
              ? "Quiet mode is on. Live sending is paused."
              : "Quiet mode is off.",
      );
    } catch {
      if (path === "quiet") setPendingQuiet(null);
      setFeedback("Could not complete that action. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  const logs = output?.logs ?? [];
  const [filter, setFilter] = useState("All");
  return (
    <section className="overlay-setup" aria-labelledby="chat-out-title">
      <p className="eyebrow">OUTGOING CHAT</p>
      <h2 id="chat-out-title">Test your chat connection</h2>
      <p>The live test posts “Emote Exchange connected” to your channel.</p>
      <div className="chat-controls">
        <button
          className="button button-primary"
          type="button"
          disabled={busy || !connected || output?.quiet || !output}
          onClick={() => {
            void action("test");
          }}
        >
          Send test message
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={busy || !output}
          onClick={() => {
            void action("preview");
          }}
        >
          Preview without sending
        </button>
        <label className="quiet-control">
          <input
            type="checkbox"
            checked={pendingQuiet ?? output?.quiet ?? false}
            disabled={busy || !output}
            onChange={(event) => {
              setPendingQuiet(event.currentTarget.checked);
              void action("quiet", event.currentTarget.checked);
            }}
          />{" "}
          Quiet mode
        </label>
      </div>
      <p className="copy-feedback">
        {connected
          ? `Sender: ${output?.sender === "bot" ? "bot account" : "broadcaster account"}.`
          : "Connect the broadcaster to enable live sending."}{" "}
        {output?.pending ?? 0} pending{output?.sending ? " · Sending" : ""}. Quiet mode is saved on
        this machine.
      </p>
      <p className="copy-feedback" role="status">
        {feedback}
      </p>
      <div className="activity-head">
        <h3>Activity</h3>
        <fieldset className="segmented" aria-label="Filter chat activity">
          {["All", "Sent", "Dropped", "Preview"].map((name) => (
            <button
              type="button"
              key={name}
              aria-pressed={filter === name}
              onClick={() => setFilter(name)}
            >
              {name}
            </button>
          ))}
        </fieldset>
      </div>
      <OutputLog
        entries={logs.filter(
          (entry) =>
            filter === "All" ||
            (filter === "Preview"
              ? entry.kind === "would-have-said"
              : entry.kind === filter.toLowerCase()),
        )}
        empty="No chat output yet."
      />
    </section>
  );
}
