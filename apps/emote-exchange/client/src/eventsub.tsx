import type { EventSubPublicState } from "@emote-exchange/twitch-kit";
import { useEffect, useState } from "react";

const subscriptionNames = [
  "channel.chat.message",
  "channel.follow",
  "channel.raid",
  "stream.online",
  "stream.offline",
];
export function readEventSub(value: unknown): EventSubPublicState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const timestamp = (value: unknown) =>
    value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
  if (
    !(["disconnected", "connecting", "connected", "lost"] as unknown[]).includes(source.status) ||
    !timestamp(source.sessionStartedAt) ||
    !timestamp(source.lastEventAt) ||
    !Number.isSafeInteger(source.eventCount) ||
    (source.eventCount as number) < 0 ||
    !Number.isSafeInteger(source.chatMessageCount) ||
    (source.chatMessageCount as number) < 0 ||
    (source.issue !== null && source.issue !== "protocol-error") ||
    !Array.isArray(source.subscriptions) ||
    source.subscriptions.length !== 5
  )
    return null;
  const subscriptions: EventSubPublicState["subscriptions"] = [];
  for (const [index, entry] of source.subscriptions.entries()) {
    if (
      !entry ||
      typeof entry !== "object" ||
      entry.type !== subscriptionNames[index] ||
      !["disconnected", "pending", "enabled", "failed", "revoked"].includes(entry.status) ||
      (entry.httpStatus !== null &&
        (!Number.isInteger(entry.httpStatus) || entry.httpStatus < 100 || entry.httpStatus > 599))
    )
      return null;
    subscriptions.push({ type: entry.type, status: entry.status, httpStatus: entry.httpStatus });
  }
  return {
    status: source.status as EventSubPublicState["status"],
    sessionStartedAt: source.sessionStartedAt as number | null,
    lastEventAt: source.lastEventAt as number | null,
    eventCount: source.eventCount as number,
    chatMessageCount: source.chatMessageCount as number,
    issue: source.issue as EventSubPublicState["issue"],
    subscriptions,
  };
}
export function EventSubPanel({ connection }: { connection?: EventSubPublicState }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const status = connection?.status ?? "disconnected";
  const label = {
    disconnected: "EventSub disconnected",
    connecting: "EventSub connecting",
    connected: "EventSub connected",
    lost: "EventSub connection lost · retrying",
  }[status];
  const age =
    connection?.sessionStartedAt == null
      ? null
      : Math.max(0, Math.floor((now - connection.sessionStartedAt) / 1000));
  return (
    <section className="overlay-setup" aria-labelledby="eventsub-title">
      <p className="eyebrow">INCOMING TWITCH EVENTS</p>
      <h2 id="eventsub-title" aria-live="polite">
        {label}
      </h2>
      <p>Type in your channel’s chat to check reception. Counters reset when the app restarts.</p>
      <dl className="eventsub-stats">
        <div>
          <dt>Live events</dt>
          <dd>{connection?.eventCount ?? 0}</dd>
        </div>
        <div>
          <dt>Chat messages</dt>
          <dd>{connection?.chatMessageCount ?? 0}</dd>
        </div>
        <div>
          <dt>Session age</dt>
          <dd>
            {age === null ? "—" : age < 60 ? `${age}s` : `${Math.floor(age / 60)}m ${age % 60}s`}
          </dd>
        </div>
        <div>
          <dt>Last event</dt>
          <dd>
            {connection?.lastEventAt == null
              ? "Waiting"
              : new Date(connection.lastEventAt).toLocaleTimeString()}
          </dd>
        </div>
      </dl>
      <ul className="subscription-list" aria-label="Twitch subscriptions">
        {connection?.subscriptions.map((subscription) => (
          <li className="subscription-item" key={subscription.type}>
            <span>{subscription.type}</span>
            <span className={subscription.status === "enabled" ? "subscription-enabled" : ""}>
              {subscription.status}
              {subscription.status === "failed" && subscription.httpStatus
                ? ` · HTTP ${subscription.httpStatus}`
                : ""}
            </span>
          </li>
        ))}
      </ul>
      {connection?.subscriptions.some((subscription) => subscription.status === "failed") && (
        <p className="copy-feedback" role="status">
          A subscription failed. Check your connection and required permissions; reconnect Twitch to
          try again.
        </p>
      )}
      {connection?.issue && (
        <p className="copy-feedback" role="status">
          Twitch reported a protocol error. See the local server log.
        </p>
      )}
    </section>
  );
}
