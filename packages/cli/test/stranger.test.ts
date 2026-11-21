/**
 * Stranger-install path: simulate a fresh clone user who only has the built CLI
 * and runs the documented happy path without prior workspace state.
 */
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliEntry = join(__dirname, "../dist/index.js");

describe("stranger CLI install path", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-reach-stranger-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function cli(args: string[]) {
    return spawnSync(process.execPath, [cliEntry, ...args], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
  }

  it("fresh dir: init → publish → discover → pitch → accept → inspect receipt", () => {
    expect(existsSync(cliEntry)).toBe(true);

    let r = cli(["init", "--json"]);
    expect(r.status).toBe(0);

    writeFileSync(
      join(dir, "seller-offer.json"),
      JSON.stringify(
        {
          id: "mcp-scrub-v1",
          name: "Agent Transcript Scrubber",
          description: "Redact secrets before logging",
          publisherAgentId: "seller-bot",
          capabilities: ["transcript-scrub"],
          endpoints: [{ type: "mcp", url: "mcp://scrub.example" }],
          pricing: { model: "negotiable" },
          tags: ["security"],
        },
        null,
        2,
      ),
    );

    r = cli(["publish", "seller-offer.json", "--json"]);
    expect(r.status).toBe(0);

    r = cli(["discover", "transcript", "scrub", "--json"]);
    expect(r.status).toBe(0);
    const hits = JSON.parse(r.stdout).hits;
    expect(hits[0].offer.id).toBe("mcp-scrub-v1");

    r = cli([
      "pitch",
      "--offer",
      "mcp-scrub-v1",
      "--from",
      "buyer-bot",
      "--intent",
      "scrub staging logs",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const pitchId = JSON.parse(r.stdout).pitch.id;

    r = cli(["accept", pitchId, "--json"]);
    expect(r.status).toBe(0);
    const receipt = JSON.parse(r.stdout).receipt;
    expect(receipt.decision).toBe("accepted");

    r = cli(["inspect", receipt.id, "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).integrityValid).toBe(true);

    r = cli(["doctor", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).counts.receipts).toBe(1);
  });
});
