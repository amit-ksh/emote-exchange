# Twitch Kit

The connection between a streamer's channel and Emote Exchange: who is talking, what they said, which words are emotes, and what the audience sees on stream.

## Language

### People and accounts

**Streamer**:
The person who owns the channel and runs the app on their own machine.
_Avoid_: user, owner, host

**Broadcaster account**:
The streamer's Twitch account, which the app reads the channel through.
_Avoid_: main account

**Bot account**:
An optional second Twitch account that the app speaks through in chat.
_Avoid_: chatbot user, service account

**Chatter**:
Anyone who sends a message in the channel's chat, including the streamer and mods.
_Avoid_: viewer (a viewer may never chat), user

**Mod**:
A chatter with moderator status in the channel, or the streamer.
_Avoid_: admin

### Chat and events

**Chat Message**:
One message a Chatter sent in the channel's chat.
_Avoid_: line, post

**Command**:
A Chat Message starting with `!` and a word, addressed to an app.
_Avoid_: bot command, action

**Emote**:
A named image chatters can type into chat, from Twitch or a community emote provider.
_Avoid_: emoji, sticker

**Emote Provider**:
A source of Emotes for a channel: Twitch, 7TV, BTTV or FFZ.
_Avoid_: emote service

**Follow**:
A viewer starting to follow the channel.

**Raid**:
Another channel sending its live viewers to this channel.
_Avoid_: host

**Shared Chat**:
A Twitch session where several channels' chats are merged. Messages from the other channels are **foreign**.

**Stream Session**:
The time between the channel going live and going offline.
_Avoid_: broadcast, VOD

### Screens

**Overlay**:
The live graphics an app adds to the stream, shown to the audience through OBS.
_Avoid_: widget (a widget is one part of an overlay), HUD

**Dashboard**:
The app's control page that only the streamer sees.
_Avoid_: admin panel, settings page

### Simulation

**Demo Mode**:
Running an app with no Twitch connection, driven only by the Simulator.
_Avoid_: offline mode, test mode

**Simulator**:
The built-in source of pretend chat and channel events.
_Avoid_: bot farm, fake chat

**Simulated Chatter**:
A pretend Chatter created by the Simulator, always named `sim_*` and labeled on screen.
_Avoid_: fake user
