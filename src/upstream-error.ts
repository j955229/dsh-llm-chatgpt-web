const MAX_BODY_BYTES = 16 * 1024
const MAX_DETAIL_CHARS = 2_000
const MAX_EVENT_CHARS = 800

const SECRET_KEY = '(?:authorization|proxy-authorization|api[_-]?key|token|access[_-]?token|refresh[_-]?token|mcp[_-]?turn[_-]?token|turn[_-]?token|tunnel[_-]?(?:id|token|credential)|cookie|set-cookie|session[_-]?(?:id|token|cookie))'

export interface UpstreamFailure {
  message: string
  code?: string
}

export function redactSecrets(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(new RegExp(`("${SECRET_KEY}"\\s*:\\s*)"(?:\\\\.|[^"])*"`, 'gi'), '$1"[REDACTED]"')
    .replace(new RegExp(`(\\b${SECRET_KEY}\\b\\s*[=:]\\s*)[^\\s,;}"]+`, 'gi'), '$1[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
}

export function safeDetail(value: unknown, limit = MAX_DETAIL_CHARS): string {
  const raw = value instanceof Error ? value.message : typeof value === 'string' ? value : String(value)
  const redacted = redactSecrets(raw).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  return redacted.length > limit ? `${redacted.slice(0, limit)}…[truncated]` : redacted
}

export function safeCause(value: unknown): Error {
  const error = new Error(safeDetail(value))
  if (value instanceof Error && value.name === 'AbortError') error.name = 'AbortError'
  return error
}

export async function readLimitedResponseText(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  let truncated = false
  try {
    while (bytes < MAX_BODY_BYTES) {
      const { value, done } = await reader.read()
      if (done) break
      const remaining = MAX_BODY_BYTES - bytes
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value
      bytes += chunk.byteLength
      text += decoder.decode(chunk, { stream: true })
      if (value.byteLength > remaining) {
        truncated = true
        break
      }
    }
    if (bytes >= MAX_BODY_BYTES) truncated = true
    text += decoder.decode()
  } finally {
    if (truncated) await reader.cancel('upstream error body limit reached').catch(() => {})
    reader.releaseLock()
  }
  return safeDetail(`${text}${truncated ? '…[body truncated]' : ''}`)
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function firstString(value: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return undefined
}

export function extractUpstreamFailure(value: unknown): UpstreamFailure {
  if (typeof value === 'string') return { message: safeDetail(value) }
  const root = record(value)
  if (!root) return { message: 'ChatGPT Web bridge returned an unspecified error.' }

  const candidates = [root.error, root.response, record(root.response)?.error, root.failure, root.detail]
    .map(record)
    .filter((item): item is Record<string, unknown> => Boolean(item))
  const objects = [...candidates.reverse(), root]
  let message: string | undefined
  let code: string | undefined
  for (const candidate of objects) {
    message ??= firstString(candidate, ['message', 'failure_reason', 'reason', 'detail', 'error_description'])
    code ??= firstString(candidate, ['code', 'type', 'error_code'])
  }
  return {
    message: safeDetail(message ?? JSON.stringify(value)),
    ...(code ? { code: safeDetail(code, 128) } : {}),
  }
}

export async function describeHttpFailure(response: Response): Promise<UpstreamFailure> {
  const body = await readLimitedResponseText(response)
  let parsed: unknown
  if (body) {
    try { parsed = JSON.parse(body.replace(/…\[(?:body )?truncated\]$/, '')) }
    catch { parsed = undefined }
  }
  const failure = parsed === undefined ? { message: body || response.statusText || 'No upstream error body.' } : extractUpstreamFailure(parsed)
  const status = `${response.status}${response.statusText ? ` ${safeDetail(response.statusText, 160)}` : ''}`
  return {
    message: `HTTP ${status}: ${failure.message}`,
    ...(failure.code ? { code: failure.code } : {}),
  }
}

export function malformedSseMessage(record: { event?: string; data: string }): string {
  const event = safeDetail(record.event ?? 'message', 80)
  const raw = safeDetail(record.data, MAX_EVENT_CHARS)
  return `Malformed JSON in codex-chatgpt-web SSE event "${event}"; safe raw event: ${raw}`
}

export function formatUpstreamFailure(failure: UpstreamFailure): string {
  return `${failure.message}${failure.code ? ` (upstream code: ${failure.code})` : ''}`
}
