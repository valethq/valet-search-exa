import type { ToolCall, ToolDefinition, ToolResult } from "@valethq/sdk";
import { MAX_CHARACTERS, MAX_RESULTS, MAX_URLS, RANK, type Settings } from "./config";
import { type ExaClient, ExaError } from "./exa";
import { failures, formatResults } from "./format";

export interface ToolDeps {
  exa: ExaClient;
  settings(): Settings;
}

interface SearchInput {
  query: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  recency?: "day" | "week" | "month" | "year";
  category?: string;
  contents?: "highlights" | "text" | "none";
  maxCharacters?: number;
}

interface FetchInput {
  urls: string[];
  maxCharacters?: number;
}

const RECENCY_MS = { day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, year: 365 * 86_400_000 };
const CATEGORIES = [
  "company",
  "research paper",
  "news",
  "pdf",
  "github",
  "tweet",
  "personal site",
  "financial report",
  "people",
];

const text = (t: string, isError = false, meta?: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: t }],
  ...(isError && { isError }),
  ...(meta && { meta }),
});

const cap = (n: number | undefined, fallback: number, max: number) =>
  Math.min(Math.max(Math.trunc(n ?? fallback), 1), max);

function strings(v: unknown): string[] | undefined {
  const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  return list.length > 0 ? list : undefined;
}

function guarded(
  deps: ToolDeps,
  def: Omit<ToolDefinition<never>, "invoke" | "minRole">,
  run: ToolDefinition["invoke"],
): ToolDefinition {
  return {
    ...def,
    get minRole() {
      return deps.settings().minRole;
    },
    async invoke(input, call) {
      if (RANK[call.role] < RANK[deps.settings().minRole])
        return text("web search is not available to this role", true);
      try {
        return await run(input, call);
      } catch (e) {
        if (e instanceof ExaError) return text(e.message, true);
        throw e;
      }
    },
  };
}

const withTimeout = (call: ToolCall, ms: number) => AbortSignal.any([call.signal, AbortSignal.timeout(ms)]);

export function searchTool(deps: ToolDeps): ToolDefinition {
  return guarded(
    deps,
    {
      name: "web_search_exa",
      description:
        "Search the web with Exa and return titles, URLs and page excerpts. Good for current events, docs, papers and finding pages by meaning. Use web_fetch_exa to read a specific URL in full.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to look for. Natural language works; describe the page you want.",
          },
          numResults: { type: "integer", minimum: 1, maximum: MAX_RESULTS },
          includeDomains: {
            type: "array",
            items: { type: "string" },
            description: "Only these domains, e.g. github.com.",
          },
          excludeDomains: { type: "array", items: { type: "string" } },
          recency: {
            type: "string",
            enum: Object.keys(RECENCY_MS),
            description: "Only pages published within this window.",
          },
          category: { type: "string", enum: CATEGORIES },
          contents: {
            type: "string",
            enum: ["highlights", "text", "none"],
            description:
              "Excerpts per result: query-relevant highlights (default), page text, or none (links only).",
          },
          maxCharacters: {
            type: "integer",
            minimum: 100,
            maximum: MAX_CHARACTERS,
            description: "Per-result excerpt size.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    async (raw, call) => {
      const input = raw as SearchInput;
      const s = deps.settings();
      if (typeof input.query !== "string" || input.query.trim() === "")
        return text("query is required", true);
      const max = cap(input.maxCharacters, s.maxCharacters, MAX_CHARACTERS);
      const mode = input.contents ?? "highlights";
      const body: Record<string, unknown> = {
        query: input.query,
        type: s.searchType,
        numResults: cap(input.numResults, s.numResults, MAX_RESULTS),
      };
      const include = strings(input.includeDomains);
      const exclude = strings(input.excludeDomains);
      if (include) body.includeDomains = include;
      if (exclude) body.excludeDomains = exclude;
      if (input.category && CATEGORIES.includes(input.category)) body.category = input.category;
      if (input.recency && input.recency in RECENCY_MS) {
        body.startPublishedDate = new Date(Date.now() - RECENCY_MS[input.recency]).toISOString();
      }
      if (mode === "text") body.contents = { text: { maxCharacters: max } };
      else if (mode === "highlights") body.contents = { highlights: { maxCharacters: max } };

      const res = await deps.exa.post("/search", body, withTimeout(call, s.timeoutMs));
      return text(formatResults(res, max), false, {
        results: res.results.length,
        cost: res.costDollars?.total,
      });
    },
  );
}

export function fetchTool(deps: ToolDeps): ToolDefinition {
  return guarded(
    deps,
    {
      name: "web_fetch_exa",
      description:
        "Fetch one or more web pages through Exa and return their text. Use after web_search_exa, or for any URL you already have.",
      inputSchema: {
        type: "object",
        properties: {
          urls: { type: "array", items: { type: "string" }, minItems: 1, maxItems: MAX_URLS },
          maxCharacters: {
            type: "integer",
            minimum: 100,
            maximum: MAX_CHARACTERS,
            description: "Per-page cap.",
          },
        },
        required: ["urls"],
        additionalProperties: false,
      },
    },
    async (raw, call) => {
      const input = raw as FetchInput;
      const s = deps.settings();
      const urls = strings(input.urls)?.slice(0, MAX_URLS);
      if (!urls) return text("urls is required", true);
      const max = cap(input.maxCharacters, s.maxCharacters * 4, MAX_CHARACTERS);
      const res = await deps.exa.post(
        "/contents",
        { urls, text: { maxCharacters: max } },
        withTimeout(call, s.timeoutMs),
      );
      const failed = failures(res);
      const out = res.results.length > 0 ? formatResults(res, max) : "";
      const note = failed.length > 0 ? `\n\nCould not fetch:\n${failed.join("\n")}` : "";
      if (!out && failed.length === 0) return text("No content returned.", true);
      return text(`${out}${note}`.trim(), res.results.length === 0, {
        results: res.results.length,
        cost: res.costDollars?.total,
      });
    },
  );
}
