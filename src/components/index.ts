import type { Component } from "../component.js";
import { color } from "./color.js";
import { del } from "./delete.js";

/** Every message component handler. Add new components here. */
export const components: Component[] = [del, color];

/** Components are matched by custom_id prefix so they can carry state. */
export function findComponent(customId: string): Component | undefined {
  return components.find((component) => customId.startsWith(component.customId));
}
