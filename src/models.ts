import type { LlmModelInfo, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import { describeHttpFailure, formatUpstreamFailure, safeCause, safeDetail } from './upstream-error.js'

export const PROVIDER = 'chatgpt-web'

export const ROUTES = [
  { id: 'chatgpt-web/light', name: 'ChatGPT Web / Instant', effort: 'low', description: 'Fastest GPT-5.6 Sol route.' },
  { id: 'chatgpt-web/medium', name: 'ChatGPT Web / Medium', effort: 'medium', description: 'Balanced GPT-5.6 Sol route.' },
  { id: 'chatgpt-web/high', name: 'ChatGPT Web / High', effort: 'high', description: 'High-reasoning GPT-5.6 Sol route.' },
  { id: 'chatgpt-web/extra-high', name: 'ChatGPT Web / Extra High', effort: 'xhigh', description: 'Extra-high reasoning; requires a ChatGPT Pro account.' },
  { id: 'chatgpt-web/pro', name: 'ChatGPT Web / Pro', effort: 'ultra', description: 'Maximum reasoning; requires a ChatGPT Pro account.' },
  { id: 'chatgpt-web/luna', name: 'ChatGPT Web / Luna', effort: 'low', description: 'GPT-5.6 Luna route; only available when the account lacks Sol access.' },
] as const

export type Route = typeof ROUTES[number]

export interface ModelDiscoveryLogger {
  info?(message: string): void
  warn?(message: string): void
  error?(message: string): void
}

export interface ModelCatalogOptions {
  baseURL: string
  fetch: typeof globalThis.fetch
  headers?: Record<string, string>
  logger?: ModelDiscoveryLogger
  cacheMs?: number
}

export class ModelDiscoveryError extends Error {
  readonly code = 'MODEL_DISCOVERY_FAILED'
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ModelDiscoveryError'
  }
}

export function routeFor(model: string): Route {
  const route = ROUTES.find(item => item.id === model)
  if (!route) throw new Error(`Unknown ChatGPT Web model route: ${model}`)
  return route
}

export async function discoverRoutes(
  baseURL: string,
  fetchImpl: typeof globalThis.fetch,
  signal?: AbortSignal,
  headers: Record<string, string> = {},
  logger?: ModelDiscoveryLogger,
): Promise<readonly Route[]> {
  signal?.throwIfAborted()
  let response: Response
  try {
    response = await fetchImpl(`${baseURL.replace(/\/+$/, '')}/v1/models`, { method: 'GET', signal, headers })
  } catch (cause) {
    if (signal?.aborted) throw signal.reason
    throw new ModelDiscoveryError(`Could not connect to codex-chatgpt-web model discovery: ${safeDetail(cause)}`, { cause: safeCause(cause) })
  }
  if (!response.ok) {
    const failure = await describeHttpFailure(response)
    throw new ModelDiscoveryError(`codex-chatgpt-web model discovery failed: ${formatUpstreamFailure(failure)}`)
  }
  let value: unknown
  try {
    value = await response.json()
  } catch (cause) {
    throw new ModelDiscoveryError(`codex-chatgpt-web /v1/models returned malformed JSON: ${safeDetail(cause)}`, { cause: safeCause(cause) })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as any).models)) {
    throw new ModelDiscoveryError('codex-chatgpt-web /v1/models response is missing a models array.')
  }

  const available = new Set<string>()
  for (const item of (value as any).models as unknown[]) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof (item as any).slug !== 'string') {
      throw new ModelDiscoveryError('codex-chatgpt-web /v1/models contains a malformed model entry.')
    }
    const slug = String((item as any).slug)
    if (!slug.startsWith(`${PROVIDER}/`)) continue
    if (!ROUTES.some(route => route.id === slug)) {
      logger?.warn?.(`llm-chatgpt-web: ignoring unknown bridge model slug ${safeDetail(slug, 200)}`)
      continue
    }
    available.add(slug)
  }
  return ROUTES.filter(route => available.has(route.id))
}

export class ModelCatalog {
  private routes: readonly Route[] = []
  private refreshedAt = 0
  private failure: ModelDiscoveryError | undefined
  private inFlight: Promise<readonly Route[]> | undefined

  constructor(private readonly options: ModelCatalogOptions) {}

  private async load(signal?: AbortSignal, force = false): Promise<readonly Route[]> {
    signal?.throwIfAborted()
    const cacheMs = this.options.cacheMs ?? 30_000
    if (!force && this.refreshedAt && Date.now() - this.refreshedAt < cacheMs) {
      if (this.failure) throw this.failure
      return this.routes
    }
    if (this.inFlight) return this.inFlight
    this.inFlight = discoverRoutes(
      this.options.baseURL,
      this.options.fetch,
      signal,
      this.options.headers,
      this.options.logger,
    ).then(routes => {
      this.routes = routes
      this.failure = undefined
      this.refreshedAt = Date.now()
      this.options.logger?.info?.(`llm-chatgpt-web: discovered ${routes.length} available ChatGPT Web model route(s)`)
      return routes
    }).catch(cause => {
      const failure = cause instanceof ModelDiscoveryError
        ? cause
        : new ModelDiscoveryError(safeDetail(cause), { cause: safeCause(cause) })
      this.routes = []
      this.failure = failure
      this.refreshedAt = Date.now()
      this.options.logger?.error?.(`llm-chatgpt-web: model discovery failed closed: ${safeDetail(failure)}`)
      throw failure
    }).finally(() => { this.inFlight = undefined })
    return this.inFlight
  }

  async list(signal?: AbortSignal): Promise<readonly Route[]> {
    try { return await this.load(signal, true) }
    catch (cause) {
      if (signal?.aborted) throw signal.reason
      return []
    }
  }

  async require(model: string, signal?: AbortSignal): Promise<Route> {
    const route = routeFor(model)
    const routes = await this.load(signal)
    if (!routes.some(item => item.id === route.id)) {
      throw new ModelDiscoveryError(`ChatGPT Web model is not available in the bridge catalog: ${model}`)
    }
    return route
  }
}

export function modelInfo(route: Route): LlmModelInfo {
  return { provider: PROVIDER, id: route.id, name: route.name, description: route.description, inputModalities: ['text', 'image'] }
}

export function resolvedModel(route: Route): LlmResolvedModelInfo {
  return { ...modelInfo(route), reasoning: { efforts: [{ id: route.effort, name: route.effort }], defaultEffort: route.effort } }
}
