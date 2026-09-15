import { UpstreamError } from "./errors.js";

export const DISCORD_API = "https://discord.com/api/v10";

/**
 * Minimal Discord REST client. Replaces the `reqwest` client built per-request
 * in the Rust version; callers inspect `Response.status` themselves so the
 * handlers can branch on 403 vs 200 the way the original did.
 */
export class DiscordRest {
  constructor(private readonly token: string) {}

  async request(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${DISCORD_API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  get(path: string): Promise<Response> {
    return this.request("GET", path);
  }

  post(path: string, body?: unknown): Promise<Response> {
    return this.request("POST", path, body);
  }

  put(path: string, body?: unknown): Promise<Response> {
    return this.request("PUT", path, body);
  }

  delete(path: string): Promise<Response> {
    return this.request("DELETE", path);
  }

  /** GETs a path and parses the JSON body, throwing on a non-2xx response. */
  async getJson<T>(path: string): Promise<T> {
    const response = await this.get(path);
    if (!response.ok) {
      throw new UpstreamError(`Discord (GET ${path} -> ${response.status})`);
    }
    return (await response.json()) as T;
  }
}
