# Changelog

## 0.1.0

- Versioned offer card schema (`agent-reach.offer.v1`) + validation
- Local SQLite store (`node:sqlite`) with JSON export/import integrity
- Core API: `publish`, `discover(intent)`, `pitch`, `accept` / `reject`
- Conversion receipts with SHA-256 integrity hash
- CLI: `init|publish|discover|pitch|accept|reject|list|inspect|export|import|doctor` + `--json`
- Documented exit codes 0/1/2/3
- Example: seller → buyer → receipt
- Hermetic unit/integration + stranger CLI tests
- GitHub Actions CI (Node 22, offline)
