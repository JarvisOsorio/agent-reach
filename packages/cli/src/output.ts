export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function printHuman(lines: string[]): void {
  process.stdout.write(`${lines.join("\n")}\n`);
}

export function printError(err: unknown, json: boolean): void {
  const code =
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : "ERROR";
  const message = err instanceof Error ? err.message : String(err);
  if (json) {
    printJson({ ok: false, error: { code, message } });
  } else {
    process.stderr.write(`error [${code}]: ${message}\n`);
  }
}
