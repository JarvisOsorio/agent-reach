import type { DiscoverHit, DiscoverIntent, OfferCard } from "./types.js";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_+.-]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Rank and filter offers against a buyer intent.
 * Scoring is deterministic and hermetic (no network, no LLM).
 */
export function discoverOffers(offers: OfferCard[], intent: DiscoverIntent): DiscoverHit[] {
  const queryTokens = tokenize(intent.query);
  const requiredCaps = (intent.capabilities ?? []).map(norm);
  const tagFilter = (intent.tags ?? []).map(norm);
  const limit = intent.limit ?? 20;

  const hits: DiscoverHit[] = [];

  for (const offer of offers) {
    const caps = offer.capabilities.map(norm);
    const tags = (offer.tags ?? []).map(norm);

    // Required capabilities: all must be present (AND).
    if (requiredCaps.length > 0 && !requiredCaps.every((c) => caps.includes(c))) {
      continue;
    }

    // Pricing filter.
    if (intent.pricingModel && offer.pricing?.model !== intent.pricingModel) {
      continue;
    }

    // Tag filter: at least one match if tags provided (OR).
    if (tagFilter.length > 0 && !tagFilter.some((t) => tags.includes(t))) {
      continue;
    }

    const matchedCapabilities: string[] = [];
    const matchedTags: string[] = [];
    let score = 0;

    // Capability overlap with query tokens / required caps.
    for (const cap of caps) {
      const capTokens = tokenize(cap);
      const hitByQuery = queryTokens.some(
        (qt) => cap === qt || cap.includes(qt) || capTokens.includes(qt),
      );
      const hitByRequired = requiredCaps.includes(cap);
      if (hitByQuery || hitByRequired) {
        matchedCapabilities.push(cap);
        score += hitByRequired ? 10 : 5;
      }
    }

    // Tag overlap.
    for (const tag of tags) {
      if (queryTokens.includes(tag) || tagFilter.includes(tag)) {
        matchedTags.push(tag);
        score += 3;
      }
    }

    // Name / description soft match.
    const nameTokens = tokenize(offer.name);
    const descTokens = tokenize(offer.description ?? "");
    for (const qt of queryTokens) {
      if (nameTokens.includes(qt)) score += 4;
      if (descTokens.includes(qt)) score += 1;
      if (norm(offer.name).includes(qt)) score += 2;
    }

    // Publisher id exact token match (rare but useful in tests).
    if (queryTokens.includes(norm(offer.publisherAgentId))) {
      score += 1;
    }

    // Keep zero-score when browsing (empty query) or when hard filters already matched.
    const hardFiltered =
      requiredCaps.length > 0 || tagFilter.length > 0 || Boolean(intent.pricingModel);
    if (score === 0 && queryTokens.length > 0 && !hardFiltered) {
      continue;
    }

    // Baseline for filter-only / empty query browse.
    if (score === 0) score = 1;

    hits.push({ offer, score, matchedCapabilities, matchedTags });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.offer.id.localeCompare(b.offer.id);
  });

  return hits.slice(0, Math.max(0, limit));
}
