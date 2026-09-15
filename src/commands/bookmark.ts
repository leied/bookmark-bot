import {
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  StickerFormatType,
  type APIAttachment,
  type APIEmbed,
  type APIEmbedFooter,
  type APIGuild,
  type APIInteractionResponseCallbackData,
  type APIMessage,
  type APIStickerItem,
} from "discord-api-types/v10";

import type { Command, CommandInput } from "../command.js";
import type { DiscordRest, DiscordUpload } from "../discord.js";
import { EMBED_LIMITS, embedLength, fitToMessage, isValidEmbed, totalEmbedLength } from "../embed.js";

/** Wraps bare links in markdown so they render as links inside an embed. */
export function replaceLinksWithMarkdown(text: string): string {
  // The leading group keeps the preceding character (and allows a link at the
  // very start of the string); skipping `(` avoids re-wrapping existing
  // markdown links.
  return text.replace(
    /(^|[^(])(?<url>https?:\/\/[^\s]+)/g,
    (_match, prefix: string, url: string) => `${prefix}[${url}](${url})`,
  );
}

function ephemeral(content: string): APIInteractionResponseCallbackData {
  return { content, flags: MessageFlags.Ephemeral };
}

/**
 * Discord's default-avatar index: `(id >> 22) % 6` for accounts on the new
 * username system (discriminator "0"), `discriminator % 5` for legacy ones.
 * The shift has to happen in BigInt because snowflakes exceed 2^53.
 */
export function defaultAvatarIndex(id: string, discriminator: string | undefined): number {
  const legacy = Number.parseInt(discriminator ?? "0", 10);
  if (Number.isFinite(legacy) && legacy > 0) return legacy % 5;

  try {
    return Number((BigInt(id) >> 22n) % 6n);
  } catch {
    return 0;
  }
}

function authorAvatarUrl(author: APIMessage["author"]): string {
  if (author.avatar) {
    return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`;
  }
  const index = defaultAvatarIndex(author.id, author.discriminator);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

const FALLBACK_ICON = "https://cdn.discordapp.com/embed/avatars/0.png";

function guildIconUrl(guild: APIGuild): string {
  return guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
    : FALLBACK_ICON;
}

/**
 * Where the bookmarked message came from. The guild is absent for a DM, and
 * also for a server the bot itself is not in — which happens whenever the app
 * is user-installed, since the interaction still carries a guild_id the bot
 * has no access to.
 */
function sourceFooter(
  guild: APIGuild | undefined,
  guildId: string | undefined,
  message: APIMessage,
): APIEmbedFooter {
  if (guild) {
    return { text: `From server: ${guild.name} (${guild.id})`, icon_url: guildIconUrl(guild) };
  }
  if (guildId) {
    return { text: `From server: ${guildId}`, icon_url: FALLBACK_ICON };
  }
  return {
    text: `From direct message with ${message.author.username} (${message.author.id})`,
    icon_url: authorAvatarUrl(message.author),
  };
}

/**
 * Reads the guild for its name and icon. A failure here must not sink the
 * bookmark: a 404 simply means the bot is not a member of that server.
 */
async function fetchGuild(rest: DiscordRest, guildId: string): Promise<APIGuild | undefined> {
  const response = await rest.get(`/guilds/${guildId}`);
  if (response.ok) return (await response.json()) as APIGuild;

  console.log(`[BOOKMARK] guild ${guildId} unreadable (${response.status}); continuing without it`);
  return undefined;
}

function stickerUrl(sticker: APIStickerItem): string {
  const extension =
    sticker.format_type === StickerFormatType.Lottie
      ? "json"
      : sticker.format_type === StickerFormatType.GIF
        ? "gif"
        : "png";
  return `https://media.discordapp.net/stickers/${sticker.id}.${extension}`;
}

/**
 * True if `addition` can be appended to the embed at `index` without breaking
 * that embed's own limits *or* the 6000 character budget shared by every embed
 * on the message.
 */
function canAdd(embeds: APIEmbed[], index: number, addition: string): boolean {
  const candidate = embeds[index];
  if (!candidate) return false;

  const grown = { ...candidate, description: (candidate.description ?? "") + addition };
  if (!isValidEmbed(grown)) return false;

  const total = totalEmbedLength(embeds) - embedLength(candidate) + embedLength(grown);
  return total <= EMBED_LIMITS.total;
}

function appendAttachmentLinks(embeds: APIEmbed[], attachments: APIAttachment[]): void {
  if (attachments.length === 0) return;
  if (embeds.length === 0) embeds.push({});

  const list = attachments.map((a) => `[${a.filename}](${a.url})`).join("\n> ");
  const description = `\n**Attachments:**\n> ${list}`;

  const lastIndex = embeds.length - 1;

  if (canAdd(embeds, 0, description)) {
    embeds[0]!.description = (embeds[0]!.description ?? "") + description;
  } else if (canAdd(embeds, lastIndex, description)) {
    embeds[lastIndex]!.description = (embeds[lastIndex]!.description ?? "") + description;
  } else {
    embeds.push({ description });
  }
}

interface AttachmentCopies {
  uploads: DiscordUpload[];
  failed: APIAttachment[];
}

/** Downloads Discord CDN attachments so the bookmark owns a durable copy. */
async function copyAttachments(attachments: APIAttachment[]): Promise<AttachmentCopies> {
  const results = await Promise.all(
    attachments.map(async (attachment) => {
      try {
        const response = await fetch(attachment.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        return {
          attachment,
          upload: {
            data: await response.blob(),
            filename: attachment.title ?? attachment.filename,
            description: attachment.description,
          } satisfies DiscordUpload,
        };
      } catch (error) {
        console.log(
          `[BOOKMARK] attachment ${attachment.id} could not be copied (${error}); preserving its link`,
        );
        return { attachment };
      }
    }),
  );

  return {
    uploads: results.flatMap((result) => (result.upload ? [result.upload] : [])),
    failed: results.flatMap((result) => (result.upload ? [] : [result.attachment])),
  };
}

function appendStickers(embeds: APIEmbed[], stickers: APIStickerItem[]): void {
  const [only] = stickers;
  if (stickers.length === 1 && only && only.format_type !== StickerFormatType.Lottie) {
    // A single animated/static sticker renders nicely as an image.
    embeds.push({ image: { url: stickerUrl(only) } });
  } else if (stickers.length > 1) {
    const description = stickers.map((s) => `[${s.name}](${stickerUrl(s)})\n`).join("");
    embeds.push({ description });
  }
}

/** Builds the embeds sent to the user's DMs for a bookmarked message. */
function buildEmbeds(message: APIMessage, footer: APIEmbedFooter): APIEmbed[] {
  // Only rich embeds carry content worth copying; link/image previews are
  // regenerated by Discord from the URLs in the description.
  const embeds: APIEmbed[] = (message.embeds ?? [])
    .filter((embed) => embed.type === "rich")
    .map((embed) => structuredClone(embed));

  if (message.content.length > 0) {
    embeds.unshift({ description: message.content });
  }

  for (const embed of embeds) {
    if (embed.description) embed.description = replaceLinksWithMarkdown(embed.description);
  }

  // Successfully copied attachments are sent as files. Anything still on the
  // message here failed to download and is retained as a link instead.
  appendAttachmentLinks(embeds, message.attachments ?? []);
  appendStickers(embeds, message.sticker_items ?? []);

  // A message can be empty of everything we copy (e.g. a poll); keep one embed
  // so the author/server attribution below always has somewhere to live.
  if (embeds.length === 0) embeds.push({});

  embeds[0]!.author = {
    name: `Sent by ${message.author.username} (${message.author.id})`,
    icon_url: authorAvatarUrl(message.author),
  };
  embeds[0]!.footer = footer;

  // Attribution counts against the budget too, so fit only once it is on.
  return fitToMessage(embeds);
}

export const bookmark: Command = {
  name: "Bookmark",
  type: ApplicationCommandType.Message,
  // Opens a DM channel, reads the guild, and sends the bookmark: three
  // sequential Discord calls, comfortably able to outlast the 3 second window.
  deferred: true,

  async respond(input: CommandInput): Promise<APIInteractionResponseCallbackData> {
    const rest = input.rest();

    // Open (or reuse) a DM channel with the invoking user.
    const dmResponse = await rest.post("/users/@me/channels", { recipient_id: input.uid() });

    if (dmResponse.status === 403) {
      return ephemeral("The bot is not authorized to create a dm channel with you");
    }
    if (!dmResponse.ok) {
      return ephemeral(
        `An error occured while creating a dm channel with you (${dmResponse.status})`,
      );
    }

    const dmChannel = (await dmResponse.json()) as { id?: string };
    if (!dmChannel.id) {
      return ephemeral("An error occured while creating a dm channel with you");
    }

    const messageId = input.targetId;
    const message = messageId ? input.resolved?.messages?.[messageId] : undefined;
    if (!messageId || !message) {
      return ephemeral("An error occured while reading the message you bookmarked");
    }

    const [guild, attachmentCopies] = await Promise.all([
      input.guildId ? fetchGuild(rest, input.guildId) : Promise.resolve(undefined),
      copyAttachments(message.attachments ?? []),
    ]);

    // DM and group-DM messages live under the @me pseudo-guild.
    const jumpUrl = `https://discord.com/channels/${input.guildId ?? "@me"}/${input.channelId}/${messageId}`;

    const outgoing = {
      embeds: buildEmbeds(
        { ...message, attachments: attachmentCopies.failed },
        sourceFooter(guild, input.guildId, message),
      ),
      components: input.defaultComponents(jumpUrl),
    };
    const messagePath = `/channels/${dmChannel.id}/messages`;
    const sent =
      attachmentCopies.uploads.length > 0
        ? await rest.postWithFiles(messagePath, outgoing, attachmentCopies.uploads)
        : await rest.post(messagePath, outgoing);

    if (sent.status === 403) {
      return ephemeral("Open your dms in this server to use this command");
    }
    if (!sent.ok) {
      return ephemeral("An error occured while sending a message in this channel");
    }

    return {
      flags: MessageFlags.Ephemeral,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: "bookmark",
              label: "Bookmarked",
              emoji: { name: "🔖" },
              disabled: true,
            },
          ],
        },
      ],
    };
  },
};
