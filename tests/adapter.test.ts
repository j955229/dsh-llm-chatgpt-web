import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import { ChatGptWebAdapter } from '../src/adapter.js'
import { CapabilityCatalog } from '../src/capabilities.js'

const context: any = {
  sessions: { get: (id: string) => id === 'session-1' ? { id, header: { cwd: 'D:\\repo' } } : undefined },
  workspaceRegistry: { list: () => [{ path: 'D:\\repo', sessionIds: ['session-1'] }] },
  sandboxPolicy: { resolve: () => ({ mode: 'workspace-write', workspaceRoot: 'D:\\repo' }) },
  attachments: { readImage: async () => { throw new Error('not used') } },
}

const options = (model: string): any => ({
  provider: 'chatgpt-web',
  model,
  messages: [{ id: 'user-1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'hello' }] }],
  sessionId: 'session-1',
})

function successfulSse(): Response {
  const data = `data: ${JSON.stringify({ type: 'response.completed', response: { id: 'response-1' } })}\n\n`
  return new Response(data, { headers: { 'content-type': 'text/event-stream' } })
}

async function collectOptions(adapter: ChatGptWebAdapter, request: any): Promise<any[]> {
  const chunks = []
  for await (const chunk of adapter.stream(request)) chunks.push(chunk)
  return chunks
}

async function collect(adapter: ChatGptWebAdapter, model: string): Promise<any[]> {
  return collectOptions(adapter, options(model))
}

describe('adapter route validation is independent from discovery', () => {
  it('still posts a known route when account discovery fails closed', async () => {
    const fetcher = vi.fn(async () => successfulSse())
    const adapter = new ChatGptWebAdapter({
      baseURL: 'http://127.0.0.1:17841', networkAccess: false, context, fetch: fetcher,
      capabilityCatalog: new CapabilityCatalog({ configPath: join(tmpdir(), 'missing-dsh-chatgpt-web-config.json') }),
    })
    expect(await adapter.listModels('chatgpt-web')).toEqual([])
    await expect(collect(adapter, 'chatgpt-web/high')).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'finish' })]))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://127.0.0.1:17841/v1/responses')
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ model: 'chatgpt-web/high', reasoning: { effort: 'high' } })
  })

  it('exposes the upstream Bigger Context window to DSH model resolution', async () => {
    const adapter = new ChatGptWebAdapter({
      baseURL: 'http://127.0.0.1:17841', networkAccess: false, context,
      capabilityCatalog: {
        list: async () => [],
        capabilities: async () => ({
          solAvailable: true,
          proAvailable: false,
          experimentalBiggerContext: true,
        }),
      },
    })
    expect(await adapter.resolveModel('chatgpt-web', 'chatgpt-web/high')).toMatchObject({
      id: 'chatgpt-web/high',
      context: { contextWindow: 270_000 },
    })
  })

  it('rejects an unknown route before contacting upstream', async () => {
    const fetcher = vi.fn(async () => successfulSse())
    const adapter = new ChatGptWebAdapter({ baseURL: 'http://127.0.0.1:17841', networkAccess: false, context, fetch: fetcher })
    const error = await collect(adapter, 'chatgpt-web/unknown').catch(value => value as Error & { code?: string })
    expect(error.code).toBe('UNKNOWN_MODEL')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('maps upstream context overflow to the DSH canonical overflow code', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: {
        message: 'This Bigger Context transaction exceeds its experimental ceiling.',
        code: 'context_length_exceeded',
      },
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }))
    const adapter = new ChatGptWebAdapter({
      baseURL: 'http://127.0.0.1:17841', networkAccess: false, context, fetch: fetcher,
      capabilityCatalog: { list: async () => [] },
    })
    const error = await collect(adapter, 'chatgpt-web/high').catch(value => value as Error & { code?: string })
    expect(error.code).toBe(CONTEXT_WINDOW_EXCEEDED_CODE)
    expect(error.message).toContain('context_length_exceeded')
  })

  it('maps SSE context overflow to the DSH canonical overflow code', async () => {
    const data = `data: ${JSON.stringify({
      type: 'response.failed',
      response: { error: { message: 'Context limit exceeded', code: 'context_length_exceeded' } },
    })}\n\n`
    const fetcher = vi.fn(async () => new Response(data, { headers: { 'content-type': 'text/event-stream' } }))
    const adapter = new ChatGptWebAdapter({
      baseURL: 'http://127.0.0.1:17841', networkAccess: false, context, fetch: fetcher,
      capabilityCatalog: { list: async () => [] },
    })
    const error = await collect(adapter, 'chatgpt-web/high').catch(value => value as Error & { code?: string })
    expect(error.code).toBe(CONTEXT_WINDOW_EXCEEDED_CODE)
  })

  it('allows DSH compaction on an isolated tool-free Web turn', async () => {
    const fetcher = vi.fn(async () => successfulSse())
    const adapter = new ChatGptWebAdapter({
      baseURL: 'http://127.0.0.1:17841', networkAccess: false, context, fetch: fetcher,
      capabilityCatalog: { list: async () => [] },
    })
    const request = {
      ...options('chatgpt-web/high'),
      purpose: 'compaction',
      tools: [{ name: 'read_file', description: 'Read', parameters: { type: 'object' } }],
      messages: [
        ...options('chatgpt-web/high').messages,
        {
          id: 'compact-1',
          role: 'user',
          source: { kind: 'plugin', plugin: 'dsh-compaction-basic' },
          content: [{ type: 'text', text: 'Create checkpoint' }],
        },
      ],
    }
    await expect(collectOptions(adapter, request)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'finish' })]))
    expect(fetcher).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
    expect(body.tools).toBeUndefined()
    expect(body.tool_choice).toBeUndefined()
    expect(body.input.some((item: any) => item.role === 'user' && item.content?.[0]?.text === 'Create checkpoint')).toBe(true)
  })

  it('does not fall back when a known but unlisted route gets an upstream error', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'High route is unavailable', code: 'model_not_available' } }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    }))
    const adapter = new ChatGptWebAdapter({
      baseURL: 'http://127.0.0.1:17841', networkAccess: false, context, fetch: fetcher,
      capabilityCatalog: { list: async () => [] },
    })
    expect(await adapter.resolveModel('chatgpt-web', 'chatgpt-web/high')).toMatchObject({ id: 'chatgpt-web/high' })
    const error = await collect(adapter, 'chatgpt-web/high').catch(value => value as Error & { code?: string })
    expect(error.code).toBe('HTTP_503')
    expect(error.message).toContain('High route is unavailable')
    expect(error.message).toContain('model_not_available')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).model).toBe('chatgpt-web/high')
  })
})
