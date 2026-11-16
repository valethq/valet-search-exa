import type { ExaResponse, ExaResult } from "./exa";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}...` : s);
const squash = (s: string) => s.replace(/\n{3,}/g, "\n\n").trim();

function body(r: ExaResult, max: number): string {
  if (r.text) return clip(squash(r.text), max);
  if (r.highlights?.length) return clip(r.highlights.map((h) => squash(h)).join("\n...\n"), max);
  if (r.summary) return clip(squash(r.summary), max);
  return "";
}

export function formatResults(res: ExaResponse, max: number): string {
  if (res.results.length === 0) return "No results.";
  return res.results
    .map((r, i) => {
      const meta = [r.publishedDate?.slice(0, 10), r.author].filter(Boolean).join(" · ");
      const text = body(r, max);
      return [`[${i + 1}] ${r.title || r.url}`, r.url, meta, text].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

/** One line per URL Exa could not fetch. */
export function failures(res: ExaResponse): string[] {
  return (res.statuses ?? [])
    .filter((s) => s.status === "error")
    .map(
      (s) =>
        `${s.id}: ${s.error?.tag ?? "error"}${s.error?.httpStatusCode ? ` (${s.error.httpStatusCode})` : ""}`,
    );
}
