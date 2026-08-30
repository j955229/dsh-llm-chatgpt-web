# dsh-llm-chatgpt-web

[English](README.md) | [简体中文](README.zh-CN.md)

> [!IMPORTANT]
> **强依赖说明：** 本插件目前必须依赖
> [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web)。
>
> `dsh-llm-chatgpt-web` 本身不实现 ChatGPT Web 浏览器传输层。它负责在 DSH / DSH Desktop 与 `codex-chatgpt-web` 之间进行适配。在使用本插件的 ChatGPT Web 模型之前，必须先安装并运行上游 launcher。
>
> ChatGPT Web 登录、浏览器传输、模型选择、Responses/SSE、Full harness 和 MCP 等上游能力均由 `codex-chatgpt-web` 提供。如果它没有运行，本插件无法使用 ChatGPT Web 模型。本项目不会隐藏或内嵌这项依赖，也不会把这项必需依赖描述成可选或推荐依赖。

本插件让 DSH 和 DSH Desktop 可以使用 `codex-chatgpt-web` 提供的 ChatGPT Web 路由。DSH 仍负责会话、文件、终端、工具、审批和沙箱策略；上游 launcher 负责连接 ChatGPT Web 浏览器。

## 快速开始

1. 安装 [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web)，登录 ChatGPT Web，并保持 launcher 运行。需要调用工具时，请按上游项目的说明完成 Full harness / MCP 设置。
2. 打开 DSH Desktop 内置的 Terminal，只运行下面这一条命令：

   ```powershell
   dsh plugin add https://github.com/j955229/dsh-llm-chatgpt-web/releases/download/v0.1.0/dsh-llm-chatgpt-web-0.1.0.tgz
   ```

   命令完成后重启 DSH Desktop。
3. 在 DSH Desktop 中选择 `ChatGPT Web` 模型，然后开始对话。

Release 中的压缩包已经完成构建。安装时不需要克隆本仓库，不需要运行 `npm install` 或构建命令，也不需要修改 pnpm 的 `allowBuilds` 设置。

## 模型

模型列表来自 launcher 本地 `config.json` 中的账号能力标记；本插件不会调用 bridge 的 `/v1/models` 接口。

| `solAvailable` | `proAvailable` | DSH 中显示的模型 |
| --- | --- | --- |
| `false` | `false` | Luna |
| `true` | `false` | Instant、Medium、High |
| `true` | `true` | Instant、Medium、High、Extra High、Pro |
| `false` | `true` | 无效配置；不显示任何模型 |

能力发现只控制界面中显示哪些选项。即使能力发现暂时失败，已知路由的请求仍会原样发送给 `codex-chatgpt-web`。未知路由会在本地被拒绝。本插件绝不会把你选择的模型偷偷换成更便宜或推理强度更低的路由。

## 能力发现方式

本插件读取：

- 设置了 `CODEX_CHATGPT_WEB_HOME` 时：`%CODEX_CHATGPT_WEB_HOME%\config.json`；
- 未设置时：`%USERPROFILE%\.codex-chatgpt-web\config.json`。

插件只使用 `solAvailable` 和 `proAvailable`。launcher 配置文件还可能包含登录凭据等秘密信息，请不要粘贴或公开完整文件。

## 故障排查

### 没有显示 ChatGPT Web 模型

确认 launcher 已完成登录，并且上述路径中存在 `config.json`。只检查下面两个字段：

```json
{
  "solAvailable": true,
  "proAvailable": false
}
```

两项都必须是 JSON 布尔值，不能写成字符串。`proAvailable: true` 与 `solAvailable: false` 同时出现属于无效配置。修正 launcher 设置后，重启 DSH Desktop。

### 已显示模型，但请求无法连接

确认 `codex-chatgpt-web` 仍在运行，并监听默认 bridge 地址 `http://127.0.0.1:17841`。本插件无法单独提供 ChatGPT Web 连接。

### 可以聊天，但不能使用 DSH 工具

工具调用依赖上游 launcher 的 Full harness / MCP 设置。请按照 `codex-chatgpt-web` 文档完成配置，并保持所需的 tunnel 和 harness 组件运行。

### 上游拒绝所选模型

DSH 会收到上游原始的 HTTP/SSE 错误，秘密信息会被隐藏。本插件不会改用其他模型重试。

## 配置

通常保留默认值即可：

```yaml
baseURL: http://127.0.0.1:17841
networkAccess: false
```

- `baseURL` 是本地 `codex-chatgpt-web` bridge 的地址。
- `networkAccess` 表示本轮模型是否可以使用具备网络能力的 DSH 工具；它不会启动或配置上游 launcher。

## 源码开发

从源码构建需要 Node.js 20 或更高版本。

```powershell
git clone https://github.com/j955229/dsh-llm-chatgpt-web.git
cd dsh-llm-chatgpt-web
npm install
npm run check
npm pack
```

`npm run check` 会编译 TypeScript 并运行测试。`npm pack` 会生成与 GitHub Release 相同类型的预构建 `.tgz` 包。本项目不会发布到 npm。

## 许可证

[MIT](LICENSE)
