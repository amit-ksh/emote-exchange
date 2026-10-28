# Emote fixture sources

Recorded October 28, 2026. These small metadata excerpts contain no artwork bytes, tokens or channel chat.

- `emotes-7tv.json`: first two entries from [7TV global set](https://7tv.io/v3/emote-sets/global), retaining only the 2x and 4x WebP file metadata needed by the parser.
- `emotes-bttv.json`: first two entries from [BTTV globals](https://api.betterttv.net/3/cached/emotes/global), with unrelated fields removed.
- `emotes-ffz.json`: first two entries from [FFZ through BTTV's cache](https://api.betterttv.net/3/cached/frankerfacez/emotes/global), with unrelated fields removed.
- `emotes-twitch.json`: reduced `TwitchUnity` example from the [Twitch Get Global Emotes reference](https://dev.twitch.tv/docs/api/reference#get-global-emotes).

Tests construct channel wrappers, name clashes and malformed variants around these excerpts. No third-party artwork is bundled; the app's 24 SVG demo assets are original work.
