/**
 * Seller publishes → buyer discovers → pitch → accept → receipt.
 * Hermetic: in-memory SQLite, no network.
 */
import { AgentReach, verifyReceipt, type OfferCard } from "@agent-reach/core";

const reach = new AgentReach({ dbPath: ":memory:" });

console.log("=== agent-reach example: seller → buyer deal flow ===\n");

const offer: OfferCard = reach.publish({
  id: "offer-scrubber",
  name: "Transcript Scrubber",
  description: "Redact API keys and PII from agent transcripts before archive",
  publisherAgentId: "seller-scrub-bot",
  capabilities: ["transcript-scrub", "pii-redact"],
  endpoints: [
    { type: "mcp", url: "mcp://scrub.local/v1", name: "scrub-mcp" },
    { type: "http", url: "https://scrub.local/v1/redact" },
  ],
  pricing: { model: "per_call", amount: 0.01, currency: "USD" },
  authHints: [{ type: "api_key", details: "X-Api-Key header" }],
  tags: ["security", "mcp"],
});

console.log("1. Seller published offer:");
console.log(`   ${offer.id} — ${offer.name}`);
console.log(`   capabilities: ${offer.capabilities.join(", ")}\n`);

const hits = reach.discover({
  query: "I need to scrub secrets from agent transcripts before logging",
  capabilities: ["transcript-scrub"],
});

console.log("2. Buyer discover(intent):");
for (const h of hits) {
  console.log(`   score=${h.score}  ${h.offer.id}  matched=[${h.matchedCapabilities.join(", ")}]`);
}
console.log();

if (!hits[0]) {
  console.error("No hits — demo failed");
  process.exit(1);
}

const pitch = reach.pitch({
  offerId: hits[0].offer.id,
  fromAgentId: "buyer-ci-bot",
  intent: "scrub CI agent logs before long-term storage",
  message: "Volume ~5k transcripts/day; need MCP endpoint",
  proposedTerms: { volumePerDay: 5000, maxLatencyMs: 200 },
});

console.log("3. Buyer pitched:");
console.log(`   pitch=${pitch.id}  status=${pitch.status}  to=${pitch.toAgentId}\n`);

const { pitch: accepted, receipt } = reach.accept(pitch.id, {
  terms: { volumePerDay: 5000, rateUsd: 0.01 },
  reason: "capacity available; MCP endpoint matches",
});

console.log("4. Seller accepted:");
console.log(`   pitch status=${accepted.status}`);
console.log(`   receipt=${receipt.id}`);
console.log(`   decision=${receipt.decision}`);
console.log(`   integrityHash=${receipt.integrityHash}`);
console.log(`   verifyReceipt=${verifyReceipt(receipt)}\n`);

console.log("5. Reject-path smoke (second offer):");
const other = reach.publish({
  name: "Overloaded Service",
  publisherAgentId: "busy-seller",
  capabilities: ["load-test"],
});
const pitch2 = reach.pitch({
  offerId: other.id,
  fromAgentId: "buyer-ci-bot",
  intent: "need load testing",
});
const { receipt: rejected } = reach.reject(pitch2.id, { reason: "at capacity" });
console.log(`   reject receipt decision=${rejected.decision} valid=${verifyReceipt(rejected)}\n`);

reach.close();
console.log("Done. (local-first, no network, agents-only)");
