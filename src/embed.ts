import type { APIEmbed } from "discord-api-types/v10";

/**
 * Discord's documented embed limits, matching the checks `twilight-validate`
 * performed in the Rust version.
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

/** Total character count Discord counts against the 6000 character budget. */
export function embedLength(embed: APIEmbed): number {
  let total = (embed.title?.length ?? 0) + (embed.description?.length ?? 0);
  total += embed.footer?.text.length ?? 0;
  total += embed.author?.name.length ?? 0;
  for (const field of embed.fields ?? []) {
    total += field.name.length + field.value.length;
  }
  return total;
}

/** Returns true when the embed is within every Discord limit. */
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
