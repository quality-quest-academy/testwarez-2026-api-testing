# Optional browser exploration

## What

The project configures **Playwright MCP 0.0.84** for later interactive exploration
with an agent in OpenCode V2. It uses installed Microsoft Edge and an isolated
in-memory profile. Automated regression independently uses Playwright Test and
downloaded Chromium; no exploratory report or coverage is implied by MCP setup.

## Why

Snapshots, console and network observations help investigate behavior without
expanding the single browser regression journey. Exploratory findings must be
recorded separately from deterministic CI assertions.

## How to run

Prerequisites: Node/npm, [OpenCode V2](https://opencode.ai/v2/docs/mcp-servers),
Microsoft Edge and an explicitly approved disposable local stack.

1. Follow [demo isolation](demo.md#disposable-exploration) with free ports.
2. From the repository, run `opencode mcp list` or open `/mcps`. Confirm
   `playwright` is connected; reconnect after configuration changes. First startup
   can download the pinned npm package. Jira MCP credentials are unrelated and
   not needed for browser tooling or the demo.
3. Ask the agent to explore only the approved loopback URL, inspect accessibility
   snapshots and console/network evidence, and distinguish observation from assertion.
4. Close the MCP browser. This discards browser state, **not backend databases**.
   Output goes to ignored `test-results/mcp/`; save needed observations under ignored
   `exploration-reports/` before regression commands replace test output.

The existing configuration uses `--isolated`, `--browser msedge`, disables WebMCP
and allows only loopback HTTP origins. It attaches no personal profile, extensions
or remote-debugging session. These are **guardrails, not a security boundary**:
redirects and code evaluation still require disciplined permissions.

Never access `.env`, tokens, local secret files, authenticated tabs, external sites
or developer data through browser tools. Do not loosen file/origin restrictions.
The default mock FX URL fits this policy; live NBP probing is deliberately separate.
Earlier setup smoke established connectivity only, not a completed exploratory session.
