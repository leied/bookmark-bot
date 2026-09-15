import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  InteractionType,
} from "discord-api-types/v10";

import worker from "../src/index.js";
import { toRegisteredCommand } from "../src/command.js";
import { commands } from "../src/commands/index.js";
import { useSigningKey } from "./helpers.js";

async function dispatch(request: Request) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("signature verification", () => {
  it("answers a signed PING with a PONG", async () => {
    const sign = await useSigningKey();
    const response = await dispatch(await sign({ type: InteractionType.Ping }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: InteractionResponseType.Pong });
  });

  it("rejects a tampered body with 401", async () => {
    const sign = await useSigningKey();
    const request = await sign({ type: InteractionType.Ping });
    const tampered = new Request(request, { body: '{"type":1,"tampered":true}' });

    expect((await dispatch(tampered)).status).toBe(401);
  });

  it("rejects a request with no signature headers with 400", async () => {
    await useSigningKey();
    const request = new Request("https://bot.example.com/", {
      method: "POST",
      body: '{"type":1}',
    });

    expect((await dispatch(request)).status).toBe(400);
  });

  it("404s unknown routes", async () => {
    const response = await dispatch(new Request("https://bot.example.com/nope"));
    expect(response.status).toBe(404);
  });
});

describe("/help", () => {
  it("returns both embeds in a guild and only the DM embed in DMs", async () => {
    const sign = await useSigningKey();
    env.DISCORD_APPLICATION_ID = "123456789";

    const base = {
      type: InteractionType.ApplicationCommand,
      id: "1",
      application_id: "123456789",
      token: "t",
      version: 1,
      data: { id: "2", name: "help", type: 1 },
    };

    const inGuild = await dispatch(
      await sign({ ...base, guild_id: "999", member: { user: { id: "42" } } }),
    );
    const guildBody = (await inGuild.json()) as any;
    expect(guildBody.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(guildBody.data.embeds).toHaveLength(2);
    expect(guildBody.data.components[0].components[0].url).toContain("client_id=123456789");

    const inDm = await dispatch(await sign({ ...base, user: { id: "42" } }));
    const dmBody = (await inDm.json()) as any;
    expect(dmBody.data.embeds).toHaveLength(1);
    expect(dmBody.data.embeds[0].title).toBe("DM Help");
  });
});

describe("color component", () => {
  const bookmarkMessage = {
    id: "555",
    embeds: [{ description: "hello", color: 1 }],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          { type: ComponentType.Button, style: ButtonStyle.Secondary, custom_id: "color" },
          { type: ComponentType.Button, style: ButtonStyle.Secondary, custom_id: "delete" },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            url: "https://discord.com/channels/1/2/3",
          },
        ],
      },
    ],
  };

  function componentInteraction(customId: string) {
    return {
      type: InteractionType.MessageComponent,
      id: "1",
      application_id: "123",
      token: "t",
      version: 1,
      channel: { id: "77" },
      user: { id: "42" },
      message: bookmarkMessage,
      data: { custom_id: customId, component_type: ComponentType.Button },
    };
  }

  it("shows the palette, carrying the jump path in each custom_id", async () => {
    const sign = await useSigningKey();
    const body = (await (await dispatch(await sign(componentInteraction("color")))).json()) as any;

    expect(body.type).toBe(InteractionResponseType.UpdateMessage);
    const buttons = body.data.components[0].components;
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.custom_id).toMatch(/^color:\d+:1\/2\/3$/);
    }
  });

  it("round-trips a DM bookmark's @me jump link through the palette", async () => {
    const sign = await useSigningKey();
    const dmMessage = {
      ...bookmarkMessage,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            { type: ComponentType.Button, style: ButtonStyle.Secondary, custom_id: "color" },
            { type: ComponentType.Button, style: ButtonStyle.Secondary, custom_id: "delete" },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Link,
              url: "https://discord.com/channels/@me/222/333",
            },
          ],
        },
      ],
    };

    // Opening the palette must carry the @me path into each custom_id...
    const picker = (await (
      await dispatch(
        await sign({ ...componentInteraction("color"), message: dmMessage }),
      )
    ).json()) as any;
    const chosen = picker.data.components[0].components[0].custom_id;
    expect(chosen).toBe("color:5793266:@me/222/333");

    // ...and picking a colour must rebuild the same link, not a broken one.
    const applied = (await (
      await dispatch(
        await sign({ ...componentInteraction(chosen), message: dmMessage }),
      )
    ).json()) as any;
    expect(applied.data.components[0].components[2].url).toBe(
      "https://discord.com/channels/@me/222/333",
    );
  });

  it("uses only emoji any deployment can render", async () => {
    const sign = await useSigningKey();
    const body = (await (await dispatch(await sign(componentInteraction("color")))).json()) as any;

    // A custom emoji id here means the emoji belongs to someone else's server;
    // Discord rejects the response and the interaction appears to time out.
    for (const button of body.data.components[0].components) {
      expect(button.emoji.id).toBeUndefined();
      expect(button.emoji.name).toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("recolours every embed and restores the default buttons", async () => {
    const sign = await useSigningKey();
    const interaction = componentInteraction("color:15548997:1/2/3");
    const body = (await (await dispatch(await sign(interaction))).json()) as any;

    expect(body.type).toBe(InteractionResponseType.UpdateMessage);
    expect(body.data.embeds.every((e: any) => e.color === 15548997)).toBe(true);

    const buttons = body.data.components[0].components;
    expect(buttons.map((b: any) => b.custom_id)).toEqual(["color", "delete", undefined]);
    expect(buttons[2].url).toBe("https://discord.com/channels/1/2/3");
  });
});

describe("delete component", () => {
  it("deletes the bookmark message and confirms ephemerally", async () => {
    const sign = await useSigningKey();
    env.DISCORD_TOKEN = "test-token";

    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method} ${new URL(String(input)).pathname}`);
      return new Response(null, { status: 204 });
    });

    const body = (await (
      await dispatch(
        await sign({
          type: InteractionType.MessageComponent,
          id: "1",
          application_id: "123",
          token: "t",
          version: 1,
          channel: { id: "77" },
          user: { id: "42" },
          message: { id: "555", embeds: [], components: [] },
          data: { custom_id: "delete", component_type: ComponentType.Button },
        }),
      )
    ).json()) as any;

    expect(calls).toEqual(["DELETE /api/v10/channels/77/messages/555"]);
    expect(body.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(body.data.content).toBe("Bookmark Deleted");
    vi.unstubAllGlobals();
  });
});

describe("command registration", () => {
  it("is not exposed as a public endpoint", async () => {
    // Registration spends the bot token, so it must not be reachable by
    // anyone on the internet; it runs from a developer machine instead.
    const response = await dispatch(
      new Request("https://bot.example.com/register", { method: "POST" }),
    );

    expect(response.status).toBe(404);
  });

  it("declares the contexts a command may be used in", async () => {
    const payload = commands.map(toRegisteredCommand);

    expect(payload.map((c) => c.name)).toEqual(["help", "Bookmark"]);
    // Discord rejects a description on context-menu commands.
    expect(payload.find((c) => c.name === "Bookmark")!.description).toBe("");
    expect(payload.find((c) => c.name === "help")!.description).toBe("Information about the bot");

    // Without these, commands inherit the app's configured contexts and are
    // not offered in DMs. PrivateChannel (2) additionally needs UserInstall (1).
    for (const command of payload) {
      expect(command.contexts).toEqual([0, 1, 2]);
      expect(command.integration_types).toEqual([0, 1]);
    }
  });
});
