# dsh-llm-chatgpt-web

[English](README.md) | [简体中文](README.zh-CN.md)

本插件让 DSH 和 DSH Desktop 可以使用 `codex-chatgpt-web` 提供的 ChatGPT Web 路由。DSH 仍负责会话、文件、终端、工具、审批和沙箱策略；上游 launcher 负责连接 ChatGPT Web 浏览器。

> [!IMPORTANT]
> **强依赖说明：** 本插件目前必须依赖
> [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web)。
>
> `dsh-llm-chatgpt-web` 本身不实现 ChatGPT Web 浏览器传输层。它负责在 DSH / DSH Desktop 与 `codex-chatgpt-web` 之间进行适配。在使用本插件的 ChatGPT Web 模型之前，必须先安装上游 launcher、登录 ChatGPT，并保持 launcher 运行。
>
> ChatGPT Web 登录、浏览器传输、模型选择、Responses/SSE、Full harness 和 MCP 等上游能力均由 `codex-chatgpt-web` 提供。本项目不会隐藏或内嵌这项依赖，这不是可选依赖。

## 快速开始

1. 安装 [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web)，登录 ChatGPT Web，并保持 launcher 运行。需要调用 DSH 工具时，请按上游项目说明完成 Full harness / MCP 设置。

2. 打开 **DSH Desktop 内置的 Terminal**，执行：

   ```powershell
   dsh plugin add github:j955229/dsh-llm-chatgpt-web#main
   ```

   DSH Desktop 内置 Terminal 已经指向当前 `desktop` profile，所以不需要额外写 profile 参数。

   如果你是在普通系统终端中执行，则使用：

   ```powershell
   dsh plugin --profile desktop add github:j955229/dsh-llm-chatgpt-web#main
   ```

3. 重启 DSH Desktop。

4. 在模型列表中选择 `ChatGPT Web` 模型，然后开始对话。


## 模型

模型列表来自 launcher 本地 `config.json` 中的账号能力标记；本插件不会调用 bridge 的 `/v1/models` 接口。

| `solAvailable` | `proAvailable` | DSH 中显示的模型 |
| --- | --- | --- |
| `false` | `false` | Luna |
| `true` | `false` | Instant、Medium、High |
| `true` | `true` | Instant、Medium、High、Extra High、Pro |
| `false` | `true` | 无效配置；不显示任何模型 |

能力发现只控制界面中显示哪些选项。即使能力发现暂时失败，已知路由的请求仍会原样发送给 `codex-chatgpt-web`。未知路由会在本地被拒绝。本插件绝不会把你选择的模型偷偷换成其他路由。

## 能力发现方式

本插件读取：

- 设置了 `CODEX_CHATGPT_WEB_HOME` 时：`%CODEX_CHATGPT_WEB_HOME%\config.json`；
- 未设置时：`%USERPROFILE%\.codex-chatgpt-web\config.json`。

插件使用 `solAvailable`、`proAvailable` 和 `experimentalBiggerContext`。前两项决定可用路由，`experimentalBiggerContext` 用于把上游实际 ChatGPT Web context window 暴露给 DSH 的自动压缩系统。launcher 配置文件还可能包含敏感运行信息，请不要粘贴或公开完整文件。

## 故障排查

### 没有显示 ChatGPT Web 模型

确认 launcher 已完成登录，并且上述路径中存在 `config.json`。只检查下面两个字段：

```json
{
  "solAvailable": true,
  "proAvailable": false
}
```

两项都必须是 JSON 布尔值，不能写成字符串。若同时出现 `proAvailable: true` 和 `solAvailable: false`，属于无效配置。修正 launcher 设置后，重启 DSH Desktop。

### 已显示模型，但请求无法连接

确认 `codex-chatgpt-web` 仍在运行，并监听默认 bridge 地址 `http://127.0.0.1:17841`。本插件本身无法单独提供 ChatGPT Web 连接。

### 可以聊天，但不能使用 DSH 工具

工具调用依赖上游 launcher 的 Full harness / MCP 设置。请按照 `codex-chatgpt-web` 文档完成配置，并保持所需 tunnel 和 harness 组件运行。

### 上游拒绝所选模型

DSH 会收到上游原始 HTTP/SSE 错误，秘密信息会被遮盖。本插件不会偷偷改用其他模型重试。

## 源码开发

从源码构建需要 Node.js 20 或更高版本。

```powershell
git clone https://github.com/j955229/dsh-llm-chatgpt-web.git
cd dsh-llm-chatgpt-web
npm install
npm run check
npm pack
```

`npm run check` 会编译 TypeScript 并运行测试。普通用户安装不需要执行这些源码开发步骤。

## 许可证

[MIT](LICENSE)
