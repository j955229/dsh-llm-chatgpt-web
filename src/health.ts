export interface BridgeHealth { service?: string; mode?: string; [key: string]: unknown }

export async function readBridgeHealth(baseURL: string, fetchImpl: typeof fetch, signal?: AbortSignal, headers: Record<string, string> = {}): Promise<BridgeHealth> {
  const response = await fetchImpl(`${baseURL.replace(/\/+$/, '')}/healthz`, { signal, headers })
  if (!response.ok) throw new Error(`HEALTH_HTTP_${response.status}`)
  const value = await response.json()
  if (!value || typeof value !== 'object') throw new Error('HEALTH_MALFORMED')
  return value as BridgeHealth
}

export function toolModeProblem(health: BridgeHealth): 'wrong-service' | 'browser-only' | undefined {
  if (health.service !== 'codex-chatgpt-web') return 'wrong-service'
  if (health.mode !== 'full') return 'browser-only'
  return undefined
}
