import type { APIEmbed } from "discord-api-types/v10";

/**
 * Discord's documented embed limits.
 *
 * Note that `total` is a *per-message* budget: "the combined sum of characters
 * in all title, description, field.name, field.value, footer.text, and
 * author.name fields across all embeds attached to a message must not exceed
 * 6000 characters". Checking it against a single embed (as twilight-validate
 * did) lets a multi-embed message sail past it and get rejected by Discord.
 */
export const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  fieldCount: 25,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  authorName: 256,
  total: 6000,
} as const;

/** The API rejects a message carrying more embeds than this. */
export const MAX_EMBEDS_PER_MESSAGE = 10;

/** Characters an embed contributes to the per-message 6000 character budget. */
export function embedLength(embed: APIEmbed): number {
  let total = (embed.title?.length ?? 0) + (embed.description?.length ?? 0);
  total += embed.footer?.text.length ?? 0;
  total += embed.author?.name.length ?? 0;
  for (const field of embed.fields ?? []) {
    total += field.name.length + field.value.length;
  }
  return total;
}

/** Combined character count of every embed attached to one message. */
export function totalEmbedLength(embeds: APIEmbed[]): number {
  return embeds.reduce((sum, embed) => sum + embedLength(embed), 0);
}

/** Returns true when a single embed is within every per-embed Discord limit. */
export function isValidEmbed(embed: APIEmbed): boolean {
  if ((embed.title?.length ?? 0) > EMBED_LIMITS.title) return false;
  if ((embed.description?.length ?? 0) > EMBED_LIMITS.description) return false;
  if ((embed.footer?.text.length ?? 0) > EMBED_LIMITS.footerText) return false;
  if ((embed.author?.name.length ?? 0) > EMBED_LIMITS.authorName) return false;

  const fields = embed.fields ?? [];
  if (fields.length > EMBED_LIMITS.fieldCount) return false;
  for (const field of fields) {
    if (field.name.length > EMBED_LIMITS.fieldName) return false;
    if (field.value.length > EMBED_LIMITS.fieldValue) return false;
  }

  return embedLength(embed) <= EMBED_LIMITS.total;
}

/** True when this set of embeds can be sent on a single message as-is. */
export function fitsInOneMessage(embeds: APIEmbed[]): boolean {
  return (
    embeds.length <= MAX_EMBEDS_PER_MESSAGE &&
    embeds.every(isValidEmbed) &&
    totalEmbedLength(embeds) <= EMBED_LIMITS.total
  );
}

/**
 * Forces a set of embeds within Discord's per-message limits, preferring to
 * drop trailing embeds over losing the first one (which carries the author and
 * server attribution). Discord rejects the whole message otherwise, so a
 * trimmed bookmark beats no bookmark.
 */
export function fitToMessage(embeds: APIEmbed[]): APIEmbed[] {
  const trimmed = embeds.slice(0, MAX_EMBEDS_PER_MESSAGE).map((embed) => {
    if ((embed.description?.length ?? 0) <= EMBED_LIMITS.description) return embed;
    return { ...embed, description: truncate(embed.description!, EMBED_LIMITS.description) };
  });

  while (trimmed.length > 1 && totalEmbedLength(trimmed) > EMBED_LIMITS.total) {
    trimmed.pop();
  }

  // Still over budget means the surviving embed is itself too long.
  const overflow = totalEmbedLength(trimmed) - EMBED_LIMITS.total;
  const first = trimmed[0];
  if (overflow > 0 && first?.description) {
    trimmed[0] = {
      ...first,
      description: truncate(first.description, Math.max(1, first.description.length - overflow)),
    };
  }

  return trimmed;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}
