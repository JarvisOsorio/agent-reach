export const HELP = `agent-reach — A2A discovery + pitch protocol (agents marketing to agents)

Usage:
  agent-reach <command> [options]

Commands:
  init                         Create .agent-reach/ + SQLite store
  publish <offer.json>         Validate + publish an offer card
  discover <query>             Rank/filter offers by intent
  pitch --offer <id> --from <agent> --intent <text>
  accept <pitchId>             Accept pitch → conversion receipt
  reject <pitchId>             Reject pitch → conversion receipt
  list [offers|pitches|receipts]
  inspect <id>                 Inspect offer, pitch, or receipt by id
  export <path>                Write integrity-hashed JSON export
  import <path>                Import export bundle (integrity-checked)
  doctor                       Honest readiness check

Common flags:
  --json                       Machine-readable stdout
  --db <path>                  Override SQLite path
  --capability <cap>           discover: required capability (repeatable via comma)
  --tag <tag>                  discover: tag filter
  --pricing <model>            discover: free|per_call|subscription|negotiable
  --limit <n>                  discover: max hits (default 20)
  --reason <text>              accept/reject reason
  --replace                    import: wipe store before import
  --help                       Show this help

Exit codes:
  0  success
  1  not found / already decided
  2  invalid input / schema / integrity failure
  3  infrastructure / storage error

Not a human ad network. Not an AI agency dashboard.
Sibling boundary: agent-replay-lab (tool I/O VCR) · agent-outcome (postconditions).
`;
