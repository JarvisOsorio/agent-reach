export interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Record<string, string | boolean>;
  json: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let json = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      help = true;
      continue;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positional.push(a);
  }

  return {
    command: positional[0],
    positional: positional.slice(1),
    flags,
    json,
    help,
  };
}

export function flagString(
  flags: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const v = flags[key];
  if (typeof v === "string") return v;
  return undefined;
}

export function flagBool(flags: Record<string, string | boolean>, key: string): boolean {
  return flags[key] === true || flags[key] === "true";
}
