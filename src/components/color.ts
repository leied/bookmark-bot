import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  type APIButtonComponent,
  type APIInteractionResponse,
} from "discord-api-types/v10";

import type { Component, ComponentInput } from "../component.js";
import { InteractionFailed } from "../errors.js";

const JUMP_URL_PREFIX = "https://discord.com/channels/";

/** The palette offered by the 🎨 button: decimal colour + its custom emoji. */
const PALETTE = [
  { color: 5793266, emoji: { id: "1086977694312439869", name: "bk_blurple" } },
  { color: 15548997, emoji: { id: "1086977702386466867", name: "bk_red" } },
  { color: 5763719, emoji: { id: "1086977699488223384", name: "bk_green" } },
  { color: 16705372, emoji: { id: "1086977704194216066", name: "bk_yellow" } },
  { color: 15418782, emoji: { id: "1086977696216645657", name: "bk_fucahsia" } },
] as const;

/**
 * Pulls the jump-url path (`<guild>/<channel>/<message>`) off the link button
 * in the bookmark's last action row, so it survives being re-encoded into the
 * palette buttons' custom_ids.
 */
function jumpPathFromMessage(input: ComponentInput): string {
  const rows = input.message.components ?? [];
  const lastRow = rows[rows.length - 1];
  if (!lastRow || lastRow.type !== ComponentType.ActionRow) {
    throw new InteractionFailed("No components found");
  }

  const buttons = lastRow.components;
  const lastButton = buttons[buttons.length - 1] as APIButtonComponent | undefined;
  const url =
    lastButton && lastButton.type === ComponentType.Button && "url" in lastButton
      ? lastButton.url
      : undefined;
  if (!url) throw new InteractionFailed("No components found");

  return url.slice(JUMP_URL_PREFIX.length);
}

export const color: Component = {
  customId: "color",

  async respond(input: ComponentInput): Promise<APIInteractionResponse> {
    const customId = input.customId;

    // `color:<decimal>:<guild>/<channel>/<message>` means a colour was picked;
    // a bare `color` means the picker still needs to be shown.
    if (customId.includes(":")) {
      const [, chosenColor, ...rest] = customId.split(":");
      const jumpPath = rest.join(":");
      const parsed = Number.parseInt(chosenColor ?? "", 10);
      if (Number.isNaN(parsed)) throw new InteractionFailed(`Invalid color '${chosenColor}'`);

      const embeds = (input.message.embeds ?? []).map((embed) => ({ ...embed, color: parsed }));

      return {
        type: InteractionResponseType.UpdateMessage,
        data: {
          content: "",
          embeds,
          components: input.defaultComponents(`${JUMP_URL_PREFIX}${jumpPath}`),
        },
      };
    }

    const jumpPath = jumpPathFromMessage(input);

    return {
      type: InteractionResponseType.UpdateMessage,
      data: {
        components: [
          {
            type: ComponentType.ActionRow,
            components: PALETTE.map(({ color: value, emoji }) => ({
              type: ComponentType.Button as const,
              style: ButtonStyle.Secondary as const,
              custom_id: `color:${value}:${jumpPath}`,
              emoji: { id: emoji.id, name: emoji.name, animated: false },
              disabled: false,
            })),
          },
        ],
      },
    };
  },
};
