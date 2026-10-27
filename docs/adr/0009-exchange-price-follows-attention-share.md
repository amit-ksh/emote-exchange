# Emote Exchange prices follow each emote's share of chat's attention, not raw counts or order flow

A listing's target price comes from its **heat share**: decaying usage, with each chatter's repeats discounted (1, 0.5, 0.25 and so on), divided by total heat. The price glides toward that target, and trades add only a small, temporary impact.

- **Raw counts** would make prices meaningless in a 3-person chat and explode in a 3,000-person one.
- **A price driven by order flow** (an AMM-style curve) would let whoever has the most coins move the market, and turn the game into "who trades most" instead of "what is chat doing".

Attention share keeps the core fantasy: **chat's behavior is the market**, and coordinated chat beats a lone spammer.

## Consequences

Prices are relative, so one listing rising pushes the others down a little. That fits the "where is chat's attention" story. A market with fewer than 4 listings is scaled as if it had 4, so early markets still move. The defaults are tuned against behavior targets B1-B5 in the spec: the targets, not the constants, are the contract.
