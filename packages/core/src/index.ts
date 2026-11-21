export {
  OFFER_SCHEMA,
  PITCH_SCHEMA,
  RECEIPT_SCHEMA,
  EXPORT_SCHEMA,
  AgentReachError,
  type OfferCard,
  type PublishOfferInput,
  type OfferEndpoint,
  type OfferPricing,
  type AuthHint,
  type Pitch,
  type CreatePitchInput,
  type ConversionReceipt,
  type DiscoverIntent,
  type DiscoverHit,
  type ExportBundle,
  type PitchStatus,
  type ReceiptDecision,
  type PricingModel,
  type EndpointType,
} from "./types.js";

export {
  canonicalJson,
  sha256Hex,
  hashReceiptBody,
  hashExportBody,
  verifyIntegrityHash,
} from "./hash.js";
export { validateOfferInput, assertOfferCard } from "./validate.js";
export { discoverOffers } from "./discover.js";
export { buildReceipt, verifyReceipt, assertReceiptIntegrity } from "./receipt.js";
export { ReachStore, type ReachStoreOptions } from "./store.js";
export { AgentReach, type AgentReachOptions } from "./reach.js";
export { resolveStoreDir, resolveDbPath, DEFAULT_DIR, DEFAULT_DB } from "./paths.js";
