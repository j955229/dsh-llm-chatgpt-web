import { describe, expect, it } from 'vitest'
import { serializeRequest } from '../src/serialize.js'

const attachments: any = { readImage: async (ref: any) => ({ ref, data: new Uint8Array([1, 2, 3]) }) }
const environment: any = { cwd: 'D:\\repo', workspaceRoots: ['D:\\repo'], sandboxMode: 'workspace-write', networkAccess: false }
const message = (content: any[], id = 'user-1'): any => ({ id, role: 'user', source: { kind: 'user' }, content })
const base = (messages: any[]) => ({ model: 'chatgpt-web/high', messages, sessionId: 'session-1', environment, attachments })

describe('native request serialization', () => {
  it('uses the route slug and fixed effort', async () => {
    const result = await serializeRequest(base([message([{ type: 'text', text: 'hello' }])]))
    expect(result.body).toMatchObject({ model: 'chatgpt-web/high', reasoning: { effort: 'high' }, stream: true, store: false })
  })
  it('injects environment immediately before the real user', async () => {
    const result = await serializeRequest(base([message([{ type: 'text', text: 'hello' }])]))
    const input = result.body.input as any[]
    expect(input[0].content[0].text).toContain('<environment_context>')
    expect(input[1].content[0].text).toBe('hello')
  })
  it('tags environment and current user with the same turn id', async () => {
    const result = await serializeRequest(base([message([{ type: 'text', text: 'hello' }])]))
    const input = result.body.input as any[]
    expect(input[0].internal_chat_message_metadata_passthrough).toEqual(input[1].internal_chat_message_metadata_passthrough)
  })
  it('puts native metadata inside x-codex-turn-metadata as JSON', async () => {
    const result = await serializeRequest(base([message([{ type: 'text', text: 'hello' }])]))
    const raw = (result.body.client_metadata as any)['x-codex-turn-metadata']
    expect(JSON.parse(raw)).toMatchObject({ thread_id: result.threadId, turn_id: result.turnId, request_kind: 'turn', sandbox: 'workspace-write' })
  })
  it('serializes image attachments as data URLs', async () => {
    const ref = { attachmentId: 'a', mediaType: 'image/png', bytes: 3, width: 1, height: 1 }
    const result = await serializeRequest(base([message([{ type: 'image', attachment: ref }])]))
    expect((result.body.input as any[])[1].content[0].image_url).toBe('data:image/png;base64,AQID')
  })
  it('serializes function definitions', async () => {
    const result = await serializeRequest({ ...base([message([{ type: 'text', text: 'x' }])]), tools: [{ name: 'read_file', description: 'Read', parameters: { type: 'object' } }] })
    expect(result.body).toMatchObject({ tool_choice: 'auto', parallel_tool_calls: true, tools: [{ type: 'function', name: 'read_file' }] })
  })
  it('serializes system and assistant text without losing either', async () => {
    const messages: any[] = [
      { id: 'sys', role: 'system', source: { kind: 'plugin', plugin: 'x' }, content: [{ type: 'text', text: 'policy' }] },
      message([{ type: 'text', text: 'question' }]),
      { id: 'assistant', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: 'answer' }] },
      message([{ type: 'text', text: 'again' }], 'user-2'),
    ]
    const input = (await serializeRequest({ ...base(messages), system: 'root instructions' })).body.input as any[]
    expect(input.some(item => item.role === 'developer' && item.content[0].text === 'policy')).toBe(true)
    expect(input.some(item => item.role === 'assistant' && item.content[0].text === 'answer')).toBe(true)
  })
  it('serializes prior reasoning as a native reasoning item', async () => {
    const messages: any[] = [message([{ type: 'text', text: 'q' }]), { id: 'a1', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'reasoning', text: 'careful' }, { type: 'text', text: 'a' }] }, message([{ type: 'text', text: 'q2' }], 'u2')]
    const input = (await serializeRequest(base(messages))).body.input as any[]
    expect(input.some(item => item.type === 'reasoning' && item.summary[0].text === 'careful')).toBe(true)
  })
  it('serializes assistant tool calls and tool outputs', async () => {
    const messages: any[] = [message([{ type: 'text', text: 'x' }]), { id: 'a1', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'tool-call', id: 'call1', name: 'read_file', arguments: '{"p":"a"}' }] }, { id: 'r1', role: 'user', source: { kind: 'tool' }, content: [{ type: 'tool-result', toolCallId: 'call1', content: [{ type: 'text', text: 'ok' }] }] }]
    const input = (await serializeRequest(base(messages))).body.input as any[]
    expect(input.some(item => item.type === 'function_call' && item.call_id === 'call1')).toBe(true)
    expect(input.some(item => item.type === 'function_call_output' && item.output === 'ok')).toBe(true)
  })
  it('keeps the same turn on a tool continuation', async () => {
    const first = await serializeRequest(base([message([{ type: 'text', text: 'x' }])]))
    const second = await serializeRequest(base([message([{ type: 'text', text: 'x' }]), { id: 'r', role: 'user', source: { kind: 'tool' }, content: [] }]))
    expect(second.turnId).toBe(first.turnId)
  })
  it('rejects unknown routes', async () => await expect(serializeRequest({ ...base([message([{ type: 'text', text: 'x' }])]), model: 'bad' })).rejects.toThrow(/Unknown/))
})
