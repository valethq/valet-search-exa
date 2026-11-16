import type { ToolCall } from "@valethq/sdk";
import { settings } from "../src/config";
import { type ExaClient, type ExaResponse, exaClient } from "../src/exa";
import type { ToolDeps } from "../src/tools";

export interface Seen {
  path: string;
  body: Record<string, unknown>;
  key: string | null;
}

export function fakeExa(reply: (path: string) => ExaResponse | Response, key: string | null = "k-123") {
  const seen: Seen[] = [];
  const client: ExaClient = exaClient({
    baseUrl: "http://exa.test",
    key: async () => key ?? undefined,
    fetch: async (input, init) => {
      const path = new URL(input).pathname;
      seen.push({
        path,
        body: JSON.parse(String(init.body)),
        key: new Headers(init.headers).get("x-api-key"),
      });
      const r = reply(path);
      return r instanceof Response ? r : Response.json(r);
    },
  });
  return { client, seen };
}

export function deps(exa: ExaClient, cfg: Parameters<typeof settings>[0] = {}): ToolDeps {
  const s = settings(cfg);
  return { exa, settings: () => s };
}

export const call = (role: ToolCall["role"] = "trusted"): ToolCall => ({
  sessionId: "s",
  runId: "r",
  callId: "c",
  role,
  caller: { plugin: "valet-agent" } as ToolCall["caller"],
  cwd: "/",
  signal: new AbortController().signal,
  progress() {},
});

export const textOf = (r: { content: { type: string; text?: string }[] }) =>
  r.content.map((c) => c.text ?? "").join("");
