import { expect, test } from "bun:test";
import { fetchTool, searchTool } from "../src/tools";
import { call, deps, fakeExa, textOf } from "./helpers";

const hit = {
  title: "Bun 1.4",
  url: "https://bun.sh/blog",
  publishedDate: "2026-10-01T00:00:00Z",
  highlights: ["fast", "runtime"],
};

test("web_search sends the key, maps options to Exa's body and formats results", async () => {
  const { client, seen } = fakeExa(() => ({ results: [hit], costDollars: { total: 0.007 } }));
  const tool = searchTool(deps(client));
  const r = await tool.invoke(
    { query: "bun release", numResults: 3, includeDomains: ["bun.sh"], recency: "week", category: "news" },
    call(),
  );
  expect(r.isError).toBeUndefined();
  expect(textOf(r)).toBe("[1] Bun 1.4\nhttps://bun.sh/blog\n2026-10-01\nfast\n...\nruntime");
  expect(r.meta).toEqual({ results: 1, cost: 0.007 });
  const [s] = seen;
  expect(s?.path).toBe("/search");
  expect(s?.key).toBe("k-123");
  expect(s?.body).toMatchObject({
    query: "bun release",
    type: "auto",
    numResults: 3,
    includeDomains: ["bun.sh"],
    category: "news",
    contents: { highlights: { maxCharacters: 2000 } },
  });
  const since = Date.parse(String(s?.body.startPublishedDate));
  expect(Date.now() - since).toBeGreaterThan(6.9 * 86_400_000);
  expect(Date.now() - since).toBeLessThan(7.1 * 86_400_000);
});

test("web_search clamps numResults, honours contents modes and drops unknown categories", async () => {
  const { client, seen } = fakeExa(() => ({ results: [] }));
  const tool = searchTool(deps(client));
  expect(
    textOf(await tool.invoke({ query: "x", numResults: 999, contents: "text", category: "bogus" }, call())),
  ).toBe("No results.");
  await tool.invoke({ query: "x", contents: "none" }, call());
  expect(seen[0]?.body).toMatchObject({ numResults: 25, contents: { text: { maxCharacters: 2000 } } });
  expect(seen[0]?.body.category).toBeUndefined();
  expect(seen[1]?.body.contents).toBeUndefined();
});

test("web_search truncates long excerpts", async () => {
  const { client } = fakeExa(() => ({ results: [{ url: "https://a.b", text: "x".repeat(5000) }] }));
  const out = textOf(await searchTool(deps(client)).invoke({ query: "q", maxCharacters: 300 }, call()));
  expect(out.endsWith("...")).toBe(true);
  expect(out.length).toBeLessThan(400);
});

test("web_fetch posts urls to /contents and reports URLs Exa could not fetch", async () => {
  const { client, seen } = fakeExa(() => ({
    results: [{ url: "https://a.test", title: "A", text: "hello" }],
    statuses: [
      { id: "https://a.test", status: "success" },
      { id: "https://b.test", status: "error", error: { tag: "CRAWL_NOT_FOUND", httpStatusCode: 404 } },
    ],
  }));
  const r = await fetchTool(deps(client)).invoke({ urls: ["https://a.test", "https://b.test"] }, call());
  expect(r.isError).toBeUndefined();
  expect(textOf(r)).toBe(
    "[1] A\nhttps://a.test\nhello\n\nCould not fetch:\nhttps://b.test: CRAWL_NOT_FOUND (404)",
  );
  expect(seen[0]?.path).toBe("/contents");
  expect(seen[0]?.body).toEqual({
    urls: ["https://a.test", "https://b.test"],
    text: { maxCharacters: 8000 },
  });
});

test("web_fetch is an error when nothing comes back", async () => {
  const { client } = fakeExa(() => ({
    results: [],
    statuses: [{ id: "https://b.test", status: "error", error: { tag: "SOURCE_NOT_AVAILABLE" } }],
  }));
  const r = await fetchTool(deps(client)).invoke({ urls: ["https://b.test"] }, call());
  expect(r.isError).toBe(true);
  expect(textOf(r)).toContain("https://b.test: SOURCE_NOT_AVAILABLE");
  expect((await fetchTool(deps(client)).invoke({ urls: [] }, call())).isError).toBe(true);
});

test("HTTP failures become readable tool errors", async () => {
  for (const [status, hint] of [
    [401, "rejected"],
    [402, "credits"],
    [429, "rate limited"],
  ] as const) {
    const { client } = fakeExa(() => new Response("nope", { status }));
    const r = await searchTool(deps(client)).invoke({ query: "q" }, call());
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain(`Exa ${status}`);
    expect(textOf(r)).toContain(hint);
  }
});

test("a missing key explains where to put it", async () => {
  const { client, seen } = fakeExa(() => ({ results: [] }), null);
  const r = await searchTool(deps(client)).invoke({ query: "q" }, call());
  expect(r.isError).toBe(true);
  expect(textOf(r)).toContain("~/.valet/secrets/exa_api_key");
  expect(seen).toHaveLength(0);
});

test("roles below minRole are refused", async () => {
  const { client, seen } = fakeExa(() => ({ results: [] }));
  const t = searchTool(deps(client));
  expect(t.minRole).toBe("trusted");
  expect((await t.invoke({ query: "q" }, call("guest"))).isError).toBe(true);
  expect(seen).toHaveLength(0);
  expect((await t.invoke({ query: "q" }, call("owner"))).isError).toBeUndefined();
  const strict = searchTool(deps(client, { minRole: "owner" }));
  expect((await strict.invoke({ query: "q" }, call("trusted"))).isError).toBe(true);
});
