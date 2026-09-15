import { UpstreamError } from "./errors.js";

export const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordUpload {
  data: Blob;
  filename: string;
  description?: string;
}

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

  /**
   * Sends a multipart request using Discord's `payload_json` convention. Each
   * attachment id must match the index in `files[n]`.
   */
  postWithFiles(
    path: string,
    body: Record<string, unknown>,
    files: DiscordUpload[],
  ): Promise<Response> {
    const form = new FormData();
    form.append(
      "payload_json",
      JSON.stringify({
        ...body,
        attachments: files.map((file, index) => ({
          id: index,
          filename: file.filename,
          ...(file.description ? { description: file.description } : {}),
        })),
      }),
    );

    files.forEach((file, index) => {
      form.append(`files[${index}]`, file.data, file.filename);
    });

    // FormData supplies the multipart boundary, so Content-Type must not be
    // set manually here.
    return fetch(`${DISCORD_API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bot ${this.token}` },
      body: form,
    });
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

/**
 * Replaces the placeholder produced by a deferred interaction response.
 *
 * Interaction webhook endpoints are authenticated by the token in the URL, so
 * this deliberately sends no bot token. `flags` is stripped because the
 * ephemeral choice is fixed by the deferral and cannot be changed by an edit.
 */
export async function editOriginalInteractionResponse(
  applicationId: string,
  interactionToken: string,
  data: Record<string, unknown>,
): Promise<Response> {
  const { flags: _flags, ...body } = data;

  return fetch(
    `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
