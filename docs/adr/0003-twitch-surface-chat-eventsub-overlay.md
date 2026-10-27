# Twitch surface: chat + EventSub + OBS overlay, nothing that needs Affiliate

Emote Exchange connects to Twitch through EventSub over WebSocket (chat messages, follows, raids, stream online/offline), the Helix API (send chat, emote sets) and an OBS browser-source overlay. An Extension introduces a separate review and installation requirement. Core features work without Affiliate or Partner status; monetization-linked features stay outside P0.

## Consequences

What a new channel can't produce on demand (raids, many chatters) is covered in development by the simulator and the Twitch CLI mock server, and in the demo by friends and test accounts. Affiliate-only ideas (Channel Points into coins) stay P2.
