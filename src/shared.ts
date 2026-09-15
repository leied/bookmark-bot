import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
} from "discord-api-types/v10";

/**
 * The row of buttons attached to every bookmark DM: recolour, delete, and a
 * link back to the original message.
 */
export function defaultComponents(
  jumpUrl: string,
): APIActionRowComponent<APIComponentInMessageActionRow>[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          custom_id: "color",
          emoji: { name: "🎨" },
          disabled: false,
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          custom_id: "delete",
          emoji: { name: "❌" },
          disabled: false,
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Link,
          url: jumpUrl,
          emoji: { name: "🔗" },
          disabled: false,
        },
      ],
    },
  ];
}
