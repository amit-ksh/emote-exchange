import type { ChatEvent } from "@emote-exchange/twitch-kit";
import type { MarketInput, MarketMoment, MarketSay, MarketState } from "./market.ts";
import { netWorth } from "./sessions.ts";

export function marketCommand(
  state: MarketState,
  input: Extract<ChatEvent, { type: "ChatMessage" }>,
  now: number,
): { say?: MarketSay; action?: MarketInput; moment?: MarketMoment } {
  if (!input.command) return {};
  const { name } = input.command;
  const reply = (text: string) => ({
    say: {
      type: "say" as const,
      origin: input.origin,
      priority: "reply" as const,
      userId: input.chatter.id,
      replyParentMessageId: input.messageId,
      text,
    },
  });
  const trader = state.traders.get(input.chatter.id);
  if (!trader) return {};
  if (name === "portfolio" || name === "pf") {
    const holdings = [...(state.holdings.get(trader.id)?.values() ?? [])]
      .slice(0, 5)
      .map((holding) => {
        const value = (state.listings.get(holding.ticker)?.price ?? 0) * holding.shares;
        const gain = holding.costBasis ? Math.round((value / holding.costBasis - 1) * 100) : 0;
        return `${holding.ticker} x${holding.shares} (${gain >= 0 ? "+" : ""}${gain}%)`;
      });
    return reply(
      `@${trader.login} ${trader.coins} Coins, ${holdings.join(", ") || "no shares"}, net worth ${netWorth(state, trader.id)}.`,
    );
  }
  if (name === "top") {
    const top = [...state.traders.values()]
      .map((value) => ({ trader: value, worth: netWorth(state, value.id) }))
      .sort((a, b) =>
        a.worth > b.worth ? -1 : a.worth < b.worth ? 1 : a.trader.id < b.trader.id ? -1 : 1,
      )
      .slice(0, 3);
    return {
      ...reply(
        `Top Traders: ${top.map(({ trader: value, worth }, index) => `${index + 1}. @${value.login} ${worth}`).join(", ")}.`,
      ),
      moment: { id: `${input.id}:top`, at: now, origin: input.origin, kind: "TOP" },
    };
  }
  if (name === "market" && !input.command.args.length) {
    const hottest = [...state.listings.values()]
      .sort((a, b) => b.heat - a.heat || (a.emote.name < b.emote.name ? -1 : 1))
      .slice(0, 5)
      .map((listing) => listing.emote.name);
    return reply(
      `Use !buy TICKER QTY (or max), !sell TICKER QTY (or all), !portfolio. Hottest: ${hottest.join(", ") || "two chatters can list an emote"}.`,
    );
  }
  if (!["market", "delist", "freeze", "unfreeze"].includes(name)) return {};
  if (!input.chatter.isBroadcaster && !input.chatter.isMod)
    return reply("Only a Mod or the broadcaster can use that command.");
  const [arg] = input.command.args;
  const cause = { id: `${input.id}:action`, origin: input.origin };
  if (name === "market") {
    if (input.command.args.length !== 1 || !["pause", "resume"].includes(arg?.toLowerCase()))
      return reply("Use !market pause or !market resume.");
    const value = arg.toLowerCase() === "pause";
    return {
      ...reply(value ? "Market paused." : "Market resumed."),
      action: { type: "Pause", ...cause, value },
    };
  }
  if (input.command.args.length !== 1) return reply("Use a single ticker or Trader name.");
  if (name === "delist") {
    const matches = [...state.listings.values()].filter(
      (listing) => listing.emote.name.toLowerCase() === arg.toLowerCase(),
    );
    const listing = state.listings.get(arg) ?? (matches.length === 1 ? matches[0] : undefined);
    if (!listing) return reply("Unknown ticker. Try !market");
    return {
      ...reply(`Delisted ${listing.emote.name}. Holders paid without a fee.`),
      action: { type: "Delist", ...cause, ticker: listing.emote.name },
    };
  }
  const login = arg.replace(/^@/, "").toLowerCase();
  const targets = [...state.traders.values()].filter(
    (value) => value.login.toLowerCase() === login,
  );
  const target = targets.length === 1 ? targets[0] : undefined;
  if (!target) return reply("Unknown Trader.");
  const value = name === "freeze";
  return {
    ...reply(`@${target.login} ${value ? "frozen" : "unfrozen"}.`),
    action: { type: "Freeze", ...cause, userId: target.id, value },
  };
}
