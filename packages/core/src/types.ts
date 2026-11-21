/** Versioned schema ids for agent-reach artifacts. */
export const OFFER_SCHEMA = "agent-reach.offer.v1" as const;
export const PITCH_SCHEMA = "agent-reach.pitch.v1" as const;
export const RECEIPT_SCHEMA = "agent-reach.receipt.v1" as const;
export const EXPORT_SCHEMA = "agent-reach.export.v1" as const;

export type OfferSchemaVersion = typeof OFFER_SCHEMA;
export type PitchSchemaVersion = typeof PITCH_SCHEMA;
export type ReceiptSchemaVersion = typeof RECEIPT_SCHEMA;
export type ExportSchemaVersion = typeof EXPORT_SCHEMA;

export type EndpointType = "http" | "mcp" | "a2a" | "other";
export type PricingModel = "free" | "per_call" | "subscription" | "negotiable";
export type PitchStatus = "pending" | "accepted" | "rejected";
export type ReceiptDecision = "accepted" | "rejected";

export interface OfferEndpoint {
  type: EndpointType;
  url: string;
  name?: string;
  notes?: string;
}

export interface OfferPricing {
  model: PricingModel;
  amount?: number;
  currency?: string;
  notes?: string;
}

export interface AuthHint {
  type: string;
  details?: string;
}

/** Machine-readable offer card published by a seller agent. */
export interface OfferCard {
  schemaVersion: OfferSchemaVersion;
  id: string;
  name: string;
  description?: string;
  capabilities: string[];
  endpoints?: OfferEndpoint[];
  pricing?: OfferPricing;
  authHints?: AuthHint[];
  tags?: string[];
  publisherAgentId: string;
  publishedAt?: string;
  metadata?: Record<string, unknown>;
}

/** Input for publish — id/publishedAt may be generated. */
export type PublishOfferInput = Omit<OfferCard, "schemaVersion" | "publishedAt" | "id"> & {
  schemaVersion?: OfferSchemaVersion;
  publishedAt?: string;
  id?: string;
};

export interface Pitch {
  schemaVersion: PitchSchemaVersion;
  id: string;
  offerId: string;
  fromAgentId: string;
  toAgentId: string;
  intent: string;
  message?: string;
  proposedTerms?: Record<string, unknown>;
  status: PitchStatus;
  createdAt: string;
  decidedAt?: string;
  reason?: string;
}

export type CreatePitchInput = {
  offerId: string;
  fromAgentId: string;
  intent: string;
  message?: string;
  proposedTerms?: Record<string, unknown>;
  id?: string;
};

export interface ConversionReceipt {
  schemaVersion: ReceiptSchemaVersion;
  id: string;
  pitchId: string;
  offerId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  decision: ReceiptDecision;
  terms?: Record<string, unknown>;
  reason?: string;
  createdAt: string;
  /** SHA-256 hex of canonical payload excluding this field. */
  integrityHash: string;
}

export interface DiscoverIntent {
  /** Free-text intent from the buyer agent. */
  query: string;
  /** Required capability tokens (AND). */
  capabilities?: string[];
  /** Optional tags (OR). */
  tags?: string[];
  /** Filter by pricing model. */
  pricingModel?: PricingModel;
  /** Max results (default 20). */
  limit?: number;
}

export interface DiscoverHit {
  offer: OfferCard;
  score: number;
  matchedCapabilities: string[];
  matchedTags: string[];
}

export interface ExportBundle {
  schemaVersion: ExportSchemaVersion;
  exportedAt: string;
  offers: OfferCard[];
  pitches: Pitch[];
  receipts: ConversionReceipt[];
  integrityHash: string;
}

export class AgentReachError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode = 2) {
    super(message);
    this.name = "AgentReachError";
    this.code = code;
    this.exitCode = exitCode;
  }
}
