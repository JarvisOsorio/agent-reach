import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  AgentReach,
  AgentReachError,
  verifyReceipt,
  assertReceiptIntegrity,
  hashReceiptBody,
  type ConversionReceipt,
} from "../src/index.js";

describe("publish → discover → pitch → accept/reject", () => {
  let reach: AgentReach;

  beforeEach(() => {
    reach = new AgentReach({ dbPath: ":memory:" });
  });

  afterEach(() => {
    reach.close();
  });

  it("full accept path yields integrity-valid receipt", () => {
    const offer = reach.publish({
      id: "offer-scrub",
      name: "Scrubber",
      publisherAgentId: "seller-agent",
      capabilities: ["transcript-scrub"],
      tags: ["security"],
      pricing: { model: "per_call", amount: 0.02, currency: "USD" },
      endpoints: [{ type: "mcp", url: "mcp://scrub.local" }],
    });

    const hits = reach.discover({ query: "scrub transcripts", capabilities: ["transcript-scrub"] });
    expect(hits[0]?.offer.id).toBe(offer.id);

    const pitch = reach.pitch({
      offerId: offer.id,
      fromAgentId: "buyer-agent",
      intent: "scrub CI logs",
      message: "Need PII redaction before archive",
      proposedTerms: { volume: 1000 },
    });
    expect(pitch.status).toBe("pending");
    expect(pitch.toAgentId).toBe("seller-agent");

    const { pitch: accepted, receipt } = reach.accept(pitch.id, {
      terms: { volume: 1000, rate: 0.02 },
    });
    expect(accepted.status).toBe("accepted");
    expect(receipt.decision).toBe("accepted");
    expect(verifyReceipt(receipt)).toBe(true);
    assertReceiptIntegrity(receipt);

    expect(reach.getReceipt(receipt.id)?.integrityHash).toBe(receipt.integrityHash);
  });

  it("reject path yields rejected receipt", () => {
    const offer = reach.publish({
      name: "Replay",
      publisherAgentId: "seller",
      capabilities: ["tool-replay"],
    });
    const pitch = reach.pitch({
      offerId: offer.id,
      fromAgentId: "buyer",
      intent: "record tools",
    });
    const { pitch: rejected, receipt } = reach.reject(pitch.id, { reason: "out of capacity" });
    expect(rejected.status).toBe("rejected");
    expect(receipt.decision).toBe("rejected");
    expect(receipt.reason).toBe("out of capacity");
    expect(verifyReceipt(receipt)).toBe(true);
  });

  it("cannot decide a pitch twice", () => {
    const offer = reach.publish({
      name: "X",
      publisherAgentId: "s",
      capabilities: ["c"],
    });
    const pitch = reach.pitch({ offerId: offer.id, fromAgentId: "b", intent: "i" });
    reach.accept(pitch.id);
    expect(() => reach.reject(pitch.id)).toThrow(AgentReachError);
  });

  it("tampered receipt fails integrity", () => {
    const offer = reach.publish({
      name: "X",
      publisherAgentId: "s",
      capabilities: ["c"],
    });
    const pitch = reach.pitch({ offerId: offer.id, fromAgentId: "b", intent: "i" });
    const { receipt } = reach.accept(pitch.id);

    const tampered: ConversionReceipt = {
      ...receipt,
      decision: "rejected",
    };
    expect(verifyReceipt(tampered)).toBe(false);
    expect(() => assertReceiptIntegrity(tampered)).toThrow(/integrity/);

    // Even if attacker copies old hash, body mismatch fails.
    const recomputed = hashReceiptBody(tampered);
    expect(recomputed).not.toBe(receipt.integrityHash);
  });

  it("export/import round-trip preserves integrity", () => {
    const offer = reach.publish({
      name: "Export Me",
      publisherAgentId: "s",
      capabilities: ["export"],
    });
    const pitch = reach.pitch({ offerId: offer.id, fromAgentId: "b", intent: "i" });
    reach.accept(pitch.id);

    const bundle = reach.store.exportBundle();
    expect(bundle.offers).toHaveLength(1);
    expect(bundle.receipts).toHaveLength(1);

    const other = new AgentReach({ dbPath: ":memory:" });
    try {
      other.store.importBundle(bundle);
      expect(other.store.counts()).toEqual({ offers: 1, pitches: 1, receipts: 1 });
      expect(verifyReceipt(other.store.listReceipts()[0]!)).toBe(true);
    } finally {
      other.close();
    }
  });

  it("tampered export fails import", () => {
    const offer = reach.publish({
      name: "X",
      publisherAgentId: "s",
      capabilities: ["c"],
    });
    const bundle = reach.store.exportBundle();
    bundle.offers[0]!.name = "HACKED";
    const other = new AgentReach({ dbPath: ":memory:" });
    try {
      expect(() => other.store.importBundle(bundle)).toThrow(/integrity/);
    } finally {
      other.close();
    }
    void offer;
  });
});
