# dsh-llm-chatgpt-web

[English](README.md) | [简体中文](README.zh-CN.md)

> [!IMPORTANT]
> **强依赖说明（必需）：** 本插件目前必须依赖
> [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web)。
>
> `dsh-llm-chatgpt-web` 本身不实现 ChatGPT Web 浏览器传输层。它负责在 DSH / DSH Desktop 与 `codex-chatgpt-web` 之间进行适配。在使用本插件的 ChatGPT Web 模型之前，必须先安装并运行上游 launcher。
>
> ChatGPT Web 登录、浏览器传输、模型选择、Responses/SSE、Full harness 和 MCP 等上游能力均由 `codex-chatgpt-web` 提供。如果它没有运行，本插件无法使用 ChatGPT Web 模型。本项目不会隐藏、内嵌这项依赖，也不会把必需依赖描述成可选或推荐依赖。

`dsh-llm-chatgpt-web` 是一个独立的 DSH LLM provider 插件。它连接 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)、[DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) 和 `codex-chatgpt-web`，让 bridge 实际返回的 ChatGPT Web 模型以原生 DSH 模型出现，同时由 DSH 继续担任外层 harness。

DSH 仍负责会话生命周期、本地文件系统、shell、工具、审批、沙箱策略以及 MCP/工具执行。ChatGPT Web 只作为模型和推理后端。本插件不会上传另一套工具运行时，也不会让上游 bridge 绕过 DSH 权限。

## 架构

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

## 前置条件

- DSH 或 DSH Desktop
- 已安装、已登录并正在运行的 `codex-chatgpt-web` launcher
- 至少拥有一个受支持 ChatGPT Web route 的 ChatGPT 账号
- 纯聊天使用 Browser-only；需要 DSH 工具调用时使用 Full harness
- Full harness 必须完成 `codex-chatgpt-web` 官方说明中的 Tunnel 和 **Codex Native2** 设置
- 从源码构建需要 Node.js 20 或更高版本

已测试版本：

- DSH Desktop 2.0.4
- DeepSeek Harness `0.1.2-alpha.1`
- codex-chatgpt-web 4.0.5

> [!WARNING]
> 当前测试的 codex-chatgpt-web 4.0.5 会让 `/v1/models` 转发传入的原生 Codex Bearer authorization。普通 DSH 请求没有这项凭据，因此 live endpoint 会返回 HTTP 502，本插件会正确地暴露零个模型。不要把 ChatGPT OAuth token、cookie 或浏览器凭据复制到 DSH。只有上游 bridge 提供适合 DSH 的安全账号目录接口或受支持的认证流程后，Release 才能声称 live model discovery 验证成功。

## 安装

先构建本地 checkout：

```powershell
npm install
npm run check
```

打开 DSH Desktop 自带的 Terminal，安装本地目录：

```powershell
dsh plugin add "C:\path\to\dsh-llm-chatgpt-web"
```

GitHub Release 建立后，DSH 也支持安装固定版本的 GitHub source：

```powershell
dsh plugin add github:j955229/dsh-llm-chatgpt-web#v0.1.0
```

添加、更新或移除插件后都要重新启动 DSH Desktop。移除命令：

```powershell
dsh plugin remove dsh-llm-chatgpt-web
```

## 模型与账号可用范围

`src/models.ts` 中的六个条目只保存 known-model metadata，包括名称、说明、输入能力和固定 reasoning effort。它们不是账号 entitlement 列表。

bridge 的 `GET /v1/models` 响应是唯一权威来源。插件只保留响应中以 `chatgpt-web/` 开头并且属于已知 route 的 slug。原生 Codex 模型会被过滤；未来出现的未知 `chatgpt-web/*` slug 会被跳过并记录 warning，不会直接注册。

| 账号 | bridge 通常返回的 routes |
| --- | --- |
| Free / Go | `chatgpt-web/luna` |
| Plus | `chatgpt-web/light`、`chatgpt-web/medium`、`chatgpt-web/high` |
| Pro | `chatgpt-web/light`、`chatgpt-web/medium`、`chatgpt-web/high`、`chatgpt-web/extra-high`、`chatgpt-web/pro` |

实际可用范围取决于已登录的 ChatGPT 账号以及当前 `codex-chatgpt-web` 的行为。本插件不能解锁、虚构账号没有的 route，也不会回退到其他模型。

每次 DSH 查询模型列表时，`listModels()` 都会重新读取 bridge catalog。解析具体模型和真正开始 turn 前，还会再次检查短期 catalog cache。任何刷新失败都会清空 catalog、记录原因并 fail closed。如果更换账号后 DSH 界面仍保留旧快照，请重新打开模型选择器；仍未刷新时，重新启动 DSH Desktop。

## Browser-only 与 Full harness

Browser-only 模式可以运行 ChatGPT Web 模型，但 ChatGPT 无法调用本地 DSH 工具。

Full harness 模式允许 ChatGPT Web 调用当前 DSH turn 发布的工具。工具仍由 DSH 执行，DSH 的沙箱和审批始终拥有最终决定权。上游 launcher 的 `/healthz` 必须返回 `mode: full`；否则带 DSH 工具的请求会明确失败。

## 错误处理

本插件会在安全范围内保留上游 `codex-chatgpt-web` 的失败详情，不会把所有错误压缩成没有原因的 `STREAM_ERROR`。

- HTTP 非 2xx 响应会保留 status、status text、最具体的上游 message，以及存在时的上游 error code。
- SSE `error` 和 `response.failed` 事件会保留嵌套的失败原因和 code。
- malformed SSE 会报告本地解析位置以及安全截断后的原始 event。
- 取消操作继续保留 `AbortError` 语义。
- 错误正文和事件都有长度上限；进入日志或 DSH 错误对象前，会遮盖 Authorization header、Bearer 值、API key、cookie、Tunnel credential、session token 和 MCP turn token。

本地 DSH 分类仍可保持稳定，例如 `STREAM_ERROR`，但 message 会包含真正的上游原因。

## 配置

默认 bridge 地址：

```text
http://127.0.0.1:17841
```

如果受信任的本机 bridge 使用其他 loopback 地址，可在 profile 的 Loader 设置中覆盖：

```yaml
llm-chatgpt-web:
  baseURL: http://127.0.0.1:17841
  networkAccess: false
```

`networkAccess` 只描述发送给模型的环境，不会改变或绕过 DSH 工具权限。本插件没有定义环境变量 override 或凭据设置。

## 故障排查

检查 bridge 健康状态：

```powershell
Invoke-RestMethod http://127.0.0.1:17841/healthz
```

在不输出本机凭据的情况下检查模型目录：

```powershell
Invoke-WebRequest http://127.0.0.1:17841/v1/models -SkipHttpErrorCheck
```

- **Connection refused：** 启动 codex-chatgpt-web launcher，并核对端口配置。
- **没有模型：** 检查 `/v1/models`。discovery 失败时不暴露模型是预期的 fail-closed 行为。
- **Bearer authorization 错误：** 这是“前置条件”中说明的当前上游目录限制。不要用粘贴或导出 ChatGPT token 的方式绕过。
- **缺少 Pro routes：** 已登录账号或当前 bridge catalog 没有返回它们，本插件不能绕过该结果。
- **Full harness 工具不可用：** 确认 `/healthz` 返回 `mode: full`，再到上游 launcher 检查 Tunnel 和名称完全一致的 **Codex Native2** connector。
- **Browser DOM 错误：** 这类 message 来自上游浏览器自动化。先检查 launcher 和上游 issue，不要直接当成 DSH 插件错误。
- **切换账号后仍显示旧模型：** 重新打开模型选择器；如果该 DSH 界面仍保留快照，请重新启动 DSH Desktop。

## 安全

本插件不会要求 ChatGPT 密码、cookie、浏览器 session export 或 OAuth token。浏览器 profile 和登录 session 由上游 launcher 管理。

不要把 OpenAI API key、Tunnel credential、Authorization token、MCP turn token、cookie 或 launcher diagnostics 放进本仓库或 DSH 日志。错误遮盖只是额外保护，不代表可以把 secret 放进不受信任的上游 message。

bridge 和 DSH 都以当前操作系统用户的权限运行。只能在受信任的工作站上安装本插件及其强依赖。

## 已知限制

- `codex-chatgpt-web` 是非官方浏览器自动化；ChatGPT UI 变化可能破坏上游 bridge。
- 当前测试的 bridge 会要求 `/v1/models` 带原生 Codex Bearer authorization，因此适合 DSH 的 live catalog discovery 目前被阻塞，并且会 fail closed。
- 本插件不能绕过 ChatGPT 账号或模型 entitlement。
- Full harness 依赖上游 MCP、Tunnel 和 Codex Native2 设置。
- DSH 界面可能需要重新打开或重启，才会显示刷新后的模型目录。
- `purpose: session-title` 使用独立的 deterministic thread identity。
- `purpose: compaction` 返回 `UNSUPPORTED_PURPOSE`；bridge compaction 使用另一套原生状态协议，不能混入普通 DSH turn。
- 上游 bridge bug 不一定是插件 bug；请根据保留下来的失败原因判断故障层。

## 开发

```powershell
npm install
npm run build
npm test
npm run pack:check
```

`npm run check` 会执行 build 和完整测试。`npm run pack:check` 会运行 `npm pack --dry-run`，无需发布就能检查公开包内容。

## 上游致谢

本项目依赖并感谢：

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop)
- [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web)

`dsh-llm-chatgpt-web` 是独立、非官方软件，与 DeepSeek、anywhere-labs、OpenAI 或 `codex-chatgpt-web` 维护者没有 affiliation，也未获得其 endorsement。
