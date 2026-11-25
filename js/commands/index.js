/**
 * Registro central de comandos: nombre/alias → definición.
 * @module commands
 */
import files from './files.js';
import text from './text.js';
import system from './system.js';
import network from './network.js';
import editor from './editor.js';
import game from './game.js';

export const ALL_COMMANDS = [...files, ...text, ...system, ...network, ...editor, ...game];

/** @returns {Map<string, ReturnType<import('./util.js').command>>} */
export function createRegistry(commands = ALL_COMMANDS) {
  const registry = new Map();
  for (const cmd of commands) {
    registry.set(cmd.name, cmd);
    for (const alias of cmd.aliases) registry.set(alias, cmd);
  }
  return registry;
}
