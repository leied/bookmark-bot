import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type APIEmbed,
  type APIInteractionResponseCallbackData,
} from "discord-api-types/v10";

import type { Command, CommandInput } from "../command.js";

const EMBED_COLOR = 3092790;

const GUILD_HELP: APIEmbed = {
  title: "Server Help",
  description:
    "Bookermarker is a simple bot that allows users to bookmark messages by using interactions. Right click on a message --> Apps --> Bookmark. The bot will DM you with the contents of the message.",
  color: EMBED_COLOR,
  fields: [
    {
      name: "Command Permissions",
      value:
        "To manage in which roles / channels Bookmarker can be used, head to Server settings --> Integrations --> Bookmarker and adjust the **Bookmark** command. For more information on managing slash command perms see this [discord article.](https://support.discord.com/hc/en-us/articles/10952896421783)",
    },
  ],
  image: { url: "https://i.imgur.com/xhlrXm6.png" },
};

const DM_HELP: APIEmbed = {
  title: "DM Help",
  description:
    "Bookmarker offers some unique interactions in DMs to help organise and add notes to bookmarks.",
  color: EMBED_COLOR,
  fields: [
    {
      name: ":pencil: Add Note (coming soon)",
      value: "Adds a note to the bookmark. Leave blank to remove the note",
      inline: true,
    },
    {
      name: ":art: Change Embed Colour",
      value: "Update the colour of the embed from a selection.",
      inline: true,
    },
    {
      name: ":x: Delete Bookmark",
      value: "Deletes the bookmark instantly.",
      inline: true,
    },
  ],
};

export const help: Command = {
  name: "help",
  description: "Information about the bot",

  async respond(input: CommandInput): Promise<APIInteractionResponseCallbackData> {
    const inviteUrl =
      `https://discord.com/api/oauth2/authorize?client_id=${input.env.DISCORD_APPLICATION_ID}` +
      `&permissions=0&scope=bot%20applications.commands`;

    return {
      flags: MessageFlags.Ephemeral,
      // In DMs the server-side help is not useful, so only send the DM half.
      embeds: input.guildId ? [GUILD_HELP, DM_HELP] : [DM_HELP],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Link,
              label: "Invite",
              url: inviteUrl,
              disabled: false,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Link,
              label: "Support Form",
              url: "https://tally.so/r/w7q1EA/",
              disabled: false,
            },
          ],
        },
      ],
    };
  },
};
