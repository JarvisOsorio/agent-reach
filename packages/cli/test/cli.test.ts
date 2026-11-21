import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/run.js";

function capture(fn: () => Promise<number>): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  return fn()
    .then((code) => ({ code, stdout: out.join(""), stderr: err.join("") }))
    .finally(() => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    });
}

describe("CLI hermetic", () => {
  let dir: string;
  let prev: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-reach-cli-"));
    prev = process.cwd();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(prev);
    rmSync(dir, { recursive: true, force: true });
  });

  it("init → publish → discover → pitch → accept (--json)", async () => {
    let r = await capture(() => run(["node", "agent-reach", "init", "--json"]));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).ok).toBe(true);
    expect(existsSync(join(dir, ".agent-reach", "store.sqlite"))).toBe(true);

    writeFileSync(
      join(dir, "offer.json"),
      JSON.stringify({
        id: "offer-1",
        name: "Scrubber Service",
        publisherAgentId: "seller-1",
        capabilities: ["transcript-scrub", "pii-redact"],
        tags: ["security"],
        pricing: { model: "per_call", amount: 0.01, currency: "USD" },
        endpoints: [{ type: "mcp", url: "mcp://scrub.local" }],
      }),
    );

    r = await capture(() => run(["node", "agent-reach", "publish", "offer.json", "--json"]));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).offer.id).toBe("offer-1");

    r = await capture(() =>
      run([
        "node",
        "agent-reach",
        "discover",
        "need transcript scrub",
        "--capability",
        "transcript-scrub",
        "--json",
      ]),
    );
    expect(r.code).toBe(0);
    const disc = JSON.parse(r.stdout);
    expect(disc.hits[0].offer.id).toBe("offer-1");

    r = await capture(() =>
      run([
        "node",
        "agent-reach",
        "pitch",
        "--offer",
        "offer-1",
        "--from",
        "buyer-1",
        "--intent",
        "scrub CI logs",
        "--json",
      ]),
    );
    expect(r.code).toBe(0);
    const pitchId = JSON.parse(r.stdout).pitch.id as string;

    r = await capture(() => run(["node", "agent-reach", "accept", pitchId, "--json"]));
    expect(r.code).toBe(0);
    const receipt = JSON.parse(r.stdout).receipt;
    expect(receipt.decision).toBe("accepted");
    expect(receipt.integrityHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reject path", async () => {
    await capture(() => run(["node", "agent-reach", "init", "--json"]));
    writeFileSync(
      join(dir, "offer.json"),
      JSON.stringify({
        name: "Replay",
        publisherAgentId: "s",
        capabilities: ["tool-replay"],
      }),
    );
    await capture(() => run(["node", "agent-reach", "publish", "offer.json", "--json"]));
    const list = await capture(() => run(["node", "agent-reach", "list", "offers", "--json"]));
    const offerId = JSON.parse(list.stdout).items[0].id as string;
    const pitched = await capture(() =>
      run([
        "node",
        "agent-reach",
        "pitch",
        "--offer",
        offerId,
        "--from",
        "b",
        "--intent",
        "record",
        "--json",
      ]),
    );
    const pitchId = JSON.parse(pitched.stdout).pitch.id as string;
    const rejected = await capture(() =>
      run(["node", "agent-reach", "reject", pitchId, "--reason", "capacity", "--json"]),
    );
    expect(rejected.code).toBe(0);
    expect(JSON.parse(rejected.stdout).receipt.decision).toBe("rejected");
  });

  it("invalid offer exits 2", async () => {
    await capture(() => run(["node", "agent-reach", "init"]));
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ name: "x" }));
    const r = await capture(() => run(["node", "agent-reach", "publish", "bad.json", "--json"]));
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).ok).toBe(false);
  });

  it("inspect missing exits 1", async () => {
    await capture(() => run(["node", "agent-reach", "init"]));
    const r = await capture(() => run(["node", "agent-reach", "inspect", "nope", "--json"]));
    expect(r.code).toBe(1);
  });

  it("doctor reports honesty flags", async () => {
    const r = await capture(() => run(["node", "agent-reach", "doctor", "--json"]));
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout);
    expect(body.agentsOnly).toBe(true);
    expect(body.humanAdNetwork).toBe(false);
    expect(body.networkRequired).toBe(false);
  });

  it("export/import + tamper fails", async () => {
    await capture(() => run(["node", "agent-reach", "init"]));
    writeFileSync(
      join(dir, "offer.json"),
      JSON.stringify({
        name: "X",
        publisherAgentId: "s",
        capabilities: ["c"],
      }),
    );
    await capture(() => run(["node", "agent-reach", "publish", "offer.json"]));
    const exp = await capture(() =>
      run(["node", "agent-reach", "export", "bundle.json", "--json"]),
    );
    expect(exp.code).toBe(0);

    const other = join(dir, "other");
    mkdirSync(other);
    process.chdir(other);
    await capture(() => run(["node", "agent-reach", "init"]));
    const ok = await capture(() =>
      run(["node", "agent-reach", "import", join(dir, "bundle.json"), "--json"]),
    );
    expect(ok.code).toBe(0);

    const bundle = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8"));
    bundle.offers[0].name = "TAMPER";
    writeFileSync(join(dir, "tampered.json"), JSON.stringify(bundle));
    const bad = await capture(() =>
      run(["node", "agent-reach", "import", join(dir, "tampered.json"), "--json"]),
    );
    expect(bad.code).toBe(2);
  });
});
