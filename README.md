# dsh-llm-chatgpt-web

[English](README.md) | [简体中文](README.zh-CN.md)

> [!IMPORTANT]
> **Strong dependency:** This plugin currently requires
> [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web).
>
> `dsh-llm-chatgpt-web` does not implement the ChatGPT Web browser transport itself. It is the DSH adapter layer between DSH / DSH Desktop and `codex-chatgpt-web`. The upstream launcher must be installed, signed in, and running before this plugin can use ChatGPT Web models.
>
> `codex-chatgpt-web` provides the upstream ChatGPT Web login, browser transport, model selection, Responses/SSE, Full harness, and MCP capabilities. This project does not hide or embed that dependency, and it is not optional.

This plugin lets DSH and DSH Desktop use the ChatGPT Web routes exposed by `codex-chatgpt-web`. DSH remains responsible for sessions, files, shell access, tools, approvals, and sandbox policy; the upstream launcher handles the browser connection to ChatGPT Web.

## Quick start

1. Install [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web), sign in to ChatGPT Web, and keep the launcher running. For DSH tool calling, complete the upstream Full harness / MCP setup described by that project.

2. Open the **Terminal built into DSH Desktop** and run:

   ```powershell
   dsh plugin add github:j955229/dsh-llm-chatgpt-web#v0.1.0
   ```

   The built-in DSH Desktop Terminal already targets the active `desktop` profile, so no extra profile argument is needed.

   If you are using a normal system terminal instead, use:

   ```powershell
   dsh plugin --profile desktop add github:j955229/dsh-llm-chatgpt-web#v0.1.0
   ```

3. Restart DSH Desktop.

4. Select a `ChatGPT Web` model and start a conversation.

No repository clone, `npm install`, local build, Release tarball URL, or manual pnpm `allowBuilds` edit is required for the normal installation path above.

## Models

The model list comes from the launcher account-capability flags in its local `config.json`; the plugin does not call the bridge's `/v1/models` endpoint.

| `solAvailable` | `proAvailable` | Models shown in DSH |
| --- | --- | --- |
| `false` | `false` | Luna |
| `true` | `false` | Instant, Medium, High |
| `true` | `true` | Instant, Medium, High, Extra High, Pro |
| `false` | `true` | Invalid configuration; no models are shown |

Capability discovery only controls which choices are shown in the UI. A request for a known route is sent unchanged to `codex-chatgpt-web`, even when capability discovery is temporarily unavailable. Unknown routes are rejected locally. The plugin never silently changes a requested model to a cheaper or lower-effort route.

## How capability discovery works

The plugin reads:

- `%CODEX_CHATGPT_WEB_HOME%\config.json` when `CODEX_CHATGPT_WEB_HOME` is set; or
- `%USERPROFILE%\.codex-chatgpt-web\config.json` otherwise.

Only `solAvailable` and `proAvailable` are used. The launcher config may also contain sensitive runtime information, so do not paste or publish the complete file.

## Troubleshooting

### No ChatGPT Web models appear

Confirm that the launcher has completed sign-in and that its `config.json` exists at one of the paths above. Inspect only these two fields:

```json
{
  "solAvailable": true,
  "proAvailable": false
}
```

Both values must be JSON booleans, not strings. `proAvailable: true` together with `solAvailable: false` is invalid. After correcting the launcher setup, restart DSH Desktop.

### A model is listed but requests cannot connect

Make sure `codex-chatgpt-web` is still running and listening on its default bridge address, `http://127.0.0.1:17841`. This plugin cannot provide ChatGPT Web access by itself.

### Chat works but DSH tools do not

Tool calling requires the upstream launcher's Full harness / MCP setup. Follow the `codex-chatgpt-web` documentation and keep its required tunnel and harness components running.

### Upstream rejects a selected model

The original upstream HTTP/SSE error is returned to DSH with secrets redacted. The plugin does not retry the request with a different model.

### Windows: `ERR_PNPM_EPERM` after switching from an older local checkout

If this plugin was previously installed from a local directory, Windows/pnpm may leave a Junction in the DSH profile's `node_modules`. A later GitHub install can then fail while renaming a temporary package directory.

Check the installed path:

```powershell
Get-Item "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-llm-chatgpt-web" -Force |
    Format-List FullName,Attributes,LinkType,Target
```

If `LinkType` is `Junction` or `SymbolicLink` and the target is your old local checkout, remove only that link:

```powershell
cmd /c rmdir "%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-llm-chatgpt-web"
```

Then remove any failed-install temporary directories:

```powershell
Get-ChildItem "$env:USERPROFILE\.dsh\profiles\desktop\node_modules" -Filter "dsh-llm-chatgpt-web_tmp_*" -Force |
    Remove-Item -Recurse -Force
```

Retry:

```powershell
dsh plugin add github:j955229/dsh-llm-chatgpt-web#v0.1.0
```

Do not delete the whole DSH lockfile for this specific Junction conflict.

## Configuration

The defaults are normally sufficient:

```yaml
baseURL: http://127.0.0.1:17841
networkAccess: false
```

- `baseURL` is the local `codex-chatgpt-web` bridge address.
- `networkAccess` describes whether the model turn may use network-capable DSH tools; it does not start or configure the upstream launcher.

## Source development

Node.js 20 or newer is required for a source build.

```powershell
git clone https://github.com/j955229/dsh-llm-chatgpt-web.git
cd dsh-llm-chatgpt-web
npm install
npm run check
npm pack
```

`npm run check` compiles the TypeScript and runs the test suite. Source-development steps are not required for normal installation.

## License

[MIT](LICENSE)
