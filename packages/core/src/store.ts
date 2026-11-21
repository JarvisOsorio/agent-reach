import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AgentReachError,
  EXPORT_SCHEMA,
  type ConversionReceipt,
  type ExportBundle,
  type OfferCard,
  type Pitch,
} from "./types.js";
import { hashExportBody, verifyIntegrityHash } from "./hash.js";
import { assertReceiptIntegrity } from "./receipt.js";

export interface ReachStoreOptions {
  /** Path to SQLite file. Use ":memory:" for tests. */
  dbPath: string;
}

/**
 * Local-first SQLite store for offers, pitches, and conversion receipts.
 * Uses Node's built-in `node:sqlite` (no native addon).
 */
export class ReachStore {
  readonly dbPath: string;
  private readonly db: DatabaseSync;

  constructor(opts: ReachStoreOptions) {
    this.dbPath = opts.dbPath;
    try {
      if (opts.dbPath !== ":memory:") {
        mkdirSync(dirname(opts.dbPath), { recursive: true });
      }
      this.db = new DatabaseSync(opts.dbPath);
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA foreign_keys = ON;");
      this.migrate();
    } catch (err) {
      throw new AgentReachError(
        "STORAGE_ERROR",
        `Failed to open store at ${opts.dbPath}: ${err instanceof Error ? err.message : String(err)}`,
        3,
      );
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        publisher_agent_id TEXT NOT NULL,
        published_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pitches (
        id TEXT PRIMARY KEY,
        offer_id TEXT NOT NULL,
        from_agent_id TEXT NOT NULL,
        to_agent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY,
        pitch_id TEXT NOT NULL UNIQUE,
        offer_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_offers_publisher ON offers(publisher_agent_id);
      CREATE INDEX IF NOT EXISTS idx_pitches_offer ON pitches(offer_id);
      CREATE INDEX IF NOT EXISTS idx_pitches_status ON pitches(status);
    `);
  }

  close(): void {
    this.db.close();
  }

  putOffer(offer: OfferCard): void {
    this.db
      .prepare(
        `INSERT INTO offers (id, json, publisher_agent_id, published_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           json = excluded.json,
           publisher_agent_id = excluded.publisher_agent_id,
           published_at = excluded.published_at`,
      )
      .run(offer.id, JSON.stringify(offer), offer.publisherAgentId, offer.publishedAt ?? "");
  }

  getOffer(id: string): OfferCard | undefined {
    const row = this.db.prepare(`SELECT json FROM offers WHERE id = ?`).get(id) as
      { json: string } | undefined;
    return row ? (JSON.parse(row.json) as OfferCard) : undefined;
  }

  listOffers(): OfferCard[] {
    const rows = this.db
      .prepare(`SELECT json FROM offers ORDER BY published_at DESC, id ASC`)
      .all() as {
      json: string;
    }[];
    return rows.map((r) => JSON.parse(r.json) as OfferCard);
  }

  putPitch(pitch: Pitch): void {
    this.db
      .prepare(
        `INSERT INTO pitches (id, offer_id, from_agent_id, to_agent_id, status, json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           offer_id = excluded.offer_id,
           from_agent_id = excluded.from_agent_id,
           to_agent_id = excluded.to_agent_id,
           status = excluded.status,
           json = excluded.json,
           created_at = excluded.created_at`,
      )
      .run(
        pitch.id,
        pitch.offerId,
        pitch.fromAgentId,
        pitch.toAgentId,
        pitch.status,
        JSON.stringify(pitch),
        pitch.createdAt,
      );
  }

  getPitch(id: string): Pitch | undefined {
    const row = this.db.prepare(`SELECT json FROM pitches WHERE id = ?`).get(id) as
      { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Pitch) : undefined;
  }

  listPitches(filter?: { status?: string; offerId?: string }): Pitch[] {
    let sql = `SELECT json FROM pitches WHERE 1=1`;
    const params: string[] = [];
    if (filter?.status) {
      sql += ` AND status = ?`;
      params.push(filter.status);
    }
    if (filter?.offerId) {
      sql += ` AND offer_id = ?`;
      params.push(filter.offerId);
    }
    sql += ` ORDER BY created_at DESC, id ASC`;
    const rows = this.db.prepare(sql).all(...params) as { json: string }[];
    return rows.map((r) => JSON.parse(r.json) as Pitch);
  }

  putReceipt(receipt: ConversionReceipt): void {
    assertReceiptIntegrity(receipt);
    this.db
      .prepare(
        `INSERT INTO receipts (id, pitch_id, offer_id, decision, json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           pitch_id = excluded.pitch_id,
           offer_id = excluded.offer_id,
           decision = excluded.decision,
           json = excluded.json,
           created_at = excluded.created_at`,
      )
      .run(
        receipt.id,
        receipt.pitchId,
        receipt.offerId,
        receipt.decision,
        JSON.stringify(receipt),
        receipt.createdAt,
      );
  }

  getReceipt(id: string): ConversionReceipt | undefined {
    const row = this.db.prepare(`SELECT json FROM receipts WHERE id = ?`).get(id) as
      { json: string } | undefined;
    return row ? (JSON.parse(row.json) as ConversionReceipt) : undefined;
  }

  getReceiptByPitch(pitchId: string): ConversionReceipt | undefined {
    const row = this.db.prepare(`SELECT json FROM receipts WHERE pitch_id = ?`).get(pitchId) as
      { json: string } | undefined;
    return row ? (JSON.parse(row.json) as ConversionReceipt) : undefined;
  }

  listReceipts(): ConversionReceipt[] {
    const rows = this.db
      .prepare(`SELECT json FROM receipts ORDER BY created_at DESC, id ASC`)
      .all() as { json: string }[];
    return rows.map((r) => JSON.parse(r.json) as ConversionReceipt);
  }

  counts(): { offers: number; pitches: number; receipts: number } {
    const offers = (this.db.prepare(`SELECT COUNT(*) AS c FROM offers`).get() as { c: number }).c;
    const pitches = (this.db.prepare(`SELECT COUNT(*) AS c FROM pitches`).get() as { c: number }).c;
    const receipts = (this.db.prepare(`SELECT COUNT(*) AS c FROM receipts`).get() as { c: number })
      .c;
    return { offers, pitches, receipts };
  }

  exportBundle(): ExportBundle {
    const body = {
      schemaVersion: EXPORT_SCHEMA,
      exportedAt: new Date().toISOString(),
      offers: this.listOffers(),
      pitches: this.listPitches(),
      receipts: this.listReceipts(),
    };
    return { ...body, integrityHash: hashExportBody(body) };
  }

  importBundle(
    bundle: ExportBundle,
    opts?: { replace?: boolean },
  ): { imported: ReturnType<ReachStore["counts"]> } {
    if (bundle.schemaVersion !== EXPORT_SCHEMA) {
      throw new AgentReachError(
        "INVALID_EXPORT",
        `Unsupported export schemaVersion (expected ${EXPORT_SCHEMA})`,
      );
    }
    const actual = hashExportBody(bundle);
    if (!verifyIntegrityHash(bundle.integrityHash, actual)) {
      throw new AgentReachError(
        "EXPORT_INTEGRITY_FAILED",
        "Export bundle integrity hash mismatch",
        2,
      );
    }
    for (const receipt of bundle.receipts) {
      assertReceiptIntegrity(receipt);
    }

    if (opts?.replace) {
      this.db.exec(`DELETE FROM receipts; DELETE FROM pitches; DELETE FROM offers;`);
    }

    for (const offer of bundle.offers) this.putOffer(offer);
    for (const pitch of bundle.pitches) this.putPitch(pitch);
    for (const receipt of bundle.receipts) this.putReceipt(receipt);

    return { imported: this.counts() };
  }
}
