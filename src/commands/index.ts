import type { Command } from "../command.js";
import { bookmark } from "./bookmark.js";
import { help } from "./help.js";

/** Every command the bot exposes. Add new commands here. */
export const commands: Command[] = [help, bookmark];

export function findCommand(name: string): Command | undefined {
  return commands.find((command) => command.name === name);
}
