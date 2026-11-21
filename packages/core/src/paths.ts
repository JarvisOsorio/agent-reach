import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const DEFAULT_DIR = ".agent-reach";
export const DEFAULT_DB = "store.sqlite";

/** Resolve store path from cwd (or override). Walks up looking for `.agent-reach`. */
export function resolveStoreDir(cwd = process.cwd()): string {
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, DEFAULT_DIR);
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return join(resolve(cwd), DEFAULT_DIR);
}

export function resolveDbPath(cwd = process.cwd(), override?: string): string {
  if (override) return resolve(override);
  return join(resolveStoreDir(cwd), DEFAULT_DB);
}
