import type {
  AuthPublicState,
  CatalogPublicState,
  ChatOutPublicState,
  EventSubPublicState,
  PublicMoment,
  SimulatorPublicState,
} from "@emote-exchange/twitch-kit";

export interface FoundationDisplay {
  app: "Emote Exchange";
  mode: "demo" | "live";
  phase: "foundation";
  simulatorRunning: boolean;
  overlayUrl: string;
  overlayClients: number;
  connectionChecks: number;
  auth: AuthPublicState;
  eventsub: EventSubPublicState;
  chatOut: ChatOutPublicState;
  catalog: CatalogPublicState;
  simulator: SimulatorPublicState;
}

export interface FoundationSnapshot extends FoundationDisplay {
  v: 1;
  seq: number;
  moments: readonly PublicMoment[];
}
