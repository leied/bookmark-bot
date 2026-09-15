import { describe, expect, it } from "vitest";

import type { APIEmbed } from "discord-api-types/v10";

import { defaultAvatarIndex, replaceLinksWithMarkdown } from "../src/commands/bookmark.js";
import {
  EMBED_LIMITS,
  MAX_EMBEDS_PER_MESSAGE,
  embedLength,
  fitToMessage,
  fitsInOneMessage,
  isValidEmbed,
  totalEmbedLength,
} from "../src/embed.js";

describe("replaceLinksWithMarkdown", () => {
  it("wraps a bare link without eating the preceding character", () => {
    expect(replaceLinksWithMarkdown("see https://example.com now")).toBe(
      "see [https://example.com](https://example.com) now",
    );
  });

  it("wraps a link at the very start of the text", () => {
    expect(replaceLinksWithMarkdown("https://example.com")).toBe(
      "[https://example.com](https://example.com)",
    );
  });

  it("leaves existing markdown links alone", () => {
    const text = "[docs](https://example.com)";
    expect(replaceLinksWithMarkdown(text)).toBe(text);
  });

  it("wraps every bare link in the text", () => {
    expect(replaceLinksWithMarkdown("a https://one.test b https://two.test")).toBe(
      "a [https://one.test](https://one.test) b [https://two.test](https://two.test)",
    );
  });
});

describe("embed validation", () => {
  it("counts title, description, footer, author and fields", () => {
    expect(
      embedLength({
        title: "ab",
        description: "cde",
        footer: { text: "f" },
        author: { name: "gh" },
        fields: [{ name: "i", value: "jk" }],
      }),
    ).toBe(2 + 3 + 1 + 2 + 1 + 2);
  });

  it("rejects an over-long description", () => {
    expect(isValidEmbed({ description: "x".repeat(4097) })).toBe(false);
    expect(isValidEmbed({ description: "x".repeat(4096) })).toBe(true);
  });

  it("rejects an embed over the 6000 character budget", () => {
    expect(
      isValidEmbed({ description: "x".repeat(4000), footer: { text: "y".repeat(2001) } }),
    ).toBe(false);
  });

  it("rejects more than 25 fields", () => {
    const fields = Array.from({ length: 26 }, () => ({ name: "n", value: "v" }));
    expect(isValidEmbed({ fields })).toBe(false);
  });
});

describe("defaultAvatarIndex", () => {
  it("uses (id >> 22) % 6 for accounts on the new username system", () => {
    // 80351110224678912 >> 22 === 19144325, and 19144325 % 6 === 5.
    expect(Number((80351110224678912n >> 22n) % 6n)).toBe(5);
    expect(defaultAvatarIndex("80351110224678912", "0")).toBe(5);
  });

  it("does not collapse every migrated user onto avatar 0", () => {
    const indexes = new Set(
      ["80351110224678912", "80351110224678913", "123456789012345678", "987654321098765432"].map(
        (id) => defaultAvatarIndex(id, "0"),
      ),
    );
    expect(indexes.size).toBeGreaterThan(1);
  });

  it("keeps discriminator % 5 for legacy accounts", () => {
    expect(defaultAvatarIndex("80351110224678912", "1234")).toBe(1234 % 5);
  });

  it("falls back to 0 for an unparseable id", () => {
    expect(defaultAvatarIndex("not-a-snowflake", "0")).toBe(0);
  });
});

describe("per-message embed budget", () => {
  const big = (chars: number): APIEmbed => ({ description: "x".repeat(chars) });

  it("treats 6000 as a budget shared across all embeds", () => {
    const embeds = [big(4000), big(3000)];
    // Each embed is individually valid...
    expect(embeds.every(isValidEmbed)).toBe(true);
    // ...but together they blow the per-message budget.
    expect(totalEmbedLength(embeds)).toBe(7000);
    expect(fitsInOneMessage(embeds)).toBe(false);
  });

  it("drops trailing embeds until the set fits", () => {
    const fitted = fitToMessage([big(4000), big(3000), big(500)]);
    expect(fitted).toHaveLength(1);
    expect(totalEmbedLength(fitted)).toBeLessThanOrEqual(EMBED_LIMITS.total);
  });

  it("caps the embed count at 10", () => {
    const fitted = fitToMessage(Array.from({ length: 14 }, () => big(10)));
    expect(fitted).toHaveLength(MAX_EMBEDS_PER_MESSAGE);
  });

  it("truncates a single oversized embed rather than dropping it", () => {
    const fitted = fitToMessage([{ description: "y".repeat(5000), footer: { text: "z".repeat(1500) } }]);
    expect(fitted).toHaveLength(1);
    expect(totalEmbedLength(fitted)).toBeLessThanOrEqual(EMBED_LIMITS.total);
    expect(fitted[0]!.footer!.text).toHaveLength(1500);
  });

  it("leaves a set that already fits untouched", () => {
    const embeds = [big(100), big(200)];
    expect(fitToMessage(embeds)).toEqual(embeds);
  });
});
