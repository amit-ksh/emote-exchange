import type { AuthPublicState, PublicMoment } from "@emote-exchange/twitch-kit";

export interface FoundationDisplay {
  app: "Emote Exchange";
  mode: "demo";
  phase: "foundation";
  simulatorRunning: false;
  overlayUrl: string;
  connectionChecks: number;
  auth: AuthPublicState;
}

export interface FoundationSnapshot extends FoundationDisplay {
  v: 1;
  seq: number;
  moments: readonly PublicMoment[];
}
