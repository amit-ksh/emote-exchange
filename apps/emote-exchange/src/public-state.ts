import type {
  AuthPublicState,
  CatalogPublicState,
  ChatOutPublicState,
  EventSubPublicState,
  PublicMoment,
} from "@emote-exchange/twitch-kit";

export interface FoundationDisplay {
  app: "Emote Exchange";
  mode: "demo" | "live";
  phase: "foundation";
  simulatorRunning: false;
  overlayUrl: string;
  connectionChecks: number;
  auth: AuthPublicState;
  eventsub: EventSubPublicState;
  chatOut: ChatOutPublicState;
  catalog: CatalogPublicState;
}

export interface FoundationSnapshot extends FoundationDisplay {
  v: 1;
  seq: number;
  moments: readonly PublicMoment[];
}
