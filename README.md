# valet-search-exa

`tools@1` provider with two tools backed by [Exa](https://exa.ai): `web_search_exa` and `web_fetch_exa`. No runtime
dependencies, just `fetch`. Available to `trusted` and `owner` runs by default (ARCHITECTURE decision 5:
friends get search and fetch); `guest` runs get nothing.

## Setup

Put the API key in `~/.valet/secrets/exa_api_key` (mode 0600) or set `EXA_API_KEY` for valet. The key is read on
every call, so adding or rotating it needs no restart. Without one, the tools return an error that says so.

## Tools

`web_search_exa { query, numResults?, includeDomains?, excludeDomains?, recency?, category?, contents?, maxCharacters? }`

- `POST /search`. `recency` is `day | week | month | year` and becomes `startPublishedDate`.
- `contents`: `highlights` (default, query-relevant excerpts), `text`, or `none` (links only).
- Returns numbered results: title, URL, date and author, excerpt.

`web_fetch_exa { urls, maxCharacters? }`

- `POST /contents` for up to 10 URLs. URLs Exa could not fetch are listed after the results.

## Config

All optional, under `plugins.valet-search-exa.config`:

- `secret`: secret name (default `exa_api_key`)
- `baseUrl`: default `https://api.exa.ai`
- `searchType`: `auto` (default), `fast` or `deep`
- `numResults`: default 8, max 25
- `maxCharacters`: per-result excerpt size, default 2000 (`web_fetch_exa` uses 4x)
- `timeoutMs`: default 30000
- `minRole`: lowest role served, default `trusted`

Config changes apply without a restart.

## Checks

`bun run typecheck`, `bun run lint`, `bun test`.
