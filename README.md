# dsh-llm-chatgpt-web

[English](README.md) | [简体中文](README.zh-CN.md)

> [!IMPORTANT]
> **Strong dependency (required):** This plugin currently requires
> [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web).
>
> `dsh-llm-chatgpt-web` does not implement the ChatGPT Web browser transport itself. It is the adapter layer between DSH / DSH Desktop and `codex-chatgpt-web`. The upstream launcher must be installed and running before this plugin can use ChatGPT Web models.
>
> `codex-chatgpt-web` provides ChatGPT Web login, browser transport, model selection, Responses/SSE, Full harness, and MCP. If it is not running, this plugin cannot use ChatGPT Web models. This dependency is not hidden, embedded, optional, or merely recommended.

`dsh-llm-chatgpt-web` is an independent DSH LLM provider plugin. It connects [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) to `codex-chatgpt-web`, so the ChatGPT Web models returned by the bridge can appear as native DSH models while DSH remains the outer harness.

DSH remains responsible for session lifecycle, the local filesystem, shell access, tools, approvals, sandbox policy, and MCP/tool execution. ChatGPT Web acts only as the model and reasoning backend. The plugin does not upload a second tool runtime or let the upstream bridge bypass DSH permissions.

## Architecture

```text
DSH Desktop
    |
    v
dsh-llm-chatgpt-web
    |
    v
codex-chatgpt-web
    |
    v
ChatGPT Web
    |
    | Full harness tool call
    v
Codex Native2 / MCP
    |
    v
DSH tools
```

## Requirements

- DSH or DSH Desktop
- The `codex-chatgpt-web` launcher, installed, signed in, and running
- A ChatGPT account that exposes at least one supported ChatGPT Web route
- Browser-only mode for chat, or Full harness mode for DSH tool calls
- For Full harness: the Tunnel and **Codex Native2** setup documented by `codex-chatgpt-web`
- Node.js 20 or later for source builds

Tested versions:

- DSH Desktop 2.0.4
- DeepSeek Harness `0.1.2-alpha.1`
- codex-chatgpt-web 4.0.5

> [!WARNING]
> In the currently tested codex-chatgpt-web 4.0.5 runtime, `/v1/models` forwards the incoming native Codex Bearer authorization. A plain DSH request has no such credential, so the live endpoint returns HTTP 502 and this plugin correctly exposes zero models. Do not copy a ChatGPT OAuth token, cookie, or browser credential into DSH. A release cannot claim successful live model discovery until the upstream bridge exposes a DSH-safe account catalog route or equivalent supported authentication flow.

## Installation

Build the checkout first:

```powershell
npm install
npm run check
```

Open the terminal included with DSH Desktop and install the local directory:

```powershell
dsh plugin add "C:\path\to\dsh-llm-chatgpt-web"
```

After a GitHub release exists, DSH also supports a pinned GitHub source:

```powershell
dsh plugin add github:j955229/dsh-llm-chatgpt-web#v0.1.0
```

Restart DSH Desktop after adding, updating, or removing a plugin. To remove it:

```powershell
dsh plugin remove dsh-llm-chatgpt-web
```

## Models and account availability

The six entries in `src/models.ts` are known-model metadata only. They provide names, descriptions, input capabilities, and fixed reasoning effort. They are not an entitlement list.

The bridge's `GET /v1/models` response is authoritative. The plugin keeps only returned slugs beginning with `chatgpt-web/` that also match a known route. Native Codex models are filtered out, and unknown future `chatgpt-web/*` slugs are skipped with a warning instead of being registered blindly.

| Account | Routes normally returned by the bridge |
| --- | --- |
| Free / Go | `chatgpt-web/luna` |
| Plus | `chatgpt-web/light`, `chatgpt-web/medium`, `chatgpt-web/high` |
| Pro | `chatgpt-web/light`, `chatgpt-web/medium`, `chatgpt-web/high`, `chatgpt-web/extra-high`, `chatgpt-web/pro` |

Actual availability depends on the signed-in ChatGPT account and current `codex-chatgpt-web` behavior. This plugin cannot unlock, synthesize, or fall back to a route the account does not have.

`listModels()` refreshes the bridge catalog whenever DSH asks for the model list. Exact model resolution and turn startup recheck a short-lived catalog cache. Any failed refresh clears the catalog, logs the reason, and fails closed. If a DSH surface keeps an old picker snapshot after an account change, reopen the picker or restart DSH Desktop to force a new discovery cycle.

## Browser-only and Full harness

Browser-only mode can run a ChatGPT Web model, but ChatGPT cannot invoke local DSH tools.

In Full harness mode, ChatGPT Web can call tools advertised by the active DSH turn. DSH still executes every tool and remains authoritative for sandboxing and approvals. The upstream launcher must report `mode: full` from `/healthz`; otherwise any request containing DSH tools fails explicitly.

## Error handling

The plugin preserves upstream `codex-chatgpt-web` failure details where safe instead of collapsing every failure into a generic `STREAM_ERROR`.

- Non-2xx HTTP failures keep status, status text, the most specific upstream message, and an upstream error code when present.
- SSE `error` and `response.failed` events preserve nested failure messages and codes.
- Malformed SSE reports local parsing context plus a safely truncated raw event.
- Abort requests keep `AbortError` semantics.
- Error bodies and events are bounded and redact authorization headers, Bearer values, API keys, cookies, tunnel credentials, session tokens, and MCP turn tokens before logging or wrapping.

The local DSH category can remain stable, such as `STREAM_ERROR`, while the message contains the real upstream reason.

## Configuration

The default bridge URL is:

```text
http://127.0.0.1:17841
```

Override it in the profile Loader settings when the trusted local bridge uses a different loopback address:

```yaml
llm-chatgpt-web:
  baseURL: http://127.0.0.1:17841
  networkAccess: false
```

`networkAccess` describes the environment sent to the model. It does not change or bypass DSH tool permissions. The plugin does not define environment-variable overrides or credential settings.

## Troubleshooting

Check bridge health:

```powershell
Invoke-RestMethod http://127.0.0.1:17841/healthz
```

Check the model catalog without printing local credentials:

```powershell
Invoke-WebRequest http://127.0.0.1:17841/v1/models -SkipHttpErrorCheck
```

- **Connection refused:** start the codex-chatgpt-web launcher and confirm the configured port.
- **No model appears:** inspect `/v1/models`. Discovery failures expose no models by design.
- **Bearer authorization error:** this is the current upstream catalog limitation described under Requirements. Do not paste or export a ChatGPT token as a workaround.
- **Pro routes are missing:** the signed-in account or current bridge catalog does not expose them. The plugin cannot bypass that result.
- **Full harness tools are unavailable:** confirm `/healthz` reports `mode: full`, then verify Tunnel and the exact **Codex Native2** connector in the upstream launcher.
- **Browser DOM error:** the message comes from upstream browser automation. Check the launcher and upstream issues before treating it as a DSH plugin defect.
- **Old models remain after switching accounts:** reopen the model picker; if that DSH surface retains its snapshot, restart DSH Desktop.

## Security

The plugin never asks for a ChatGPT password, cookie, browser-session export, or OAuth token. The upstream launcher owns its browser profile and login session.

Do not put OpenAI API keys, Tunnel credentials, Authorization tokens, MCP turn tokens, cookies, or launcher diagnostics in this repository or DSH logs. Error redaction is defense in depth, not permission to pass secrets through untrusted upstream messages.

Both the bridge and DSH run as local software with the permissions of the current operating-system user. Only install this plugin and its required upstream launcher on a trusted workstation.

## Known limitations

- `codex-chatgpt-web` is unofficial browser automation. ChatGPT UI changes can break the upstream bridge.
- The current tested bridge requires native Codex Bearer authorization for `/v1/models`; DSH-safe live catalog discovery is therefore blocked and fails closed.
- The plugin cannot bypass ChatGPT account or model entitlements.
- Full harness depends on the upstream MCP, Tunnel, and Codex Native2 setup.
- A DSH UI may require reopening or restarting before it displays a newly refreshed model catalog.
- `purpose: session-title` uses a separate deterministic thread identity.
- `purpose: compaction` returns `UNSUPPORTED_PURPOSE`; bridge compaction uses a separate native state protocol and must not be mixed into a normal DSH turn.
- An upstream bridge defect is not automatically a plugin defect; use the preserved failure reason to identify the failing layer.

## Development

```powershell
npm install
npm run build
npm test
npm run pack:check
```

`npm run check` runs the build and complete test suite. `npm run pack:check` performs `npm pack --dry-run` so the public package contents can be reviewed without publishing.

## Upstream credits

This project depends on and thanks:

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop)
- [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web)

`dsh-llm-chatgpt-web` is independent, unofficial software. It is not affiliated with or endorsed by DeepSeek, anywhere-labs, OpenAI, or the `codex-chatgpt-web` maintainers.
