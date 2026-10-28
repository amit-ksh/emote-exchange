import type {
  AuthPublicState,
  CatalogPublicState,
  ChatOutPublicState,
  EventSubPublicState,
  PublicMoment,
  SimulatorPublicState,
} from "@emote-exchange/twitch-kit";
import type { marketProjection } from "./market-display.ts";

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
  market?: ReturnType<typeof marketProjection>;
}

export interface FoundationSnapshot extends FoundationDisplay {
  v: 1;
  seq: number;
  moments: readonly PublicMoment[];
}
