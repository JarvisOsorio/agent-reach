# Agent Reach

**DISCOVER · PITCH · DEAL · RECEIPT**

A2A discovery + pitch protocol for **agents that market to agents** — offer cards, intent discover, deal receipts.

Agents that sell capabilities to other agents need machine-readable deal flow, not a human ad network. Publish versioned offer cards, discover matches by intent, pitch terms, and accept/reject with a SHA-256 conversion receipt — all local-first on SQLite. Not an “AI agency” dashboard, SEO tool, or SaaS directory in v0.1.

Local-first. TypeScript · Node ≥22 · pnpm · SQLite (`node:sqlite`) · Apache-2.0.

[![CI](https://github.com/JarvisOsorio/agent-reach/actions/workflows/ci.yml/badge.svg)](https://github.com/JarvisOsorio/agent-reach/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/JarvisOsorio/agent-reach?include_prereleases)](https://github.com/JarvisOsorio/agent-reach/releases)

## Install

**v0.1 path:** clone this repo (not published to npm yet).

```bash
git clone https://github.com/JarvisOsorio/agent-reach.git
cd agent-reach
pnpm install
pnpm build
pnpm test
pnpm example
```

CLI binary after build: `pnpm --filter @agent-reach/cli exec agent-reach` (or `node packages/cli/dist/index.js`).

## Minimal API

```ts
import { AgentReach, verifyReceipt } from "@agent-reach/core";

const reach = new AgentReach({ dbPath: ".agent-reach/store.sqlite" });

const offer = reach.publish({
  name: "Transcript Scrubber",
  publisherAgentId: "seller-bot",
  capabilities: ["transcript-scrub"],
  endpoints: [{ type: "mcp", url: "mcp://scrub.local" }],
  pricing: { model: "per_call", amount: 0.01, currency: "USD" },
});

const hits = reach.discover({
  query: "scrub secrets from transcripts",
  capabilities: ["transcript-scrub"],
});

const pitch = reach.pitch({
  offerId: hits[0]!.offer.id,
  fromAgentId: "buyer-bot",
  intent: "scrub CI logs",
});

const { receipt } = reach.accept(pitch.id);
console.log(verifyReceipt(receipt)); // true
reach.close();
```

Primary exports from `@agent-reach/core`: `AgentReach`, `verifyReceipt` (plus `buildReceipt`, `discoverOffers`, `validateOfferInput`, `ReachStore`, schema constants, and types). Core verbs: `publish` → `discover` → `pitch` → `accept` / `reject`.

## CLI

| Command                                                         | Purpose                               |
| --------------------------------------------------------------- | ------------------------------------- |
| `agent-reach init`                                              | Create `.agent-reach/` + SQLite store |
| `agent-reach publish <offer.json>`                              | Validate + publish offer card         |
| `agent-reach discover <query>`                                  | Rank/filter offers by intent          |
| `agent-reach pitch --offer <id> --from <agent> --intent <text>` | Create pitch                          |
| `agent-reach accept <pitchId>`                                  | Accept → conversion receipt           |
| `agent-reach reject <pitchId>`                                  | Reject → conversion receipt           |
| `agent-reach list [offers\|pitches\|receipts]`                  | List store contents                   |
| `agent-reach inspect <id>`                                      | Inspect offer, pitch, or receipt      |
| `agent-reach export <path>` / `import <path>`                   | Portable JSON bundle                  |
| `agent-reach doctor`                                            | Honest readiness (agents-only flags)  |

Common flags: `--json`, `--db <path>`, discover `--capability` / `--tag` / `--pricing` / `--limit`, accept/reject `--reason`, import `--replace`.

### Exit codes

| Code | Meaning                                    |
| ---- | ------------------------------------------ |
| 0    | Success                                    |
| 1    | Not found / already decided                |
| 2    | Invalid input / schema / integrity failure |
| 3    | Infrastructure / storage error             |

## Example

`examples/seller-buyer-flow` runs the full path (accept + reject) with receipt integrity checks:

```bash
pnpm example
```

## Honesty / non-goals

| This product                                                                 | Not this product                             |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| Offer cards for **agents** (capabilities, MCP/HTTP endpoints, pricing hints) | Human creative studio / social posting / SEO |
| Local discover by intent tokens + capability filters                         | Cloud marketplace SaaS directory (v0.1)      |
| Structured pitch → accept/reject + hashed conversion receipt                 | Autonomous “full agency” monolith            |
| Hermetic SQLite + JSON export/import                                         | LLM wrapper / agent framework / tracing UI   |

What v0.1 does **not** include: human ad creatives, ranking ML, payments settlement, multi-tenant cloud directory, Langfuse/tracing, npm publish, merging Replay Lab or Outcome.

### Sibling boundaries (do not merge)

| Tool                                                                     | Job                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------- |
| **agent-reach** (this repo)                                              | Agent-to-agent discovery & deal flow               |
| **[agent-replay-lab](https://github.com/JarvisOsorio/agent-replay-lab)** | VCR for **tool I/O** (record / mock-replay / diff) |
| **[agent-outcome](https://github.com/JarvisOsorio/agent-outcome)**       | Postcondition verification of **side effects**     |
| **mcp-pordego** / **agentscrub**                                         | MCP gateway / transcript scrub                     |

## Offer card (v1)

Schema id: `agent-reach.offer.v1`. Required: `id` (auto if omitted), `name`, `capabilities[]`, `publisherAgentId`. Optional: `description`, `endpoints[]`, `pricing`, `authHints[]`, `tags[]`, `metadata`.

JSON Schema: `packages/core/schemas/offer.v1.json`.

## Conversion receipts

On accept/reject, agent-reach writes a `agent-reach.receipt.v1` document with `integrityHash` = SHA-256 of the canonical JSON body (hash field excluded). Tampering the decision/terms without rehashing fails `verifyReceipt`.

## License

Apache-2.0 © Jarvis Nelson Osorio Ramos / JarvisOsorio
