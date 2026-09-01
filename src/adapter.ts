import {
  attributionHeaders,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  LlmAdapter,
  LlmError,
} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { CapabilityCatalog } from './capabilities.js'
import type { AccountCapabilities } from './capabilities.js'
import { PROVIDER, modelInfo, resolvedModel, routeFor } from './models.js'
import type { Route } from './models.js'
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
  capabilityCatalog?: {
    list(signal?: AbortSignal): Promise<readonly Route[]>
    capabilities?(signal?: AbortSignal): Promise<AccountCapabilities | undefined>
  }
}

function base(value: string): string { return value.replace(/\/+$/, '') }

function upstreamFailureCode(status: number, failure: { message: string; code?: string }): string {
  const detail = [failure.code, failure.message].filter(Boolean).join(' ')
  if (failure.code === 'context_length_exceeded' || isContextWindowExceededError(detail)) {
    return CONTEXT_WINDOW_EXCEEDED_CODE
  }
  return `HTTP_${status}`
}

export class ChatGptWebAdapter extends LlmAdapter {
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly catalog: {
    list(signal?: AbortSignal): Promise<readonly Route[]>
    capabilities?(signal?: AbortSignal): Promise<AccountCapabilities | undefined>
  }

  constructor(private readonly options: AdapterOptions) {
    super()
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.catalog = options.capabilityCatalog ?? new CapabilityCatalog(options.logger ? { logger: options.logger } : {})
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return provider === PROVIDER ? { id: PROVIDER, name: 'ChatGPT Web' } : { id: provider, name: provider }
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return provider === PROVIDER ? (await this.catalog.list()).map(modelInfo) : []
  }

  override async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    if (provider !== PROVIDER) return Promise.reject(new LlmError(`Unsupported provider: ${provider}`, 'UNSUPPORTED_PROVIDER'))
    signal?.throwIfAborted()

    let route: Route
    try { route = routeFor(model) }
    catch (cause) {
      if (signal?.aborted) throw signal.reason
      throw new LlmError(safeDetail(cause), 'UNKNOWN_MODEL', { cause: safeCause(cause) })
    }

    const capabilities = await this.catalog.capabilities?.(signal)
    signal?.throwIfAborted()
    return resolvedModel(route, capabilities)
  }

  private async assertToolMode(signal?: AbortSignal): Promise<void> {
    let health: any
    try { health = await readBridgeHealth(base(this.options.baseURL), this.fetchImpl, signal, attributionHeaders()) }
    catch (cause) { throw new LlmError('無法連線到 codex-chatgpt-web bridge（預設 127.0.0.1:17841）。', 'UPSTREAM_OFFLINE', { cause: safeCause(cause) }) }
    const problem = toolModeProblem(health)
    if (problem === 'wrong-service') throw new LlmError('17841 連接埠上的服務不是 codex-chatgpt-web。', 'UPSTREAM_INVALID')
    if (problem === 'browser-only') {
      throw new LlmError('codex-chatgpt-web Full mode is required for DSH tool calling', 'BROWSER_ONLY_TOOLS_UNSUPPORTED')
    }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    options.signal?.throwIfAborted()
    if (!options.sessionId) throw new LlmError('ChatGPT Web adapter requires options.sessionId.', 'MISSING_SESSION_ID')
    try { routeFor(options.model) }
    catch (cause) {
      if (options.signal?.aborted) throw options.signal.reason
      throw new LlmError(safeDetail(cause), 'UNKNOWN_MODEL', { cause: safeCause(cause) })
    }

    // DSH compaction is a separate summarization turn. It deliberately carries no tools and uses
    // a distinct native thread scope in serializeRequest(), so it cannot contaminate the active
    // ChatGPT Web conversation or invoke work tools while producing a checkpoint.
    const compaction = options.purpose === 'compaction'
    if (!compaction && options.tools?.length) await this.assertToolMode(options.signal)

    const environment = resolveEnvironment(this.options.context, String(options.sessionId), this.options.networkAccess)
    let native
    try {
      native = await serializeRequest({
        model: options.model,
        messages: options.messages as DshMessage[],
        ...(options.system ? { system: options.system } : {}),
        ...(!compaction && options.tools ? { tools: options.tools } : {}),
        ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.stop ? { stop: options.stop } : {}),
        sessionId: String(options.sessionId),
        ...(options.purpose ? { purpose: options.purpose } : {}),
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
      throw new LlmError(
        `codex-chatgpt-web request failed: ${formatUpstreamFailure(failure)}`,
        upstreamFailureCode(response.status, failure),
        { status: response.status },
      )
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
