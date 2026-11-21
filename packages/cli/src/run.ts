import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  AgentReach,
  AgentReachError,
  DEFAULT_DIR,
  assertReceiptIntegrity,
  resolveDbPath,
  resolveStoreDir,
  verifyReceipt,
  type ConversionReceipt,
  type ExportBundle,
  type OfferCard,
  type Pitch,
  type PricingModel,
} from "@agent-reach/core";
import { parseArgs, flagString, flagBool } from "./args.js";
import { EXIT } from "./exit.js";
import { HELP } from "./help.js";
import { printError, printHuman, printJson } from "./output.js";

function openReach(flags: Record<string, string | boolean>): AgentReach {
  const db = flagString(flags, "db");
  return new AgentReach({ dbPath: resolveDbPath(process.cwd(), db) });
}

function exitFromError(err: unknown): number {
  if (err instanceof AgentReachError) return err.exitCode;
  return EXIT.INFRA;
}

export async function run(argv: string[] = process.argv): Promise<number> {
  const parsed = parseArgs(argv);
  const { command, positional, flags, json, help } = parsed;

  if (help || !command) {
    if (json && !command) {
      printJson({
        ok: true,
        name: "agent-reach",
        version: "0.1.0",
        commands: [
          "init",
          "publish",
          "discover",
          "pitch",
          "accept",
          "reject",
          "list",
          "inspect",
          "export",
          "import",
          "doctor",
        ],
        exitCodes: { 0: "success", 1: "not_found", 2: "invalid", 3: "infra" },
      });
      return EXIT.OK;
    }
    process.stdout.write(HELP);
    return EXIT.OK;
  }

  try {
    switch (command) {
      case "init":
        return cmdInit(json);
      case "publish":
        return cmdPublish(positional, flags, json);
      case "discover":
        return cmdDiscover(positional, flags, json);
      case "pitch":
        return cmdPitch(flags, json);
      case "accept":
        return cmdDecide("accept", positional, flags, json);
      case "reject":
        return cmdDecide("reject", positional, flags, json);
      case "list":
        return cmdList(positional, flags, json);
      case "inspect":
        return cmdInspect(positional, flags, json);
      case "export":
        return cmdExport(positional, flags, json);
      case "import":
        return cmdImport(positional, flags, json);
      case "doctor":
        return cmdDoctor(flags, json);
      default:
        throw new AgentReachError("UNKNOWN_COMMAND", `Unknown command: ${command}`, EXIT.INVALID);
    }
  } catch (err) {
    printError(err, json);
    return exitFromError(err);
  }
}

function cmdInit(json: boolean): number {
  const dir = join(process.cwd(), DEFAULT_DIR);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "store.sqlite");
  const reach = new AgentReach({ dbPath });
  const counts = reach.store.counts();
  reach.close();
  if (json) {
    printJson({ ok: true, dir, dbPath, counts });
  } else {
    printHuman([`Initialized ${dir}`, `SQLite: ${dbPath}`, `Offers: ${counts.offers}`]);
  }
  return EXIT.OK;
}

function cmdPublish(
  positional: string[],
  flags: Record<string, string | boolean>,
  json: boolean,
): number {
  const file = positional[0] ?? flagString(flags, "file");
  if (!file) {
    throw new AgentReachError("INVALID_INPUT", "publish requires <offer.json> path", EXIT.INVALID);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new AgentReachError(
      "INVALID_INPUT",
      `Failed to read offer JSON: ${err instanceof Error ? err.message : String(err)}`,
      EXIT.INVALID,
    );
  }
  const reach = openReach(flags);
  try {
    const offer = reach.publish(raw);
    if (json) {
      printJson({ ok: true, offer });
    } else {
      printHuman([
        `Published offer ${offer.id}`,
        `  name: ${offer.name}`,
        `  publisher: ${offer.publisherAgentId}`,
        `  capabilities: ${offer.capabilities.join(", ")}`,
      ]);
    }
    return EXIT.OK;
  } finally {
    reach.close();
  }
}

function cmdDiscover(
  positional: string[],
  flags: Record<string, string | boolean>,
  json: boolean,
): number {
  const query = positional.join(" ").trim() || flagString(flags, "query") || "";
  const capRaw = flagString(flags, "capability") ?? flagString(flags, "capabilities");
  const tagRaw = flagString(flags, "tag") ?? flagString(flags, "tags");
  const pricing = flagString(flags, "pricing") as PricingModel | undefined;
  const limitRaw = flagString(flags, "limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const reach = openReach(flags);
  try {
    const hits = reach.discover({
      query,
      capabilities: capRaw
        ? capRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      tags: tagRaw
        ? tagRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      pricingModel: pricing,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    if (json) {
      printJson({ ok: true, query, count: hits.length, hits });
    } else if (hits.length === 0) {
      printHuman(["No matching offers."]);
    } else {
      printHuman([
        `Found ${hits.length} offer(s):`,
        ...hits.map(
          (h, i) =>
            `${i + 1}. [${h.score}] ${h.offer.id} — ${h.offer.name} (${h.offer.capabilities.join(", ")})`,
        ),
      ]);
    }
    return EXIT.OK;
  } finally {
    reach.close();
  }
}

function cmdPitch(flags: Record<string, string | boolean>, json: boolean): number {
  const offerId = flagString(flags, "offer");
  const from = flagString(flags, "from");
  const intent = flagString(flags, "intent");
  const message = flagString(flags, "message");
  if (!offerId || !from || !intent) {
    throw new AgentReachError(
      "INVALID_INPUT",
      "pitch requires --offer, --from, and --intent",
      EXIT.INVALID,
    );
  }
  const reach = openReach(flags);
  try {
    const pitch = reach.pitch({
      offerId,
      fromAgentId: from,
      intent,
      ...(message !== undefined ? { message } : {}),
    });
    if (json) {
      printJson({ ok: true, pitch });
    } else {
      printHuman([
        `Pitch ${pitch.id} → offer ${pitch.offerId}`,
        `  from: ${pitch.fromAgentId}  to: ${pitch.toAgentId}`,
        `  status: ${pitch.status}`,
        `  intent: ${pitch.intent}`,
      ]);
    }
    return EXIT.OK;
  } finally {
    reach.close();
  }
}

function cmdDecide(
  kind: "accept" | "reject",
  positional: string[],
  flags: Record<string, string | boolean>,
  json: boolean,
): number {
  const pitchId = positional[0];
  if (!pitchId) {
    throw new AgentReachError("INVALID_INPUT", `${kind} requires <pitchId>`, EXIT.INVALID);
  }
  const reason = flagString(flags, "reason");
  const reach = openReach(flags);
  try {
    const result =
      kind === "accept"
        ? reach.accept(pitchId, reason ? { reason } : undefined)
        : reach.reject(pitchId, reason ? { reason } : undefined);
    if (json) {
      printJson({ ok: true, ...result });
    } else {
      printHuman([
        `${kind === "accept" ? "Accepted" : "Rejected"} pitch ${result.pitch.id}`,
        `  receipt: ${result.receipt.id}`,
        `  decision: ${result.receipt.decision}`,
        `  integrity: ${result.receipt.integrityHash.slice(0, 16)}…`,
      ]);
    }
    return EXIT.OK;
  } finally {
    reach.close();
  }
}

function cmdList(
  positional: string[],
  flags: Record<string, string | boolean>,
  json: boolean,
): number {
  const kind = (positional[0] ?? "offers") as "offers" | "pitches" | "receipts";
  if (!["offers", "pitches", "receipts"].includes(kind)) {
    throw new AgentReachError(
      "INVALID_INPUT",
      "list kind must be offers|pitches|receipts",
      EXIT.INVALID,
    );
  }
  const reach = openReach(flags);
  try {
    const items = reach.list(kind);
    if (json) {
      printJson({ ok: true, kind, count: items.length, items });
    } else {
      printHuman([`${kind} (${items.length}):`, ...summarizeList(kind, items)]);
    }
    return EXIT.OK;
  } finally {
    reach.close();
  }
}

function summarizeList(kind: string, items: unknown[]): string[] {
  if (kind === "offers") {
    return (items as OfferCard[]).map((o) => `  ${o.id}  ${o.name}`);
  }
  if (kind === "pitches") {
    return (items as Pitch[]).map((p) => `  ${p.id}  ${p.status}  offer=${p.offerId}`);
  }
  return (items as ConversionReceipt[]).map((r) => `  ${r.id}  ${r.decision}  pitch=${r.pitchId}`);
}

function cmdInspect(
  positional: string[],
  flags: Record<string, string | boolean>,
  json: boolean,
): number {
  const id = positional[0];
  if (!id) {
    throw new AgentReachError("INVALID_INPUT", "inspect requires <id>", EXIT.INVALID);
  }
  const reach = openReach(flags);
  try {
    const offer = reach.getOffer(id);
    if (offer) {
      if (json) printJson({ ok: true, kind: "offer", offer });
      else printHuman([`Offer ${offer.id}`, JSON.stringify(offer, null, 2)]);
      return EXIT.OK;
    }
    const pitch = reach.getPitch(id);
    if (pitch) {
      if (json) printJson({ ok: true, kind: "pitch", pitch });
      else printHuman([`Pitch ${pitch.id}`, JSON.stringify(pitch, null, 2)]);
      return EXIT.OK;
    }
    const receipt = reach.getReceipt(id);
    if (receipt) {
      const valid = verifyReceipt(receipt);
      if (json) printJson({ ok: true, kind: "receipt", receipt, integrityValid: valid });
      else
        printHuman([
          `Receipt ${receipt.id}`,
          `integrity: ${valid ? "valid" : "INVALID"}`,
          JSON.stringify(receipt, null, 2),
        ]);
      return EXIT.OK;
    }
    throw new AgentReachError("NOT_FOUND", `No offer/pitch/receipt with id ${id}`, EXIT.NOT_FOUND);
  } finally {
    reach.close();
  }
}

function cmdExport(
  positional: string[],
  flags: Record<string, string | boolean>,
  json: boolean,
): number {
  const out = positional[0];
  if (!out) {
    throw new AgentReachError("INVALID_INPUT", "export requires <path>", EXIT.INVALID);
  }
  const reach = openReach(flags);
  try {
    const bundle = reach.store.exportBundle();
    writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    if (json) {
      printJson({
        ok: true,
        path: out,
        counts: {
          offers: bundle.offers.length,
          pitches: bundle.pitches.length,
          receipts: bundle.receipts.length,
        },
        integrityHash: bundle.integrityHash,
      });
    } else {
      printHuman([
        `Exported → ${out}`,
        `  offers=${bundle.offers.length} pitches=${bundle.pitches.length} receipts=${bundle.receipts.length}`,
        `  integrity=${bundle.integrityHash.slice(0, 16)}…`,
      ]);
    }
    return EXIT.OK;
  } finally {
    reach.close();
  }
}

function cmdImport(
  positional: string[],
  flags: Record<string, string | boolean>,
  json: boolean,
): number {
  const file = positional[0];
  if (!file) {
    throw new AgentReachError("INVALID_INPUT", "import requires <path>", EXIT.INVALID);
  }
  let bundle: ExportBundle;
  try {
    bundle = JSON.parse(readFileSync(file, "utf8")) as ExportBundle;
  } catch (err) {
    throw new AgentReachError(
      "INVALID_INPUT",
      `Failed to read export: ${err instanceof Error ? err.message : String(err)}`,
      EXIT.INVALID,
    );
  }
  const reach = openReach(flags);
  try {
    const result = reach.store.importBundle(bundle, { replace: flagBool(flags, "replace") });
    if (json) {
      printJson({ ok: true, imported: result.imported });
    } else {
      printHuman([
        `Imported bundle`,
        `  offers=${result.imported.offers} pitches=${result.imported.pitches} receipts=${result.imported.receipts}`,
      ]);
    }
    return EXIT.OK;
  } finally {
    reach.close();
  }
}

function cmdDoctor(flags: Record<string, string | boolean>, json: boolean): number {
  const dir = resolveStoreDir();
  const dbPath = resolveDbPath(process.cwd(), flagString(flags, "db"));
  const initialized = existsSync(dir) || existsSync(dbPath);
  let counts = { offers: 0, pitches: 0, receipts: 0 };
  let openOk = false;
  let error: string | undefined;
  if (initialized || flagString(flags, "db")) {
    try {
      const reach = openReach(flags);
      counts = reach.store.counts();
      // Spot-check receipt integrity if any exist.
      for (const r of reach.store.listReceipts()) {
        assertReceiptIntegrity(r);
      }
      reach.close();
      openOk = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const report = {
    ok: openOk || !initialized,
    product: "agent-reach",
    version: "0.1.0",
    agentsOnly: true,
    humanAdNetwork: false,
    aiAgencyDashboard: false,
    networkRequired: false,
    storeDir: dir,
    dbPath,
    initialized,
    openOk,
    counts,
    siblingBoundaries: {
      "agent-replay-lab": "tool I/O VCR — not merged",
      "agent-outcome": "postcondition verification — not merged",
      "agent-reach": "A2A discovery + deal flow (this product)",
    },
    ...(error ? { error } : {}),
  };

  if (json) {
    printJson(report);
  } else {
    printHuman([
      `agent-reach doctor`,
      `  agents-only: yes (not a human ad network)`,
      `  store: ${dbPath}`,
      `  initialized: ${initialized}`,
      `  open: ${openOk ? "ok" : initialized ? "FAIL" : "n/a (run init)"}`,
      `  counts: offers=${counts.offers} pitches=${counts.pitches} receipts=${counts.receipts}`,
      `  siblings: replay-lab (VCR) · outcome (postconditions) — boundaries held`,
    ]);
  }
  return openOk || !initialized ? EXIT.OK : EXIT.INFRA;
}
