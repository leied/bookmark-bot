import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractionType, MessageFlags } from "discord-api-types/v10";

import worker from "../src/index.js";
import { useSigningKey } from "./helpers.js";

interface Route {
  status?: number;
  body?: unknown;
}

/**
 * Stubs global fetch with a tiny router keyed by `METHOD /path`, and records
 * the parsed JSON body of every outbound call so tests can assert on what the
 * bot sent to Discord.
 */
function mockDiscord(routes: Record<string, Route>) {
  const sent: Record<string, any> = {};

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : String(input));
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    const route = routes[key];
    if (!route) throw new Error(`Unexpected request: ${key}`);

    if (init?.body) sent[key] = JSON.parse(String(init.body));
    return Response.json(route.body ?? {}, { status: route.status ?? 200 });
  });

  return sent;
}

afterEach(() => vi.unstubAllGlobals());

const MESSAGE = {
  id: "333",
  content: "look at https://example.com",
  author: { id: "7", username: "author", discriminator: "0", avatar: "abc" },
  embeds: [],
  attachments: [],
  sticker_items: [],
};

const SEND_DM = "POST /api/v10/channels/dm-1/messages";

function bookmarkInteraction(overrides: Record<string, unknown> = {}, message: unknown = MESSAGE) {
  return {
    type: InteractionType.ApplicationCommand,
    id: "1",
    application_id: "123",
    token: "t",
    version: 1,
    guild_id: "111",
    channel: { id: "222" },
    member: { user: { id: "42" } },
    data: {
      id: "2",
      name: "Bookmark",
      type: 3,
      target_id: "333",
      resolved: { messages: { "333": message } },
    },
    ...overrides,
  };
}

/** Mirrors Discord's 6000 character budget calculation, independently of src/. */
function totalLength(embeds: any[]): number {
  return embeds.reduce(
    (sum, e) =>
      sum +
      (e.title?.length ?? 0) +
      (e.description?.length ?? 0) +
      (e.footer?.text.length ?? 0) +
      (e.author?.name.length ?? 0) +
      (e.fields ?? []).reduce((f: number, x: any) => f + x.name.length + x.value.length, 0),
    0,
  );
}

async function dispatch(request: Request) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function happyPathRoutes(overrides: Record<string, Route> = {}) {
  return {
    "POST /api/v10/users/@me/channels": { body: { id: "dm-1" } },
    "GET /api/v10/guilds/111": { body: { id: "111", name: "My Server", icon: "gicon" } },
    [SEND_DM]: { body: { id: "sent" } },
    ...overrides,
  };
}

describe("/Bookmark", () => {
  it("refuses to run outside a guild", async () => {
    const sign = await useSigningKey();
    const body = (await (
      await dispatch(await sign(bookmarkInteraction({ guild_id: undefined })))
    ).json()) as any;

    expect(body.data.content).toBe("This command can only be used in a server");
    expect(body.data.flags).toBe(MessageFlags.Ephemeral);
  });

  it("DMs an embed with author, server footer, jump link and markdown links", async () => {
    const sign = await useSigningKey();
    env.DISCORD_TOKEN = "test-token";
    const sent = mockDiscord(happyPathRoutes());

    const body = (await (await dispatch(await sign(bookmarkInteraction()))).json()) as any;

    const embed = sent[SEND_DM].embeds[0];
    expect(embed.description).toBe("look at [https://example.com](https://example.com)");
    expect(embed.author.name).toBe("author (7)");
    expect(embed.author.icon_url).toBe("https://cdn.discordapp.com/avatars/7/abc.png");
    expect(embed.footer.text).toBe("My Server (111)");
    expect(embed.footer.icon_url).toBe("https://cdn.discordapp.com/icons/111/gicon.png");

    const buttons = sent[SEND_DM].components[0].components;
    expect(buttons.map((b: any) => b.custom_id)).toEqual(["color", "delete", undefined]);
    expect(buttons[2].url).toBe("https://discord.com/channels/111/222/333");

    // The user gets an ephemeral, already-disabled confirmation button.
    expect(body.data.flags).toBe(MessageFlags.Ephemeral);
    expect(body.data.components[0].components[0].label).toBe("Bookmarked");
    expect(body.data.components[0].components[0].disabled).toBe(true);
  });

  it("appends attachments to the embed description", async () => {
    const sign = await useSigningKey();
    env.DISCORD_TOKEN = "test-token";
    const sent = mockDiscord(happyPathRoutes());

    const message = {
      ...MESSAGE,
      content: "",
      attachments: [{ filename: "cat.png", url: "https://cdn.test/cat.png" }],
    };
    await dispatch(await sign(bookmarkInteraction({}, message)));

    expect(sent[SEND_DM].embeds[0].description).toBe(
      "\n**Attachments:**\n> [cat.png](https://cdn.test/cat.png)",
    );
  });

  it("renders a single sticker as an image embed", async () => {
    const sign = await useSigningKey();
    env.DISCORD_TOKEN = "test-token";
    const sent = mockDiscord(happyPathRoutes());

    const message = {
      ...MESSAGE,
      content: "",
      sticker_items: [{ id: "900", name: "wave", format_type: 1 }],
    };
    await dispatch(await sign(bookmarkInteraction({}, message)));

    expect(sent[SEND_DM].embeds[0].image.url).toBe(
      "https://media.discordapp.net/stickers/900.png",
    );
  });

  it("still attributes a message with no copyable content", async () => {
    const sign = await useSigningKey();
    env.DISCORD_TOKEN = "test-token";
    const sent = mockDiscord(happyPathRoutes());

    await dispatch(await sign(bookmarkInteraction({}, { ...MESSAGE, content: "" })));

    expect(sent[SEND_DM].embeds).toHaveLength(1);
    expect(sent[SEND_DM].embeds[0].author.name).toBe("author (7)");
  });

  it("gives a migrated author (discriminator 0) a real default avatar", async () => {
    const sign = await useSigningKey();
    env.DISCORD_TOKEN = "test-token";
    const sent = mockDiscord(happyPathRoutes());

    const message = {
      ...MESSAGE,
      author: { id: "80351110224678912", username: "author", discriminator: "0", avatar: null },
    };
    await dispatch(await sign(bookmarkInteraction({}, message)));

    // Not avatars/0.png, which is what discriminator % 5 produced for every
    // account on the new username system.
    expect(sent[SEND_DM].embeds[0].author.icon_url).toBe(
      "https://cdn.discordapp.com/embed/avatars/5.png",
    );
  });

  it("keeps a heavy message within Discord's per-message embed limits", async () => {
    const sign = await useSigningKey();
    env.DISCORD_TOKEN = "test-token";
    const sent = mockDiscord(happyPathRoutes());

    // Twelve rich embeds of 1000 characters each: every embed is individually
    // legal, but the set is over both the 10 embed cap and the 6000 budget.
    const message = {
      ...MESSAGE,
      content: "",
      embeds: Array.from({ length: 12 }, () => ({ type: "rich", description: "x".repeat(1000) })),
    };
    await dispatch(await sign(bookmarkInteraction({}, message)));

    const embeds = sent[SEND_DM].embeds;
    expect(embeds.length).toBeLessThanOrEqual(10);
    expect(totalLength(embeds)).toBeLessThanOrEqual(6000);
    // The attribution embed survives the trim.
    expect(embeds[0].author.name).toBe("author (7)");
  });

  it("tells the user to open their DMs when Discord returns 403", async () => {
    const sign = await useSigningKey();
    env.DISCORD_TOKEN = "test-token";
    mockDiscord(happyPathRoutes({ [SEND_DM]: { status: 403, body: { message: "no" } } }));

    const body = (await (await dispatch(await sign(bookmarkInteraction()))).json()) as any;

    expect(body.data.content).toBe("Open your dms in this server to use this command");
  });

  it("reports when the bot cannot open a DM channel at all", async () => {
    const sign = await useSigningKey();
    env.DISCORD_TOKEN = "test-token";
    mockDiscord({ "POST /api/v10/users/@me/channels": { status: 403, body: {} } });

    const body = (await (await dispatch(await sign(bookmarkInteraction()))).json()) as any;

    expect(body.data.content).toBe("The bot is not authorized to create a dm channel with you");
  });
});
