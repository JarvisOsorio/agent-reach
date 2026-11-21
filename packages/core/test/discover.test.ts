import { describe, expect, it } from "vitest";
import { discoverOffers, OFFER_SCHEMA, type OfferCard } from "../src/index.js";

function offer(
  partial: Partial<OfferCard> & Pick<OfferCard, "id" | "name" | "capabilities">,
): OfferCard {
  return {
    schemaVersion: OFFER_SCHEMA,
    publisherAgentId: partial.publisherAgentId ?? "seller",
    publishedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("discoverOffers ranking + filters", () => {
  const catalog: OfferCard[] = [
    offer({
      id: "scrub",
      name: "Transcript Scrubber",
      capabilities: ["transcript-scrub", "pii-redact"],
      tags: ["security", "mcp"],
      description: "Redact secrets from agent transcripts before logging",
      pricing: { model: "per_call", amount: 0.01, currency: "USD" },
    }),
    offer({
      id: "replay",
      name: "Tool Replay VCR",
      capabilities: ["tool-replay", "cassette"],
      tags: ["testing", "vcr"],
      description: "Record and replay tool I/O for agents",
      pricing: { model: "free" },
    }),
    offer({
      id: "verify",
      name: "Outcome Verifier",
      capabilities: ["postcondition-verify", "github-assert"],
      tags: ["testing", "ci"],
      pricing: { model: "subscription", amount: 10, currency: "USD" },
    }),
  ];

  it("ranks capability-aligned offers higher", () => {
    const hits = discoverOffers(catalog, { query: "need transcript scrub for secrets" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.offer.id).toBe("scrub");
    expect(hits[0]!.score).toBeGreaterThan(hits[1]?.score ?? 0);
  });

  it("filters by required capabilities (AND)", () => {
    const hits = discoverOffers(catalog, {
      query: "testing",
      capabilities: ["tool-replay"],
    });
    expect(hits.map((h) => h.offer.id)).toEqual(["replay"]);
  });

  it("filters by pricing model", () => {
    const hits = discoverOffers(catalog, { query: "agent", pricingModel: "free" });
    expect(hits.map((h) => h.offer.id)).toEqual(["replay"]);
  });

  it("filters by tags (OR)", () => {
    const hits = discoverOffers(catalog, { query: "", tags: ["security"] });
    expect(hits.map((h) => h.offer.id)).toEqual(["scrub"]);
  });

  it("respects limit", () => {
    const hits = discoverOffers(catalog, { query: "testing agent", limit: 1 });
    expect(hits).toHaveLength(1);
  });

  it("returns empty when no capability match", () => {
    const hits = discoverOffers(catalog, {
      query: "anything",
      capabilities: ["quantum-teleport"],
    });
    expect(hits).toEqual([]);
  });
});
