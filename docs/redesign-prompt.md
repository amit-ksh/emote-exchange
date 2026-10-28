# Prompt: redesign Emote Exchange (dashboard + OBS overlay) as a modern, minimal SaaS product

Paste everything below this line into the AI. Attach: (1) the reference HTML file "Amit Sharma - Software Development Engineer.html", (2) the two screenshots of the current UI (dashboard full page, overlay at 1920x1080) if the tool accepts images.

---

## 1. Your role and the goal

You are a senior product designer and front-end engineer who ships calm, premium SaaS interfaces (think Linear, Vercel, Stripe, Raycast). Redesign the whole UI of an app called **Emote Exchange** so it feels like a polished, professional, modern and minimal SaaS product.

There are exactly two screens to redesign:

1. **Dashboard** - the control panel the streamer opens in a normal browser tab on their PC.
2. **Overlay** - a transparent 1920 x 1080 canvas that OBS loads as a browser source and shows to the stream audience.

The attached HTML (a personal portfolio) is the **visual reference**: borrow its design language (section 4). Do not copy its content or its portfolio-style marketing layout.

## 2. The product in five lines

- Emote Exchange is a play-money market inside a Twitch channel. Every emote chat uses becomes a **Listing** (a tradable "stock"). Its **Price** follows how much of chat's attention that emote has right now.
- Viewers are **Traders**. They get free **Coins** and trade with `!buy` and `!sell` in chat.
- The streamer runs it locally. The dashboard is where they set up Twitch, copy the overlay URL into OBS, run a demo, and watch status.
- The overlay shows a ticker **Tape**, a live **Chart** of the hottest Listing, a **Board** (leaderboard) of top Traders by Net Worth, a **Feed** of recent events, and big **Banners** for moments (IPO, Halt, Moon, Crash, Raid, Bell, Delist).
- A **demo mode** with simulated chatters (names start with `sim_`) lets the streamer try everything with no Twitch keys. It must keep working.

Use this vocabulary in all UI copy: Listing, Ticker, Trader, Coins, Net Worth, IPO, Halt, Raid Visa, Bell. Never write stock, player, points, credits or wallet.

## 3. What is wrong with the current UI (fix all of it)

**Dashboard (screenshot 1, about 6800 px tall)**
- One endless scroll of 12 equally heavy bordered boxes. No hierarchy, no sense of where to look or what to do next.
- Everything says the same thing three times: "Connect Twitch" appears in the connection status, in the checklist, in its own section and again in the EventSub block.
- Developer-facing content is shown to everyone: persona weights, seed, raw EventSub subscription names, "Successful checks: 0", "Foundation label", "Market widgets arrive in Sprint 2", "next build", a roadmap block called "Next on the floor".
- The simulator is a big form shown by default (scenario, messages per second, chatters, seed, four weights, four buttons, counters). It should be a quiet tool, not a main character.
- Marketing hero copy ("A little emote. A lot of attention.") inside a tool the streamer opens daily.
- Visual style reads as "vibe coded": black + dark green everywhere, all-caps monospace micro labels, tiny low-contrast grey text, mixed fonts, thin 1 px boxes with no depth, inconsistent paddings, an emote catalog that is both a table and a grid.

**Overlay (screenshot 2)**
- Looks like a different product from the dashboard (purple glow, mono numbers, heavy borders).
- Text is truncated into mush: Board names become `sim_br...goat`, Feed rows become `si...... BUY 1`, `sim_bright_heron joined - +200 Co...`.
- The Feed label "ON THE FLOOR" is a different style from every other panel.
- One Board row has a black chip behind its change value; it reads as a bug, not as a flash.
- The Tape does not span the width and starts with a boxed "EX" that looks pasted in.
- The Chart axis labels are smaller than the 24 px readability minimum.
- Banner copy is jargon ("first-time chatters earn a Visa"). Say what happens in plain words (a Raid Visa is a Coins bonus for first-time chatters just after a raid).

## 4. Design direction: take this from the reference HTML

Read the reference CSS variables and components and reuse them as the system. Exact values:

**Color tokens (light / dark), as CSS custom properties on `:root`**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#d8d8d8` | `#151515` | app background |
| `--g` | `#f2f2f2` | `#222222` | primary card surface |
| `--g2` | `#e9e9e9` | `#2b2b2b` | inset surface, inputs, chips, secondary buttons |
| `--ink` | `#111111` | `#f1f1f1` | text, primary button |
| `--mute` | `#80807f` | `#8f8f8f` | secondary text (check contrast, see section 8) |
| `--line` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.09)` | hairlines, count badges |
| `--lime` | `#e2ff1f` | `#e2ff1f` | the single brand accent |

- Support light and dark. Default to `prefers-color-scheme`, add a manual toggle (the reference has one), persist it in `localStorage` inside try/catch.
- **Lime is used sparingly**: the "ok / active / new" tag, one highlighted CTA per view, hover on chips, the active step in a checklist. Text on lime is always `#111`. Lime never encodes price direction.
- **Semantic colors** (only for market direction and status): up `#2BD47D`, down `#FF5A5F`, warning amber for "waiting / needs attention". Always pair direction color with an arrow glyph.

**Typography**
- Body and UI: **Inter Tight** 400 / 500 / 600. Headings 500, tight tracking (`-0.03em` to `-0.04em`), page title `clamp(28px, 3vw, 40px)`.
- Display numerals: **Doto** (the dot-matrix font), weight 800, line-height 1. Use it only for big numbers (stat cards, the hero price, counters). It is the product's signature, so keep it rare and large.
- Numbers elsewhere: Inter Tight with `font-variant-numeric: tabular-nums`. Do not use monospace anywhere except the overlay URL and timestamps if needed.
- Self-host both fonts as `.ttf` or `.woff2` in the app's local fonts folder (the app runs offline on `127.0.0.1` and inside OBS). Do not link Google Fonts in the final code. Both fonts are OFL licensed.
- Type scale (dashboard): 12 (captions, tags) / 14 (secondary) / 15 (body) / 19 (card title) / 28-40 (page title) / 44-56 Doto (stat numbers).

**Shape, depth, spacing**
- Soft, very round: stat and content cards radius 28-34 px, pills and buttons fully rounded (26-30 px), inputs 18-20 px, emote tiles 20 px. Nothing with sharp corners.
- Depth comes from tonal surfaces (`--bg` < `--g` < `--g2`), not borders. Use hairlines (`--line`) only to separate rows. Soft shadows only on the active nav pill and floating elements: `0 6px 20px -10px rgba(0,0,0,.35)`.
- Spacing scale 4 / 8 / 12 / 16 / 24 / 32. Card padding 24 (20 on mobile). Gap between cards 16.

**Components to build once and reuse everywhere**
- Sidebar nav pill with a small count/status badge on the right (active pill uses `--g` + soft shadow; hover nudges 5 px right).
- Tag (`.tag`): lime pill, 11-12 px, 600. Variants: neutral (`--g2`), warning, error.
- Button: primary (ink on bg), lime (highlight CTA), ghost (`--g2`), icon button 44 px circle. Hover lifts 2 px.
- Chip, switch (for Quiet mode), segmented control, select, number input, copy-field (read-only input + Copy pill), stat card (Doto number + caption + optional tag), checklist step (numbered circle -> lime check), status dot, list row, empty state, inline notice, disclosure ("Advanced").
- Table / list rows with hairline separators for future Market and Traders screens.

**Motion** (calm, purposeful)
- Keep: staggered fade-up on first load (`opacity` + `translate`, 0.8 s, 90 ms stagger), count-up on stat numbers, 2 px hover lift on buttons, a slow pulsing status dot for "live".
- Drop: per-letter heading animation, rotating gradient blobs, scroll-progress bar, 3D tilt, parallax. They are right for a portfolio and wrong for a tool.
- Respect `prefers-reduced-motion` everywhere (the reference already does).

**The reference's dot motif**: you may reuse the dotted strip as one subtle element (for example an activity strip in the Overview showing recent simulated or live events). Do not add decoration beyond that.

## 5. Screen 1: Dashboard

### 5.1 Layout (desktop 1440 x 900)

- Two columns like the reference: sticky left sidebar 248-250 px, content column max 1080 px, outer padding 28, gap 28.
- Replace the single long page with **views**. Navigation switches views without a full reload (state or hash routing, no new router dependency). Each view should fit one viewport without scrolling, except the Emotes list and the Chat activity list.
- Sidebar content, top to bottom: product mark (a small ink square with "EX" in Doto, plus the name "Emote Exchange"), nav pills, spacer, a status card at the bottom (mode tag `Demo` or `Live`, one sentence: "Simulated chat only. Your Twitch stream is not affected." in demo mode), theme toggle.
- Page header in every view: title (h1), one-line subtitle, optional primary action aligned right. No eyebrow labels, no hero.
- Under 900 px: the sidebar becomes a horizontal pill bar pinned to the top (as in the reference), single column, stat cards 2 per row.
- Max one primary (ink or lime) button per view. Everything else is ghost.

### 5.2 Navigation and views

Nav items with badges: **Overview**, **Setup** (badge `1/3`), **Demo** (badge: pulsing dot + "Running" while the simulator runs), **Emotes** (badge: count), **Chat**, **Diagnostics**.

**Overview (default)**
- Row of 4 stat cards with Doto numbers: `Mode` (Demo / Live), `Twitch` (Connected / Not connected), `Overlay` (browser connections, number), `Stream` (Offline / Live). Each has a small tag for state (lime = ready, neutral = waiting, error).
- Setup checklist card: 3 steps (Connect Twitch, Overlay connected, Go live). Done = lime check, current = highlighted with its action button, upcoming = muted. Footer: "1 of 3 complete". Helper line: "Demo mode works without Twitch."
- Overlay card: the URL in a copy-field (`http://127.0.0.1:4100/overlay`) with a Copy pill and an "Open overlay" ghost button. Next to it two quiet facts: `1920 x 1080`, `Transparent background`. The four OBS tips go inside a collapsed disclosure "OBS settings" (Shutdown source when not visible: off, Refresh browser when scene becomes active: off, Control audio via OBS: on, Check at full and half scale).
- Demo card: a Start demo button (or Stop while running), the three live counters as small Doto numbers (Events, Chat messages, Elapsed), and a "Demo options" link to the Demo view.
- Optional: a thin dotted activity strip across the width.

**Setup**
- Connect Twitch card: two account rows (Broadcaster, Bot), each with a status tag, login name when connected, and a Connect / Reconnect button. Granted scopes inside a disclosure.
- When no Twitch credentials exist, show one inline notice: "Add your Twitch app credentials to the local .env file, then restart the app." Do not repeat the overlay URL here, link to Overview.

**Demo**
- Left card "Scenario": Scenario select (Opening day ...), Messages per second, Chatters. Seed and the four persona weights (Plain chat, Emote spam, Follow generator, Raid generator) live in an "Advanced" disclosure, collapsed by default, with the helper line "Weights are relative and must total more than zero."
- Right card "Run": a large state (Stopped / Running + pulsing dot), live counters (Simulated events, Chat messages, Elapsed), Start / Stop buttons.
- Below, a card "Trigger an event": segmented buttons Fake follow, Fake raid (with a small Raid viewers number input), Open bell, Close bell.
- A `SIM` tag next to the page title while running. Note shown once: "Simulated bells do not change your Twitch stream status."

**Emotes**
- Header action: Refresh emotes (ghost). Subtitle: "148 emote names available, including 24 bundled originals. Provider lists refresh every 30 minutes."
- Four compact provider tiles (Twitch, 7TV, BTTV, FFZ): channel count, global count, status tag (Ready / Connect Twitch). Not a table.
- Below: search field + provider filter chips, then one emote grid (8 per row at 1440): 48-56 px image on a `--g2` tile with radius 20, the emote name below, provider as a tiny tag. Show the first 24 and a "Show more" button. Fallback tile when an image fails.

**Chat**
- Card "Test your chat connection": "Posts 'Emote Exchange connected' to your channel." Buttons: Send test message (primary), Preview without sending (ghost), a Quiet mode switch ("Saved on this machine").
- Below, one **activity list** (not two panels) with a segmented filter All / Sent / Dropped / Preview. Row: time (tabular), tag (Preview, Sent, Dropped), message text. Fixed height with internal scroll. Empty state: "No chat output yet."
- If the broadcaster is not connected, show the notice "Connect the broadcaster to enable live sending." and disable Send test message.

**Diagnostics**
- Four stat cards (Live events, Chat messages, Session age, Last event).
- One list of the five subscriptions (channel.chat.message, channel.follow, channel.raid, stream.online, stream.offline), each with a status dot + label (Connected / Disconnected) and a friendly name ("Chat messages", "Follows", "Raids", "Stream online", "Stream offline"), raw name in a muted second line.
- Title shows `EventSub connected` or `EventSub disconnected`. Subtitle: "Type in your channel's chat to check reception. Counters reset when the app restarts."

**Cut completely**: the hero, the "Next on the floor" roadmap, "Successful checks", "Foundation label", every sprint or build mention, the duplicate Connect Twitch blocks, the second emote table.

**Designed-for-later (optional, if you have time)**: Market (table of Listings with Ticker, Heat, Price, session change, holders, Delist), Traders (search, Coins, Net Worth, Freeze), Settings (Starting Coins, Fee, trade cooldown, Heat half-life), Season (reset, requires typing `RESET`). If you include them, use the table component and clean empty states with no invented data.

### 5.3 Copy rules
- Sentence case. No all-caps mono eyebrow labels. Tags are the only small caps-style text and they are 11-12 px.
- Plain language for a streamer, not a developer. One short sentence per helper line.
- Empty, loading, error and "needs setup" states for every card. A disconnected state is a normal state, not an error.

### 5.4 Mock data to use
Mode Demo, Twitch Not connected, Overlay 1 connection, Stream Offline, Setup 1/3 (Overlay connected done). Simulator running: 3917 events, 3732 chat messages, 933 s. Emote counts: Twitch 0 / 0 (Connect Twitch), 7TV 0 / 45, BTTV 0 / 65, FFZ 0 / 15. Emotes: reckH, PETPET, SteerR, PepePls, peepoSad, CrayonTime, :tf:, CiGrip, DatSauce, ForeverAlone, GabeN, HailHelix, ZreknarF, YooHoo, ManChicken, BeanieHipster, CatBag, DemoBear, DemoBolt, DemoBot, DemoBull, DemoChill, DemoCoin (any simple colored placeholder is fine for images). Chat preview rows: `@sim_bright_gecko BUY 1 DemoBull @ 93.56 (95 Coins).`

## 6. Screen 2: Overlay

### 6.1 Rules that cannot change (stream-safety and OBS)
- One transparent canvas **1920 x 1080**. Widgets are absolutely positioned in fixed zones (px at 1080p), nothing outside the canvas, no page background.
- Zones: **Tape** bottom, full width, 64 high. **Chart** top-right, 520 x 300. **Board** right under the Chart, 520 x 260. **Feed** left, above the Tape, 480 x 260. **Banners** top-center, 900 x 140. **Cards** (portfolio card after `!portfolio`) center-left, 420 x 220. **SIM badge** top-left, small, only while simulating.
- Minimum text 24 px, tickers 28 px. Contrast at least 4.5:1 against the widget surface. It must stay readable when the stream is shrunk to a phone.
- Up/down uses an arrow as well as color. At most 3 flashes per second anywhere. A price tick flashes its cell background for 150 ms and never leaves a persistent highlight.
- Only display data appears: Trader names, numbers, emote names and image URLs. Never raw chat text.
- 60 fps in an OBS browser source. Nothing animates off-screen. `?motion=reduced` turns all movement into fades. Support `?widgets=tape,chart,board,feed,banners,cards` and `?sound=off`.
- Coins are integers. Prices show 2 decimals.

### 6.2 Visual language
The overlay must clearly belong to the same product as the dashboard, adapted for video:
- Surfaces: the dark tokens, `rgba(34,34,34,.88)` with a 1 px `rgba(255,255,255,.10)` hairline, radius 28 px for the big widgets and 18-20 px for rows, a soft shadow `0 12px 32px -12px rgba(0,0,0,.5)`. Never the light theme (it glares over video).
- Doto 800 for the hero price on the Chart and the viewer count in the Raid banner (56 px and up). Inter Tight 500/600 tabular for everything else. Do not set Doto below 48 px.
- The single accent is lime `#e2ff1f` (replaces the old Twitch purple): rank 1, the hottest-Listing marker, the SIM badge, the Banner timer line, small "new" pills. Up `#2BD47D`, down `#FF5A5F`.
- Emotes are the logos: 40 px in the Tape, 64 px in the Chart, 32 px in the Feed, on a rounded `--g2` tile.

### 6.3 Widget specs
- **Tape**: 64 px bar, full width, a seamless 60 px/s scroll. Item = emote 40, Ticker 28/600, Price 28 tabular, change pill (arrow + percent, 24 px). Halted item shows a pause mark. Hairline separators, no boxed "EX" cell (a small lime logo dot on the far left is fine). Empty state text: "Two chatters list an emote. Type !market".
- **Chart**: header row (small label "Hottest", Ticker 28, emote 64 at right), price in Doto 64, change pill, a 10-minute area chart (2 px line, soft gradient fill under it, a dot at the last point), x labels "-10m" and "now" at 24 px, y range shown as two 24 px labels or dropped if they do not fit. Switches Listing at most every 20 s with a crossfade.
- **Board**: header "Top traders / Net worth" (24 px), 5 rows of about 44 px. Row = rank, Trader name in their chat color, end-ellipsis with enough width so `sim_bright_goat` fits, Net Worth right-aligned, change pill with arrow. Rank 1 gets the lime marker. Smooth reorder when ranks change.
- **Feed**: the label becomes the widget header inside the panel, not a floating chip. Each row is a flex line: 32 px icon tile, name (ellipsis at the end, flexible), an action tag BUY (green) or SELL (red), Ticker, price right-aligned. System events ("sim_bright_heron joined", "sim_bright_finch raided") use a neutral icon, short text and a `+200` Coins pill. No row may truncate its Ticker or price. Newest on top, slide in, fade after 8 s, last 5 only.
- **Banners**: 900 x 140 card. Left: a 88 px emblem tile (type icon or logo). Middle: type label (24 px, tracking), headline (Doto or Inter, 48 px), one plain sentence (24 px). Bottom: a 4 px lime timer line that shrinks over 4 s. Types and tone: IPO (lime), HALT (amber, pause icon), MOON (green), CRASH (red), RAID (lime), BELL, DELIST, PAUSED (neutral). Priority RAID > HALT > MOON/CRASH > IPO > rest, one at a time, 4 s each, spring scale-in and slide-out. Raid copy example: "RAID INCOMING / 100 viewers / sim_bright_finch arrived. First-time chatters get a Raid Visa: bonus Coins."
- **Cards (portfolio)**: 420 x 220, Trader name, Net Worth in Doto, Coins and Holdings as two small rows, 6 s on screen.
- **SIM badge**: 32 px high pill, lime background, `#111` text "SIM".

### 6.4 Mock data to use
Banner: Raid, 100 viewers, `sim_bright_finch`. Chart: DemoCoin 136.42, +59%, range 97 to 138, 10-minute series. Board: sim_bright_goat 8,384 +43.3%; sim_bright_mole 7,057 +57.7%; sim_bright_hare 6,441 -23.6%; sim_bright_koala 6,026 +0.6%; sim_bright_frog 5,977 +0.7%. Feed: sim_bright_heron joined +200; sim_bright_gecko BUY 1 DemoBull 88.41; sim_bright_finch joined +200; sim_bright_finch raided 100 viewers; sim_bright_finch BUY 1 DemoBot 94.24. Tape: DemoBear 86.56 -26.4%, DemoBolt 94.09 -9.2%, DemoBot 94.26 -3.1%, DemoBull 93.56 +1.1%, DemoChill 95.72 +0.4%, DemoCoin 136.42 +59%.

## 7. Technical constraints (the code behind this UI)

If you can edit the repository, work in `apps/emote-exchange/client/` (React 19 + Vite 8, TypeScript, plain CSS in `client/src/styles.css` and `client/src/overlay.css`). Rules:
- **Presentation only.** Do not change engines, server code, the SSE protocol, data shapes, the snapshot reader or any behavior. Keep the existing props, hooks and data flow. You may reorganize components and split files.
- **No new dependencies.** No UI kit, no router, no icon package, no CSS framework, no animation library. Use plain CSS with custom properties and inline SVG icons.
- Fonts are self-hosted under the app's local fonts folder and loaded with `@font-face` (the overlay already does this).
- Servers listen on `127.0.0.1`. No external network requests from the UI at runtime (no CDN, no analytics).
- Keep every element the current UI uses to confirm behavior (buttons, inputs, status text) so tests and automation still find them; if you rename a label, keep its accessible name equivalent.
- Accessible: visible focus ring (`2px` ink outline, offset 3), real buttons and links, labels for every input, `aria-live` for status changes, keyboard operable disclosures and switches, 4.5:1 contrast for body text in both themes (the reference `--mute` on `--g` is borderline, darken it slightly for body-size text).

If you can **not** edit the repository (chat tool, no file access), deliver two self-contained static files with inline CSS and a little vanilla JS, using the mock data above:
- `dashboard.html` - full app shell with working view switching, theme toggle, copy button, disclosures, switch, start/stop demo toggling counters, search and filter chips on Emotes.
- `overlay.html` - a 1920 x 1080 transparent canvas with all widgets live-animated from the mock data (tape scrolling, chart redrawing, board reordering, feed pushing rows, banners cycling every few seconds, `?motion=reduced` honored). Show it on a checkerboard or video-like backdrop outside the canvas only for preview, with the canvas itself transparent.

## 8. Quality bar and self-check

Before you answer, check your own output against this list and fix what fails:
1. At 1440 x 900 each dashboard view has one clear focal point and one primary action, and fits without scrolling (Emotes and Chat lists excepted).
2. No text below 12 px on the dashboard, none below 24 px on the overlay.
3. No truncation in the overlay at the mock data above. Check the longest names.
4. Light and dark both look intentional, not inverted.
5. Only one accent (lime). No purple, no neon green glow, no gradients except subtle chart fills.
6. All spacing comes from the scale in section 4. All radii and colors come from tokens, no stray hex values in components.
7. Every card has empty, loading and error states.
8. Dashboard at 390 px wide has no horizontal scroll.
9. Reduced-motion mode shows no movement beyond fades.
10. The result looks like the same product on both screens.

## 9. What to send back

1. A 10-line summary of the design decisions (tokens, layout, what you cut and why).
2. The code (repo files or the two HTML files, section 7).
3. A short list of anything you could not satisfy and why.

Do not ask me questions first. Make reasonable choices, state them in the summary, and deliver.
