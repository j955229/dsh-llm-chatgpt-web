import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { ROUTES } from './models.js'
import type { Route } from './models.js'
import { safeDetail } from './upstream-error.js'

export interface AccountCapabilities {
  solAvailable: boolean
  proAvailable: boolean
  experimentalBiggerContext: boolean
}

export interface CapabilityLogger {
  info?(message: string): void
  warn?(message: string): void
  error?(message: string): void
}

export interface CapabilityCatalogOptions {
  configPath?: string
  env?: NodeJS.ProcessEnv
  homeDir?: string
  readText?: (path: string) => Promise<string>
  logger?: CapabilityLogger
}

export class CapabilityDiscoveryError extends Error {
  readonly code = 'CAPABILITY_DISCOVERY_FAILED'
  constructor(message: string) {
    super(message)
    this.name = 'CapabilityDiscoveryError'
  }
}

function expandHome(value: string, homeDir: string): string {
  if (value === '~') return homeDir
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homeDir, value.slice(2))
  return value
}

export function capabilityConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = homedir(),
): string {
  const configured = env.CODEX_CHATGPT_WEB_HOME?.trim()
  const directory = configured ? expandHome(configured, homeDir) : join(homeDir, '.codex-chatgpt-web')
  return join(isAbsolute(directory) ? directory : resolve(directory), 'config.json')
}

export function routesForCapabilities(capabilities: AccountCapabilities): readonly Route[] {
  if (!capabilities.solAvailable && capabilities.proAvailable) {
    throw new CapabilityDiscoveryError('codex-chatgpt-web capability flags are contradictory: Pro requires Sol.')
  }
  const ids: readonly string[] = capabilities.solAvailable
    ? capabilities.proAvailable
      ? ['chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high', 'chatgpt-web/extra-high', 'chatgpt-web/pro']
      : ['chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high']
    : ['chatgpt-web/luna']
  return ROUTES.filter(route => ids.includes(route.id))
}

export async function readAccountCapabilities(
  configPath: string,
  readText: (path: string) => Promise<string> = path => readFile(path, 'utf8'),
): Promise<AccountCapabilities> {
  let text: string
  try {
    text = await readText(configPath)
  } catch (cause) {
    throw new CapabilityDiscoveryError(`Could not read codex-chatgpt-web config at ${configPath}: ${safeDetail(cause)}`)
  }

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new CapabilityDiscoveryError(`codex-chatgpt-web config at ${configPath} contains malformed JSON.`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CapabilityDiscoveryError(`codex-chatgpt-web config at ${configPath} is not a JSON object.`)
  }
  const config = value as Record<string, unknown>
  if (typeof config.solAvailable !== 'boolean' || typeof config.proAvailable !== 'boolean') {
    throw new CapabilityDiscoveryError(`codex-chatgpt-web config at ${configPath} must contain boolean solAvailable and proAvailable fields.`)
  }
  if (config.experimentalBiggerContext !== undefined && typeof config.experimentalBiggerContext !== 'boolean') {
    throw new CapabilityDiscoveryError(`codex-chatgpt-web config at ${configPath} must contain a boolean experimentalBiggerContext field when present.`)
  }
  const capabilities = {
    solAvailable: config.solAvailable,
    proAvailable: config.proAvailable,
    experimentalBiggerContext: config.experimentalBiggerContext === true,
  }
  routesForCapabilities(capabilities)
  return capabilities
}

export class CapabilityCatalog {
  private readonly configPath: string
  private readonly readText: (path: string) => Promise<string>

  constructor(private readonly options: CapabilityCatalogOptions = {}) {
    this.configPath = options.configPath ?? capabilityConfigPath(options.env, options.homeDir)
    this.readText = options.readText ?? (path => readFile(path, 'utf8'))
  }

  async capabilities(signal?: AbortSignal): Promise<AccountCapabilities | undefined> {
    signal?.throwIfAborted()
    try {
      const capabilities = await readAccountCapabilities(this.configPath, this.readText)
      signal?.throwIfAborted()
      return capabilities
    } catch (cause) {
      if (signal?.aborted) throw signal.reason
      const message = cause instanceof CapabilityDiscoveryError ? cause.message : 'Unexpected account capability discovery failure.'
      this.options.logger?.warn?.(`llm-chatgpt-web: account capability discovery failed closed: ${message}`)
      return undefined
    }
  }

  async list(signal?: AbortSignal): Promise<readonly Route[]> {
    const capabilities = await this.capabilities(signal)
    if (!capabilities) return []
    const routes = routesForCapabilities(capabilities)
    this.options.logger?.info?.(`llm-chatgpt-web: discovered ${routes.length} model route(s) from account capabilities`)
    return routes
  }
}
