# Product rules live in pure engines with injected time and randomness

The market and EventSub protocol logic are pure: `(state, input, now, rng) -> (state, effects)`. Effects (persist rows, broadcast an overlay update, say something in chat, play a sound) are carried out by a thin runtime layer. This makes rules deterministic to test, lets the simulator replay scenarios, and supports restart recovery without connecting to Twitch.

## Consequences

Engine code never calls `Date.now()`, `Math.random()`, the database or the network. The Code Review Rules in AGENTS.md flag it when it does.
