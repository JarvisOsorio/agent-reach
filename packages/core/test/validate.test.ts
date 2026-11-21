import { describe, expect, it } from "vitest";
import { OFFER_SCHEMA, validateOfferInput, AgentReachError } from "../src/index.js";

describe("validateOfferInput", () => {
  it("accepts a minimal valid offer", () => {
    const v = validateOfferInput({
      name: "MCP Scrubber",
      publisherAgentId: "seller-1",
      capabilities: ["transcript-scrub"],
    });
    expect(v.name).toBe("MCP Scrubber");
    expect(v.capabilities).toEqual(["transcript-scrub"]);
  });

  it("accepts a full offer with schemaVersion", () => {
    const v = validateOfferInput({
      schemaVersion: OFFER_SCHEMA,
      id: "offer-scrub",
      name: "MCP Scrubber",
      description: "Redact secrets from agent transcripts",
      publisherAgentId: "seller-1",
      capabilities: ["transcript-scrub", "pii-redact"],
      endpoints: [{ type: "mcp", url: "mcp://scrub.local" }],
      pricing: { model: "per_call", amount: 0.01, currency: "USD" },
      authHints: [{ type: "api_key", details: "X-Api-Key header" }],
      tags: ["security", "mcp"],
    });
    expect(v.id).toBe("offer-scrub");
    expect(v.pricing?.model).toBe("per_call");
    expect(v.endpoints?.[0]?.type).toBe("mcp");
  });

  it("rejects empty capabilities", () => {
    expect(() =>
      validateOfferInput({
        name: "x",
        publisherAgentId: "a",
        capabilities: [],
      }),
    ).toThrow(AgentReachError);
  });

  it("rejects bad pricing model", () => {
    expect(() =>
      validateOfferInput({
        name: "x",
        publisherAgentId: "a",
        capabilities: ["c"],
        pricing: { model: "barter" },
      }),
    ).toThrow(/pricing\.model/);
  });

  it("rejects wrong schemaVersion", () => {
    expect(() =>
      validateOfferInput({
        schemaVersion: "agent-reach.offer.v0",
        name: "x",
        publisherAgentId: "a",
        capabilities: ["c"],
      }),
    ).toThrow(/schemaVersion/);
  });
});
