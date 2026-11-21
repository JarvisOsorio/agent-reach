import { randomUUID } from "node:crypto";
import { hashReceiptBody, verifyIntegrityHash } from "./hash.js";
import {
  AgentReachError,
  RECEIPT_SCHEMA,
  type ConversionReceipt,
  type Pitch,
  type ReceiptDecision,
} from "./types.js";

export function buildReceipt(opts: {
  pitch: Pitch;
  decision: ReceiptDecision;
  terms?: Record<string, unknown>;
  reason?: string;
  id?: string;
  createdAt?: string;
}): ConversionReceipt {
  const body = {
    schemaVersion: RECEIPT_SCHEMA,
    id: opts.id ?? randomUUID(),
    pitchId: opts.pitch.id,
    offerId: opts.pitch.offerId,
    buyerAgentId: opts.pitch.fromAgentId,
    sellerAgentId: opts.pitch.toAgentId,
    decision: opts.decision,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    ...(opts.terms ? { terms: opts.terms } : {}),
    ...(opts.reason ? { reason: opts.reason } : {}),
  };

  const integrityHash = hashReceiptBody(body);
  return { ...body, integrityHash };
}

export function verifyReceipt(receipt: ConversionReceipt): boolean {
  if (receipt.schemaVersion !== RECEIPT_SCHEMA) {
    return false;
  }
  if (typeof receipt.integrityHash !== "string" || receipt.integrityHash.length !== 64) {
    return false;
  }
  const actual = hashReceiptBody(receipt);
  return verifyIntegrityHash(receipt.integrityHash, actual);
}

export function assertReceiptIntegrity(receipt: ConversionReceipt): void {
  if (!verifyReceipt(receipt)) {
    throw new AgentReachError(
      "RECEIPT_INTEGRITY_FAILED",
      "Conversion receipt integrity hash mismatch (tampered or corrupt)",
      2,
    );
  }
}
