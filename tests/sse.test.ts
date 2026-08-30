import { describe, expect, it } from 'vitest'
import { decodeSse, responsesToChunks } from '../src/sse.js'

function stream(text: string, cuts: number[] = []): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  let offset = 0
  return new ReadableStream({ pull(controller) { const size = cuts.shift() ?? bytes.length; controller.enqueue(bytes.slice(offset, offset += size)); if (offset >= bytes.length) controller.close() } })
}
const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`

describe('SSE parser', () => {
  it('handles chunk boundaries and CRLF', async () => {
    const records = []
    for await (const record of decodeSse(stream('data: one\r\ndata: two\r\n\r\n', [1, 2, 3, 4]))) records.push(record)
    expect(records).toEqual([{ data: 'one\ntwo' }])
  })
  it('ignores comments', async () => {
    const records = []
    for await (const record of decodeSse(stream(': ping\n\ndata: ok\n\n'))) records.push(record)
    expect(records).toEqual([{ data: 'ok' }])
  })
  it('maps text, usage and finish', async () => {
    const source = event({ type: 'response.output_item.added', output_index: 0, item: { id: 'm1', type: 'message' } }) + event({ type: 'response.output_text.delta', item_id: 'm1', delta: 'Hi' }) + event({ type: 'response.output_item.done', item: { id: 'm1', type: 'message' } }) + event({ type: 'response.completed', response: { id: 'r1', usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12, input_tokens_details: { cached_tokens: 3 } } } }) + 'data: [DONE]\n\n'
    const chunks = []
    for await (const chunk of responsesToChunks(stream(source))) chunks.push(chunk)
    expect(chunks).toContainEqual({ type: 'text-delta', index: 0, text: 'Hi' })
    expect(chunks).toContainEqual({ type: 'usage', usage: { inputTokens: 7, outputTokens: 2, totalTokens: 12, cacheReadTokens: 3 } })
    expect(chunks.at(-1).reason.kind).toBe('stop')
  })
  it('maps reasoning deltas', async () => {
    const source = event({ type: 'response.output_item.added', output_index: 0, item: { id: 'r', type: 'reasoning' } }) + event({ type: 'response.reasoning_summary_text.delta', item_id: 'r', delta: 'think' }) + event({ type: 'response.output_item.done', item: { id: 'r' } }) + event({ type: 'response.completed', response: {} })
    const chunks = []; for await (const chunk of responsesToChunks(stream(source))) chunks.push(chunk)
    expect(chunks).toContainEqual({ type: 'reasoning-delta', index: 0, text: 'think' })
  })
  it('maps tool calls and a tool finish reason', async () => {
    const source = event({ type: 'response.output_item.added', output_index: 0, item: { id: 'f', type: 'function_call', call_id: 'c1', name: 'read' } }) + event({ type: 'response.function_call_arguments.delta', item_id: 'f', delta: '{"p":' }) + event({ type: 'response.output_item.done', item: { id: 'f', arguments: '{"p":"x"}' } }) + event({ type: 'response.completed', response: {} })
    const chunks = []; for await (const chunk of responsesToChunks(stream(source))) chunks.push(chunk)
    expect(chunks.some((x: any) => x.type === 'tool-call-delta' && x.argumentsDelta === '"x"}')).toBe(true)
    expect(chunks.at(-1).reason.kind).toBe('tool-calls')
  })
  it('maps incomplete responses to max-tokens', async () => {
    const chunks = []; for await (const chunk of responsesToChunks(stream(event({ type: 'response.incomplete', response: {} })))) chunks.push(chunk)
    expect(chunks.at(-1).reason.kind).toBe('max-tokens')
  })
  it('rejects provider errors', async () => {
    const collect = async () => { for await (const _ of responsesToChunks(stream(event({ type: 'error', error: { message: 'bad' } })))) void _ }
    await expect(collect()).rejects.toThrow('bad')
  })
  it('preserves a nested SSE terminal failure message and code', async () => {
    const collect = async () => { for await (const _ of responsesToChunks(stream(event({ type: 'response.failed', response: { error: { message: 'ChatGPT response DOM disappeared', code: 'dom_disappeared' } } })))) void _ }
    await expect(collect()).rejects.toThrow('ChatGPT response DOM disappeared (upstream code: dom_disappeared)')
  })
  it('redacts secrets from SSE terminal errors', async () => {
    const collect = async () => { for await (const _ of responsesToChunks(stream(event({ type: 'error', error: { message: 'Authorization: Bearer top-secret mcp_turn_token=turn-secret' } })))) void _ }
    const error = await collect().catch(value => value as Error)
    expect(error.message).toContain('[REDACTED]')
    expect(error.message).not.toContain('top-secret')
    expect(error.message).not.toContain('turn-secret')
  })
  it('rejects a missing terminal event', async () => {
    const collect = async () => { for await (const _ of responsesToChunks(stream(event({ type: 'response.output_text.delta', delta: 'x' })))) void _ }
    await expect(collect()).rejects.toThrow(/terminal/)
  })
  it('rejects malformed SSE JSON', async () => {
    const collect = async () => { for await (const _ of responsesToChunks(stream('data: {bad}\n\n'))) void _ }
    await expect(collect()).rejects.toThrow(/Malformed JSON.*safe raw event: \{bad\}/)
  })
  it('cancels a blocked stream immediately', async () => {
    const controller = new AbortController()
    const blocked = new ReadableStream<Uint8Array>({ pull() {} })
    const collect = async () => { for await (const _ of decodeSse(blocked, controller.signal)) void _ }
    const pending = collect()
    controller.abort(new Error('cancelled'))
    await expect(pending).rejects.toThrow('cancelled')
  })
  it('preserves AbortError semantics', async () => {
    const controller = new AbortController()
    const blocked = new ReadableStream<Uint8Array>({ pull() {} })
    const collect = async () => { for await (const _ of decodeSse(blocked, controller.signal)) void _ }
    const pending = collect()
    controller.abort()
    const error = await pending.catch(value => value as Error)
    expect(error.name).toBe('AbortError')
  })
})
