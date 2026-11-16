import type { Hit, Provider } from "./types";

interface ExaResult {
  title?: string | null;
  url: string;
  publishedDate?: string | null;
  author?: string | null;
  text?: string;
  highlights?: string[];
  summary?: string;
}

interface ExaResponse {
  results: ExaResult[];
  statuses?: { id: string; status: string; error?: { tag?: string; httpStatusCode?: number } }[];
  costDollars?: { total?: number };
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

function hit(r: ExaResult): Hit {
  const text = r.text || (r.highlights?.length ? r.highlights.join("\n...\n") : r.summary);
  return { title: r.title, url: r.url, date: r.publishedDate, author: r.author, text };
}

export const provider: Provider = {
  id: "exa",
  label: "Exa",
  secret: "exa_api_key",
  baseUrl: "https://api.exa.ai",
  modes: ["auto", "fast", "deep"],
  defaultMode: "auto",
  maxResults: 25,
  searchProps: {
    category: { type: "string", enum: CATEGORIES },
    contents: {
      type: "string",
      enum: ["highlights", "text", "none"],
      description:
        "Excerpts per result: query-relevant highlights (default), page text, or none (links only).",
    },
  },
  headers: (key) => ({ "x-api-key": key }),
  async search(req, http) {
    const body: Record<string, unknown> = { query: req.query, type: req.mode, numResults: req.numResults };
    if (req.includeDomains) body.includeDomains = req.includeDomains;
    if (req.excludeDomains) body.excludeDomains = req.excludeDomains;
    const { category, contents = "highlights" } = req.input;
    if (typeof category === "string" && CATEGORIES.includes(category)) body.category = category;
    if (req.recency) body.startPublishedDate = new Date(Date.now() - RECENCY_MS[req.recency]).toISOString();
    if (contents === "text") body.contents = { text: { maxCharacters: req.maxCharacters } };
    else if (contents === "highlights") body.contents = { highlights: { maxCharacters: req.maxCharacters } };
    const res = (await http.post("/search", body, req.signal)) as ExaResponse;
    return { hits: res.results.map(hit), cost: res.costDollars?.total };
  },
  async fetch(req, http) {
    const body = { urls: req.urls, text: { maxCharacters: req.maxCharacters } };
    const res = (await http.post("/contents", body, req.signal)) as ExaResponse;
    const failed = (res.statuses ?? [])
      .filter((s) => s.status === "error")
      .map(
        (s) =>
          `${s.id}: ${s.error?.tag ?? "error"}${s.error?.httpStatusCode ? ` (${s.error.httpStatusCode})` : ""}`,
      );
    return { hits: res.results.map(hit), failed };
  },
};
