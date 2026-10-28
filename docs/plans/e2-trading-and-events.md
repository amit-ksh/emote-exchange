# E2 implementation plan

October 28, 2026. Extend the established pure `stepMarket` seam test-first. Runtime/SQL execution, reply budgets, role checks for chat moderation commands and UI wiring remain E3–E5.

1. A five-share buy at 100 consumes 505 whole Coins and creates a Holding. Derive settlement from integer Price hundredths and an exact fee ratio with BigInt intermediates; state and effects retain only safe numbers. Add sell/all/max, case-sensitive-first ticker matching, quantity limits and every rejection reason. Rejections preserve settlement/cooldowns; onboarding and observed activity remain independent of trade acceptance.
2. Apply pre-impact fills, bounded impact, cooldowns, exact credit saturation and per-fill ledger effects. Keep no in-memory duplicate of the Trade log. Add atomic Delist payouts and trusted actions for Freeze/Pause/confirmed Reset. E3 will authorize those actions before dispatch.
3. Check Halts against actual samples at least 60 seconds old, with 30-second deadlines and five-minute repeat suppression. Keep Prices moving while halted/paused. Track Moon/Crash once per Listing/session and refresh references on an opening Bell.
4. Award Stipends only for actual qualifying chat minutes, Follow bonuses once per delivery, and Raid Visas only on a Trader's first message inside the five-minute window. Bound participation/cooldown/delivery memory and preserve causal origin for all effects. Closing Bell produces a deterministic summary and one ambient say effect; offline trading stays open.
5. Verify fixed B4 through real fills, every rejection reason, minimum-fee examples, all/max affordability, cap saturation and a seeded mixed-action sequence. Re-run E1 fixtures and repository checks; record evidence and commit E2 separately.

No new dependency or UI change is planned. All say effects go to E3's existing chat-out queue; the engine never sends chat itself. Simulated messages, bells and bonuses retain SIM origin. Pure engine tests do not claim live chat, persistence/recovery or actual OBS acceptance.
