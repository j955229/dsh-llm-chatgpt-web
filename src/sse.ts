import type { DshBlock } from './types.js'
import { extractUpstreamFailure, formatUpstreamFailure, malformedSseMessage } from './upstream-error.js'

export interface SseRecord { event?: string; data: string }

export class UpstreamSseError extends Error {
  readonly code?: string
  constructor(failure: { message: string; code?: string }) {
    super(formatUpstreamFailure(failure))
    this.name = 'UpstreamSseError'
    if (failure.code) this.code = failure.code
  }
}

export async function* decodeSse(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseRecord> {
  const reader = stream.getReader()
  const cancel = (): void => { void reader.cancel(signal?.reason).catch(() => {}) }
  signal?.addEventListener('abort', cancel, { once: true })
  const decoder = new TextDecoder()
  let buffer = ''
  let event: string | undefined
  let data: string[] = []
  const dispatch = (): SseRecord | undefined => {
    if (!data.length) { event = undefined; return undefined }
    const record = { ...(event ? { event } : {}), data: data.join('\n') }
    event = undefined
    data = []
    return record
  }
  try {
    while (true) {
      signal?.throwIfAborted()
      const { value, done } = await reader.read()
      signal?.throwIfAborted()
      buffer += decoder.decode(value, { stream: !done })
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        if (line === '') {
          const record = dispatch()
          if (record) yield record
        } else if (!line.startsWith(':')) {
          const colon = line.indexOf(':')
          const field = colon < 0 ? line : line.slice(0, colon)
          let valueText = colon < 0 ? '' : line.slice(colon + 1)
          if (valueText.startsWith(' ')) valueText = valueText.slice(1)
          if (field === 'event') event = valueText
          else if (field === 'data') data.push(valueText)
        }
      }
      if (done) break
    }
    if (buffer.length) {
      const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    const record = dispatch()
    if (record) yield record
  } finally {
    signal?.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

interface OpenBlock { index: number; kind: 'text' | 'reasoning' | 'tool-call'; text: string; id?: string; name?: string }

function usageOf(response: any): Record<string, number> | undefined {
  const usage = response?.usage
  if (!usage) return undefined
  const cached = Number(usage.input_tokens_details?.cached_tokens ?? 0)
  const aggregateInput = Number(usage.input_tokens ?? 0)
  const result: Record<string, number> = {
    inputTokens: Math.max(0, aggregateInput - cached),
    outputTokens: Number(usage.output_tokens ?? 0),
  }
  const total = Number(usage.total_tokens)
  if (Number.isFinite(total)) result.totalTokens = total
  if (cached > 0) result.cacheReadTokens = cached
  const reasoning = Number(usage.output_tokens_details?.reasoning_tokens ?? 0)
  if (reasoning > 0) result.reasoningTokens = reasoning
  return result
}

export async function* responsesToChunks(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<any> {
  const open = new Map<string, OpenBlock>()
  let nextIndex = 0
  let terminal = false
  let sawTool = false

  const keyFor = (event: any): string => String(event.item_id ?? event.item?.id ?? event.output_index ?? 'default')
  const start = (event: any, kind: OpenBlock['kind'], id?: string, name?: string): OpenBlock => {
    const key = keyFor(event)
    const found = open.get(key)
    if (found) return found
    const block = { index: nextIndex++, kind, text: '', ...(id ? { id } : {}), ...(name ? { name } : {}) }
    open.set(key, block)
    return block
  }
  const close = function* (entry: OpenBlock): Generator<any> {
    let block: DshBlock
    if (entry.kind === 'text') block = { type: 'text', text: entry.text }
    else if (entry.kind === 'reasoning') block = { type: 'reasoning', text: entry.text }
    else block = { type: 'tool-call', id: entry.id ?? '', name: entry.name ?? '', arguments: entry.text }
    yield { type: 'block-end', index: entry.index, block }
  }

  for await (const record of decodeSse(stream, signal)) {
    if (record.data === '[DONE]') continue
    let value: any
    try { value = JSON.parse(record.data) } catch (cause) { throw new Error(malformedSseMessage(record), { cause }) }
    const type = String(value.type ?? record.event ?? '')
    if (type === 'response.output_item.added') {
      const item = value.item ?? {}
      if (item.type === 'message') {
        const entry = start(value, 'text')
        yield { type: 'block-start', index: entry.index, blockType: 'text' }
      } else if (item.type === 'reasoning') {
        const entry = start(value, 'reasoning')
        yield { type: 'block-start', index: entry.index, blockType: 'reasoning' }
      } else if (item.type === 'function_call') {
        sawTool = true
        const entry = start(value, 'tool-call', String(item.call_id ?? item.id ?? ''), String(item.name ?? ''))
        yield { type: 'block-start', index: entry.index, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: entry.index, id: entry.id, name: entry.name, argumentsDelta: '' }
      }
    } else if (type === 'response.output_text.delta') {
      const entry = start(value, 'text')
      const delta = String(value.delta ?? '')
      entry.text += delta
      if (delta) yield { type: 'text-delta', index: entry.index, text: delta }
    } else if (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_text.delta') {
      const entry = start(value, 'reasoning')
      const delta = String(value.delta ?? '')
      entry.text += delta
      if (delta) yield { type: 'reasoning-delta', index: entry.index, text: delta }
    } else if (type === 'response.function_call_arguments.delta') {
      sawTool = true
      const entry = start(value, 'tool-call', String(value.call_id ?? value.item?.call_id ?? ''), value.name ? String(value.name) : undefined)
      const delta = String(value.delta ?? '')
      entry.text += delta
      if (delta) yield { type: 'tool-call-delta', index: entry.index, id: entry.id ?? '', ...(entry.name ? { name: entry.name } : {}), argumentsDelta: delta }
    } else if (type === 'response.output_item.done') {
      const key = keyFor(value)
      const entry = open.get(key)
      if (entry) {
        const finalText = entry.kind === 'tool-call' ? value.item?.arguments : undefined
        if (typeof finalText === 'string' && finalText.startsWith(entry.text) && finalText.length > entry.text.length) {
          const delta = finalText.slice(entry.text.length)
          entry.text = finalText
          yield { type: 'tool-call-delta', index: entry.index, id: entry.id ?? '', ...(entry.name ? { name: entry.name } : {}), argumentsDelta: delta }
        }
        yield* close(entry)
        open.delete(key)
      }
    } else if (type === 'response.completed') {
      for (const entry of open.values()) yield* close(entry)
      open.clear()
      const usage = usageOf(value.response)
      if (usage) yield { type: 'usage', usage }
      yield { type: 'finish', reason: { kind: sawTool ? 'tool-calls' : 'stop' }, replayState: { response: { id: value.response?.id } } }
      terminal = true
    } else if (type === 'response.incomplete') {
      for (const entry of open.values()) yield* close(entry)
      open.clear()
      const usage = usageOf(value.response)
      if (usage) yield { type: 'usage', usage }
      yield { type: 'finish', reason: { kind: 'max-tokens' }, replayState: { response: { id: value.response?.id, status: 'incomplete' } } }
      terminal = true
    } else if (type === 'error' || type === 'response.failed') {
      throw new UpstreamSseError(extractUpstreamFailure(value))
    }
  }
  if (!terminal) throw new Error('ChatGPT Web SSE stream ended before a terminal response event.')
}
