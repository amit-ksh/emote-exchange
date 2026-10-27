# A built-in chat simulator and a no-credentials demo mode are core features

twitch-kit will ship a seeded chat simulator that emits the same events as Twitch, and Emote Exchange starts in demo mode when no Twitch keys are present. Judges may never connect a Twitch account. The completed simulator lets a judge see the market in under 2 minutes, makes behavior targets reproducible, drives soak tests, and adds clearly labeled load to a small real chat. During Sprint 0, Demo mode labels the no-credentials foundation; the actual simulator and market arrive in S1 and S2.

## Consequences

- Simulated chatters always have `sim_` names.
- The overlay shows a SIM badge while the simulator runs.
- The simulator never sends anything to Twitch.

These three rules keep the demo footage honest.
