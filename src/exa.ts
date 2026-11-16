export interface ExaResult {
  title?: string | null;
  url: string;
  publishedDate?: string | null;
  author?: string | null;
  text?: string;
  highlights?: string[];
  summary?: string;
}

export interface ExaStatus {
  id: string;
  status: string;
  error?: { tag?: string; httpStatusCode?: number };
}

export interface ExaResponse {
  results: ExaResult[];
  statuses?: ExaStatus[];
  costDollars?: { total?: number };
}

export class ExaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface ExaClient {
  post(path: string, body: unknown, signal: AbortSignal): Promise<ExaResponse>;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

const HINTS: Record<number, string> = {
  401: "the API key was rejected",
  402: "the Exa account is out of credits",
  403: "the API key is not allowed to do that",
  429: "rate limited by Exa, try again shortly",
};

export function exaClient(opts: {
  baseUrl: string;
  key: () => Promise<string | undefined>;
  fetch?: Fetch;
}): ExaClient {
  const doFetch: Fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  return {
    async post(path, body, signal) {
      const key = await opts.key();
      if (!key) {
        throw new ExaError(
          "no Exa API key: put it in ~/.valet/secrets/exa_api_key (mode 0600) or set EXA_API_KEY",
        );
      }
      let res: Response;
      try {
        res = await doFetch(`${opts.baseUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key.trim() },
          body: JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (signal.aborted) throw new ExaError("request timed out or was cancelled");
        throw new ExaError(`could not reach Exa: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        const hint = HINTS[res.status] ?? "request failed";
        throw new ExaError(`Exa ${res.status}: ${hint}${detail ? ` (${detail})` : ""}`, res.status);
      }
      return (await res.json()) as ExaResponse;
    },
  };
}
