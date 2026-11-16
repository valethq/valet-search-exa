import type { Role } from "@valethq/sdk";

export interface ExaConfig {
  /** Secret name holding the API key (file ~/.valet/secrets/<name>, then env var). Default "exa_api_key". */
  secret?: string;
  /** Default "https://api.exa.ai". */
  baseUrl?: string;
  /** Default search type. Default "auto". */
  searchType?: "auto" | "fast" | "deep";
  /** Default result count. Default 8, max 25. */
  numResults?: number;
  /** Default characters of page text or highlights per result. Default 2000. */
  maxCharacters?: number;
  /** Request timeout. Default 30000. */
  timeoutMs?: number;
  /** Lowest role that gets the tools. Default "trusted" (ARCHITECTURE decision 5: friends get search and fetch). */
  minRole?: Role;
}

export interface Settings {
  secret: string;
  baseUrl: string;
  searchType: "auto" | "fast" | "deep";
  numResults: number;
  maxCharacters: number;
  timeoutMs: number;
  minRole: Role;
}

export const RANK: Record<Role, number> = { guest: 0, trusted: 1, owner: 2 };
export const MAX_RESULTS = 25;
export const MAX_URLS = 10;
export const MAX_CHARACTERS = 50_000;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(Math.trunc(n), lo), hi);

export function settings(cfg: ExaConfig | undefined): Settings {
  return {
    secret: cfg?.secret ?? "exa_api_key",
    baseUrl: (cfg?.baseUrl ?? "https://api.exa.ai").replace(/\/+$/, ""),
    searchType: cfg?.searchType ?? "auto",
    numResults: clamp(cfg?.numResults ?? 8, 1, MAX_RESULTS),
    maxCharacters: clamp(cfg?.maxCharacters ?? 2000, 100, MAX_CHARACTERS),
    timeoutMs: clamp(cfg?.timeoutMs ?? 30_000, 1000, 300_000),
    minRole: cfg?.minRole ?? "trusted",
  };
}
