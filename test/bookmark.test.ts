import { describe, expect, it } from "vitest";

import { replaceLinksWithMarkdown } from "../src/commands/bookmark.js";
import { embedLength, isValidEmbed } from "../src/embed.js";

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
