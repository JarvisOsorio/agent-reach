import {
  AgentReachError,
  OFFER_SCHEMA,
  type AuthHint,
  type OfferCard,
  type OfferEndpoint,
  type OfferPricing,
  type PublishOfferInput,
} from "./types.js";

const PRICING_MODELS = new Set(["free", "per_call", "subscription", "negotiable"]);
const ENDPOINT_TYPES = new Set(["http", "mcp", "a2a", "other"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requireString(obj: Record<string, unknown>, key: string, max = 512): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new AgentReachError("INVALID_OFFER", `Offer field "${key}" must be a non-empty string`);
  }
  if (v.length > max) {
    throw new AgentReachError("INVALID_OFFER", `Offer field "${key}" exceeds max length ${max}`);
  }
  return v;
}

function optionalString(obj: Record<string, unknown>, key: string, max = 4000): string | undefined {
  if (!(key in obj) || obj[key] === undefined) return undefined;
  const v = obj[key];
  if (typeof v !== "string") {
    throw new AgentReachError("INVALID_OFFER", `Offer field "${key}" must be a string`);
  }
  if (v.length > max) {
    throw new AgentReachError("INVALID_OFFER", `Offer field "${key}" exceeds max length ${max}`);
  }
  return v;
}

function parseEndpoints(raw: unknown): OfferEndpoint[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new AgentReachError("INVALID_OFFER", "endpoints must be an array");
  }
  return raw.map((item, i) => {
    if (!isPlainObject(item)) {
      throw new AgentReachError("INVALID_OFFER", `endpoints[${i}] must be an object`);
    }
    const type = item.type;
    if (typeof type !== "string" || !ENDPOINT_TYPES.has(type)) {
      throw new AgentReachError(
        "INVALID_OFFER",
        `endpoints[${i}].type must be one of http|mcp|a2a|other`,
      );
    }
    const url = item.url;
    if (typeof url !== "string" || url.trim().length === 0) {
      throw new AgentReachError("INVALID_OFFER", `endpoints[${i}].url is required`);
    }
    const ep: OfferEndpoint = { type: type as OfferEndpoint["type"], url };
    if (typeof item.name === "string") ep.name = item.name;
    if (typeof item.notes === "string") ep.notes = item.notes;
    return ep;
  });
}

function parsePricing(raw: unknown): OfferPricing | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    throw new AgentReachError("INVALID_OFFER", "pricing must be an object");
  }
  const model = raw.model;
  if (typeof model !== "string" || !PRICING_MODELS.has(model)) {
    throw new AgentReachError(
      "INVALID_OFFER",
      "pricing.model must be free|per_call|subscription|negotiable",
    );
  }
  const pricing: OfferPricing = { model: model as OfferPricing["model"] };
  if (raw.amount !== undefined) {
    if (typeof raw.amount !== "number" || !Number.isFinite(raw.amount) || raw.amount < 0) {
      throw new AgentReachError("INVALID_OFFER", "pricing.amount must be a non-negative number");
    }
    pricing.amount = raw.amount;
  }
  if (raw.currency !== undefined) {
    if (typeof raw.currency !== "string" || raw.currency.length < 3) {
      throw new AgentReachError("INVALID_OFFER", "pricing.currency must be a string (≥3)");
    }
    pricing.currency = raw.currency;
  }
  if (typeof raw.notes === "string") pricing.notes = raw.notes;
  return pricing;
}

function parseAuthHints(raw: unknown): AuthHint[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new AgentReachError("INVALID_OFFER", "authHints must be an array");
  }
  return raw.map((item, i) => {
    if (!isPlainObject(item)) {
      throw new AgentReachError("INVALID_OFFER", `authHints[${i}] must be an object`);
    }
    const type = item.type;
    if (typeof type !== "string" || type.trim().length === 0) {
      throw new AgentReachError("INVALID_OFFER", `authHints[${i}].type is required`);
    }
    const hint: AuthHint = { type };
    if (typeof item.details === "string") hint.details = item.details;
    return hint;
  });
}

function parseStringArray(raw: unknown, field: string, minItems = 0): string[] {
  if (!Array.isArray(raw)) {
    throw new AgentReachError("INVALID_OFFER", `${field} must be an array of strings`);
  }
  if (raw.length < minItems) {
    throw new AgentReachError("INVALID_OFFER", `${field} requires at least ${minItems} item(s)`);
  }
  return raw.map((item, i) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new AgentReachError("INVALID_OFFER", `${field}[${i}] must be a non-empty string`);
    }
    return item;
  });
}

/** Validate and normalize an offer card (or publish input) into OfferCard shape fields. */
export function validateOfferInput(input: unknown): PublishOfferInput {
  if (!isPlainObject(input)) {
    throw new AgentReachError("INVALID_OFFER", "Offer must be a JSON object");
  }

  if (input.schemaVersion !== undefined && input.schemaVersion !== OFFER_SCHEMA) {
    throw new AgentReachError(
      "INVALID_OFFER",
      `Unsupported schemaVersion (expected ${OFFER_SCHEMA})`,
    );
  }

  const name = requireString(input, "name", 200);
  const publisherAgentId = requireString(input, "publisherAgentId", 128);
  const capabilities = parseStringArray(input.capabilities, "capabilities", 1);

  const result: PublishOfferInput = {
    name,
    publisherAgentId,
    capabilities,
  };

  if (typeof input.id === "string" && input.id.trim().length > 0) {
    if (input.id.length > 128) {
      throw new AgentReachError("INVALID_OFFER", "id exceeds max length 128");
    }
    result.id = input.id;
  }

  const description = optionalString(input, "description");
  if (description !== undefined) result.description = description;

  const endpoints = parseEndpoints(input.endpoints);
  if (endpoints !== undefined) result.endpoints = endpoints;

  const pricing = parsePricing(input.pricing);
  if (pricing !== undefined) result.pricing = pricing;

  const authHints = parseAuthHints(input.authHints);
  if (authHints !== undefined) result.authHints = authHints;

  if (input.tags !== undefined) {
    result.tags = parseStringArray(input.tags, "tags");
  }

  const publishedAt = optionalString(input, "publishedAt", 64);
  if (publishedAt !== undefined) result.publishedAt = publishedAt;

  if (input.metadata !== undefined) {
    if (!isPlainObject(input.metadata)) {
      throw new AgentReachError("INVALID_OFFER", "metadata must be an object");
    }
    result.metadata = input.metadata;
  }

  if (input.schemaVersion === OFFER_SCHEMA) {
    result.schemaVersion = OFFER_SCHEMA;
  }

  return result;
}

export function assertOfferCard(offer: OfferCard): void {
  validateOfferInput(offer);
  if (offer.schemaVersion !== OFFER_SCHEMA) {
    throw new AgentReachError("INVALID_OFFER", `schemaVersion must be ${OFFER_SCHEMA}`);
  }
  if (!offer.id) {
    throw new AgentReachError("INVALID_OFFER", "id is required on OfferCard");
  }
}
