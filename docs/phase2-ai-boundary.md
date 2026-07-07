# Phase 2 AI Boundary

Status: Stage 6 entry contract.

## Scope

Phase 2 starts with a read-only inbox slice:

- scan `<vault>/inbox/downloads/**`
- show placeholder classification
- allow user accept/reject decisions
- do not write, move, rename, stage, commit, or delete files from AI output

## Adapter Contract

Adapters are suggestion-only. `src/lib/aiAdapters.ts` declares the initial providers:

- `claude-code`: local subprocess adapter, streaming capable
- `anthropic`: API fallback adapter, streaming capable

Both expose `canWriteFiles: false`. Any future apply step must route through the existing writer boundary and user confirmation.

## Credentials

- Claude Code CLI uses the user's existing CLI session.
- Anthropic API fallback must read credentials from a dedicated secret store before implementation.
- Credentials must never be written to vault files, logs, localStorage, or test fixtures.

## Logging

Logs may include:

- adapter kind
- failure taxonomy
- document relative paths
- redacted vault path from `redactVaultPath`

Logs must not include:

- full vault path
- full document body
- API keys
- raw email contents
- unredacted subprocess prompts

## Failure Taxonomy

`classifyAiFailure` maps adapter failures to:

- `credential_missing`
- `cli_missing`
- `network`
- `model`
- `permission`
- `unknown`

Only `network` and selected `model` failures are retryable by default.

## External Writer Rule

If a registered vault has `externalWriter` / `external_writer`, Maru blocks direct writes:

- save
- create document
- snapshot
- frontmatter patch
- git commit
- future AI apply

Rust command handlers enforce the same rule so UI bypasses cannot write directly.
