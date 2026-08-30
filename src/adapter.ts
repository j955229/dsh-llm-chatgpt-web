import { attributionHeaders, LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ModelCatalog, ModelDiscoveryError, PROVIDER, modelInfo, resolvedModel } from './models.js'
import { resolveEnvironment } from './environment.js'
import { serializeRequest } from './serialize.js'
import { responsesToChunks } from './sse.js'
import { readBridgeHealth, toolModeProblem } from './health.js'
import type { DshMessage, RuntimeContext } from './types.js'
import { describeHttpFailure, formatUpstreamFailure, safeCause, safeDetail } from './upstream-error.js'

export interface AdapterOptions {
  baseURL: string
  networkAccess: boolean
  context: RuntimeContext
  fetch?: typeof globalThis.fetch
  logger?: { info?(message: string): void; warn?(message: string): void; error?(message: string): void }
}

function base(value: string): string { return value.replace(/\/+$/, '') }

export class ChatGptWebAdapter extends LlmAdapter {
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly catalog: ModelCatalog
  constructor(private readonly options: AdapterOptions) {
    super()
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.catalog = new ModelCatalog({
      baseURL: options.baseURL,
      fetch: this.fetchImpl,
      headers: attributionHeaders(),
      ...(options.logger ? { logger: options.logger } : {}),
    })
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return provider === PROVIDER ? { id: PROVIDER, name: 'ChatGPT Web' } : { id: provider, name: provider }
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return provider === PROVIDER ? (await this.catalog.list()).map(modelInfo) : []
  }

  override async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    if (provider !== PROVIDER) return Promise.reject(new LlmError(`Unsupported provider: ${provider}`, 'UNSUPPORTED_PROVIDER'))
    try { return resolvedModel(await this.catalog.require(model, signal)) }
    catch (cause) {
      if (signal?.aborted) throw signal.reason
      const code = cause instanceof ModelDiscoveryError ? cause.code : 'UNKNOWN_MODEL'
      throw new LlmError(safeDetail(cause), code, { cause: safeCause(cause) })
    }
  }

  private async assertToolMode(signal?: AbortSignal): Promise<void> {
    let health: any
    try { health = await readBridgeHealth(base(this.options.baseURL), this.fetchImpl, signal, attributionHeaders()) }
    catch (cause) { throw new LlmError('無法連線到 codex-chatgpt-web bridge（預設 127.0.0.1:17841）。', 'UPSTREAM_OFFLINE', { cause }) }
    const problem = toolModeProblem(health)
    if (problem === 'wrong-service') throw new LlmError('17841 連接埠上的服務不是 codex-chatgpt-web。', 'UPSTREAM_INVALID')
    if (problem === 'browser-only') {
      throw new LlmError('codex-chatgpt-web Full mode is required for DSH tool calling', 'BROWSER_ONLY_TOOLS_UNSUPPORTED')
    }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    options.signal?.throwIfAborted()
    if (options.purpose === 'compaction') throw new LlmError('ChatGPT Web adapter 不支援 DSH compaction 請求；避免把壓縮回合混入正常 ChatGPT thread。', 'UNSUPPORTED_PURPOSE')
    if (!options.sessionId) throw new LlmError('ChatGPT Web adapter requires options.sessionId.', 'MISSING_SESSION_ID')
    try { await this.catalog.require(options.model, options.signal) }
    catch (cause) {
      if (options.signal?.aborted) throw options.signal.reason
      const code = cause instanceof ModelDiscoveryError ? cause.code : 'UNKNOWN_MODEL'
      throw new LlmError(safeDetail(cause), code, { cause: safeCause(cause) })
    }
    if (options.tools?.length) await this.assertToolMode(options.signal)
    const environment = resolveEnvironment(this.options.context, String(options.sessionId), this.options.networkAccess)
    let native
    try {
      native = await serializeRequest({
        model: options.model,
        messages: options.messages as DshMessage[],
        ...(options.system ? { system: options.system } : {}),
        ...(options.tools ? { tools: options.tools } : {}),
        ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.stop ? { stop: options.stop } : {}),
        sessionId: String(options.sessionId),
        ...(options.purpose === 'session-title' ? { purpose: options.purpose } : {}),
        signal: options.signal,
        environment,
        attachments: this.options.context.attachments,
      })
    } catch (cause) {
      throw new LlmError('無法建立原生 ChatGPT Web Responses 請求。', 'REQUEST_SERIALIZATION', { cause: safeCause(cause) })
    }
    let response: Response
    try {
      response = await this.fetchImpl(`${base(this.options.baseURL)}/v1/responses`, {
        method: 'POST', signal: options.signal,
        headers: { ...attributionHeaders(), accept: 'text/event-stream', 'content-type': 'application/json' },
        body: JSON.stringify(native.body),
      })
    } catch (cause) {
      if (options.signal?.aborted) throw options.signal.reason
      throw new LlmError(`無法連線到 codex-chatgpt-web bridge（預設 127.0.0.1:17841）：${safeDetail(cause)}`, 'UPSTREAM_OFFLINE', { cause: safeCause(cause) })
    }
    if (!response.ok) {
      const failure = await describeHttpFailure(response)
      throw new LlmError(`codex-chatgpt-web request failed: ${formatUpstreamFailure(failure)}`, `HTTP_${response.status}`)
    }
    if (!response.body || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
      throw new LlmError('codex-chatgpt-web did not return an SSE stream.', 'INVALID_RESPONSE')
    }
    try {
      for await (const chunk of responsesToChunks(response.body, options.signal)) yield chunk as StreamChunk
    } catch (cause) {
      if (options.signal?.aborted) throw options.signal.reason
      throw new LlmError(`codex-chatgpt-web:\n${safeDetail(cause)}`, 'STREAM_ERROR', { cause: safeCause(cause) })
    }
  }
}
