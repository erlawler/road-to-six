# Connect to the Road to Six MCP server

**Status, November 17, 2026:** the public endpoint is implemented and tested locally. It is **not live** until a release that includes it is deployed and read back. Until then the address below returns the site's normal not-found response. See the [release evidence note](mcp-release-evidence-2026-11-17.md) for what has and has not been verified.

Road to Six exposes its deterministic evidence to AI assistants through the [Model Context Protocol](https://modelcontextprotocol.io/). It is an unofficial fan project for educational analysis. It is not affiliated with the Dallas Cowboys or the NFL, and nothing it returns is betting, wagering, or fantasy start or sit advice.

## The 60-second version

| Setting | Value |
|---|---|
| Server address | `https://road-to-six-erl.erlrickylre.chatgpt.site/api/mcp` |
| Transport | Streamable HTTP |
| Sign-in | None. The endpoint is anonymous and read-only. |
| Protocol | Revision 2026-07-28, plus the handshake revisions 2025-11-25, 2025-06-18, 2025-03-26 and 2024-11-05 |
| Rate limit | 120 tool calls per five minutes, shared by all callers. A limited call returns HTTP 429 with `Retry-After`. |

Add that address as a remote MCP server in your client. No key, header, or account is needed.

## Client steps

Client menus change often. Each line names its source and was checked on November 17, 2026. If a step no longer matches, follow the linked page.

- **Claude Code:** run the command below. Source: [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp).

  ```bash
  claude mcp add --transport http road-to-six https://road-to-six-erl.erlrickylre.chatgpt.site/api/mcp
  ```

- **Claude apps:** Customize, then Connectors, then Add, then Add custom connector, and paste the address. Claude connects from Anthropic's cloud, so the server must be publicly reachable on HTTPS. Source: [Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- **ChatGPT:** Plugins, then the plus button, then Add custom MCP server, and choose no authentication. OpenAI lists this for Business, Enterprise and Edu workspaces on the web. Source: [Connecting custom MCP servers in ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).
- **VS Code:** add the entry below to `.vscode/mcp.json`. Source: [MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

  ```json
  { "servers": { "road-to-six": { "type": "http", "url": "https://road-to-six-erl.erlrickylre.chatgpt.site/api/mcp" } } }
  ```

- **Cursor:** add the entry below to `mcp.json`. Source: [Cursor MCP documentation](https://cursor.com/docs/mcp).

  ```json
  { "mcpServers": { "road-to-six": { "url": "https://road-to-six-erl.erlrickylre.chatgpt.site/api/mcp" } } }
  ```

None of these client flows has been run against this server yet. The server has been exercised with the official MCP client SDKs and conformance suite, which is recorded in the release evidence note.

## What you can ask

| Tool | Use it for | Arguments |
|---|---|---|
| `get_current_matchup` | Which game is current: opponent, kickoff, venue, record. Reports a bye or an unavailable state. | None |
| `get_player_usage` | One team's historical production and usage over its last three completed games | `team`: `DAL` or `opponent` |
| `compare_players` | Recent production leaders on both teams, side by side | None |
| `get_source_health` | How current and trustworthy the data is, with per-source checks | None |
| `get_game_day_context` | National Weather Service forecast and alerts for the reviewed venue | None |
| `get_football_forecast` | Football-only win probability, its drivers, and optional what-if controls | Optional `quarterback`, `lamb`, `pickens`, `williams`, `defense`, `opponentStar`, each 0 to 100 |

In hosts that support [MCP Apps](https://github.com/modelcontextprotocol/ext-apps), `get_football_forecast` also renders an interactive card with what-if sliders. Other hosts receive the same result as text.

## How to read a result

Every result carries an `evidence` block. An assistant should check it before repeating a value.

| Field | Meaning |
|---|---|
| `status` | `ok`, `degraded`, or `unavailable` |
| `stale` | `true` when the football snapshot is past its seven-day review window or the latest refresh did not succeed |
| `reason` | Why a result is not fully usable. `null` when `status` is `ok`. |
| `observedAt` | When the server read its saved state |
| `football.dataVersion`, `football.verifiedAt` | Which snapshot the values come from and when it was verified |
| `sources` | Name, address and license of each source |
| `notice` | The educational-use and non-affiliation statement |

When a result is `unavailable`, the server has declined to substitute other data. The right answer is to say so.

## What this server will not do

- It returns no betting-market prices. The forecast tool is football-only by design, because the market data license covers display inside the site, not redistribution as a feed. See [NOTICE.md](../NOTICE.md).
- It calls no language model and no paid service. Your assistant does the explaining.
- It makes no picks and gives no start or sit advice. Player figures are historical production, not projections.
- It accepts no addresses, coordinates, seasons, or game identifiers from the caller.

## Check it from a terminal

```bash
curl -s https://road-to-six-erl.erlrickylre.chatgpt.site/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: server/discover' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
```

A live server answers with its supported versions, capabilities and name. Aggregate usage counts are public at `/api/mcp/usage`. They count calls, not people, and store no address, user agent, or argument.

## Run it locally

```bash
npm run build
node --import ./tests/setup-worker-runtime.mjs scripts/mcp-local-server.mjs --port 8787
```

The local server uses the bundled snapshot at a fixed clock, so it is fixture evidence only. Point any client at `http://127.0.0.1:8787/api/mcp`.
