import { randomUUID } from "node:crypto";
import { discoverOffers } from "./discover.js";
import { buildReceipt } from "./receipt.js";
import { ReachStore } from "./store.js";
import {
  AgentReachError,
  OFFER_SCHEMA,
  PITCH_SCHEMA,
  type ConversionReceipt,
  type CreatePitchInput,
  type DiscoverHit,
  type DiscoverIntent,
  type OfferCard,
  type Pitch,
  type PublishOfferInput,
} from "./types.js";
import { validateOfferInput } from "./validate.js";

export interface AgentReachOptions {
  dbPath: string;
}

/**
 * Core API: publish → discover → pitch → accept/reject (+ receipts).
 */
export class AgentReach {
  readonly store: ReachStore;

  constructor(opts: AgentReachOptions) {
    this.store = new ReachStore({ dbPath: opts.dbPath });
  }

  close(): void {
    this.store.close();
  }

  publish(input: PublishOfferInput | unknown): OfferCard {
    const validated = validateOfferInput(input);
    const now = new Date().toISOString();
    const offer: OfferCard = {
      schemaVersion: OFFER_SCHEMA,
      id: validated.id ?? randomUUID(),
      name: validated.name,
      capabilities: validated.capabilities,
      publisherAgentId: validated.publisherAgentId,
      publishedAt: validated.publishedAt ?? now,
      ...(validated.description !== undefined ? { description: validated.description } : {}),
      ...(validated.endpoints !== undefined ? { endpoints: validated.endpoints } : {}),
      ...(validated.pricing !== undefined ? { pricing: validated.pricing } : {}),
      ...(validated.authHints !== undefined ? { authHints: validated.authHints } : {}),
      ...(validated.tags !== undefined ? { tags: validated.tags } : {}),
      ...(validated.metadata !== undefined ? { metadata: validated.metadata } : {}),
    };
    this.store.putOffer(offer);
    return offer;
  }

  discover(intent: DiscoverIntent): DiscoverHit[] {
    if (!intent || typeof intent.query !== "string") {
      throw new AgentReachError("INVALID_INTENT", "discover requires intent.query string");
    }
    return discoverOffers(this.store.listOffers(), intent);
  }

  pitch(input: CreatePitchInput): Pitch {
    if (!input.offerId?.trim()) {
      throw new AgentReachError("INVALID_PITCH", "offerId is required");
    }
    if (!input.fromAgentId?.trim()) {
      throw new AgentReachError("INVALID_PITCH", "fromAgentId is required");
    }
    if (!input.intent?.trim()) {
      throw new AgentReachError("INVALID_PITCH", "intent is required");
    }

    const offer = this.store.getOffer(input.offerId);
    if (!offer) {
      throw new AgentReachError("OFFER_NOT_FOUND", `Offer not found: ${input.offerId}`, 1);
    }

    const pitch: Pitch = {
      schemaVersion: PITCH_SCHEMA,
      id: input.id ?? randomUUID(),
      offerId: offer.id,
      fromAgentId: input.fromAgentId,
      toAgentId: offer.publisherAgentId,
      intent: input.intent,
      status: "pending",
      createdAt: new Date().toISOString(),
      ...(input.message !== undefined ? { message: input.message } : {}),
      ...(input.proposedTerms !== undefined ? { proposedTerms: input.proposedTerms } : {}),
    };
    this.store.putPitch(pitch);
    return pitch;
  }

  accept(
    pitchId: string,
    opts?: { terms?: Record<string, unknown>; reason?: string },
  ): { pitch: Pitch; receipt: ConversionReceipt } {
    return this.decide(pitchId, "accepted", opts);
  }

  reject(
    pitchId: string,
    opts?: { terms?: Record<string, unknown>; reason?: string },
  ): { pitch: Pitch; receipt: ConversionReceipt } {
    return this.decide(pitchId, "rejected", opts);
  }

  private decide(
    pitchId: string,
    decision: "accepted" | "rejected",
    opts?: { terms?: Record<string, unknown>; reason?: string },
  ): { pitch: Pitch; receipt: ConversionReceipt } {
    const pitch = this.store.getPitch(pitchId);
    if (!pitch) {
      throw new AgentReachError("PITCH_NOT_FOUND", `Pitch not found: ${pitchId}`, 1);
    }
    if (pitch.status !== "pending") {
      throw new AgentReachError(
        "PITCH_ALREADY_DECIDED",
        `Pitch ${pitchId} already ${pitch.status}`,
        1,
      );
    }

    const decidedAt = new Date().toISOString();
    const updated: Pitch = {
      ...pitch,
      status: decision,
      decidedAt,
      ...(opts?.reason !== undefined ? { reason: opts.reason } : {}),
    };
    this.store.putPitch(updated);

    const receipt = buildReceipt({
      pitch: updated,
      decision,
      terms: opts?.terms ?? updated.proposedTerms,
      reason: opts?.reason,
      createdAt: decidedAt,
    });
    this.store.putReceipt(receipt);
    return { pitch: updated, receipt };
  }

  getOffer(id: string): OfferCard | undefined {
    return this.store.getOffer(id);
  }

  getPitch(id: string): Pitch | undefined {
    return this.store.getPitch(id);
  }

  getReceipt(id: string): ConversionReceipt | undefined {
    return this.store.getReceipt(id);
  }

  list(kind: "offers" | "pitches" | "receipts" = "offers"): unknown[] {
    switch (kind) {
      case "offers":
        return this.store.listOffers();
      case "pitches":
        return this.store.listPitches();
      case "receipts":
        return this.store.listReceipts();
      default:
        throw new AgentReachError("INVALID_LIST", `Unknown list kind: ${kind as string}`);
    }
  }
}
