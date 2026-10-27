# Hackathon brief

Organizer sources: [overview](https://twitchcon-codex.devpost.com/), [official rules](https://twitchcon-codex.devpost.com/rules), [resources and FAQ](https://twitchcon-codex.devpost.com/resources). The organizer's current rules are authoritative.

## Scope and dates

This repository prepares **one Emote Exchange entry**. The internal submission target is **Monday, November 2, 2026, 8:00 PM IST (UTC+5:30)**.

The [official rules](https://twitchcon-codex.devpost.com/rules), checked October 27, state November 2, 2026, 2:00 PM Pacific Time: **November 3, 3:30 AM IST**. Earlier planning notes also cited a conflicting FAQ time. Keep the earlier internal target and recheck the organizer's form before submission. Eligibility and final submission requirements still need to be checked for the entrant.

| Check before committing to submission | Record |
|---|---|
| Submission period and exact closing instant | Official date, time, time zone and matching IST conversion. |
| Eligibility | Participant location, age and any organizer exclusions. |
| Required Twitch and Codex integration | What the project and video must demonstrate. |
| Repository access | Public/private rules and any exact reviewer invitation requirement. |
| Video requirements | Duration, hosting, visibility, language and content restrictions. |
| Build-session evidence | Required identifier and how to submit it. |
| After-submission restrictions | Whether code, video or description changes are restricted. |

## Project pitch

**Emote Exchange turns a channel's emotes into a play-money market driven by chat attention.**

The product is a local Node process on the streamer's PC, with a dashboard and a transparent OBS browser-source overlay. Twitch chat is the viewer interface. The simulator provides a useful offline demonstration with visibly labeled simulated activity.

The entry's core proof is one continuous live walkthrough: two people create a Listing, a viewer buys, coordinated emote use moves the price, a sale updates the leaderboard, and the closing bell summarizes the Session. Everything uses play coins with no purchase, cash-out or real-money value.

## Submission package to prepare

Confirm exact requirements against the organizer form, then prepare:

- A source repository with assets, setup instructions and an honest current feature list.
- A description of shipped functionality and how Codex was actually used.
- The actual build-session information, recorded in [codex-sessions.md](submission/codex-sessions.md).
- A short video showing the app working with Twitch and a few real build/review moments.
- Screenshots of the overlay, the dashboard and the build process.

[The submission kit](submission/emote-exchange.md) is a working draft. Remove claims that are not supported by the finished app and verification evidence.

## Evidence to capture

| Product quality | Evidence |
|---|---|
| A clear idea | Chat attention visibly moves emote prices. |
| Community participation | Real viewers create Listings and trade in the same Session. |
| Technical reliability | Deterministic engine tests, bounded chat delivery, restart recovery and guarded local routes. |
| Design quality | Setup without credentials, readable OBS overlay, clear failure and connection states. |
| Codex use | A real plan, a meaningful red-to-green test and a review finding that was fixed. |

These are preparation goals, not a statement of official scoring or an originality guarantee.

## Recording plan

Use the broadcaster's own channel, original or licensed assets, and music or sounds whose permissions have been checked. Keep simulated activity labeled with `sim_` names and a SIM badge. Record real Twitch behavior separately from synthetic load so the final description can state what was demonstrated.

Capture build footage as work happens. Keep the final video and text consistent with the shipped commit and actual tests. Confirm any final freeze requirement with the organizer before enforcing it.
