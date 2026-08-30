import { describe, expect, it } from 'vitest'
import { readBridgeHealth, toolModeProblem } from '../src/health.js'

describe('bridge health', () => {
  it('accepts full mode', () => expect(toolModeProblem({ service: 'codex-chatgpt-web', mode: 'full' })).toBeUndefined())
  it('detects browser-only mode', () => expect(toolModeProblem({ service: 'codex-chatgpt-web', mode: 'browser-only' })).toBe('browser-only'))
  it('detects the wrong service', () => expect(toolModeProblem({ service: 'other', mode: 'full' })).toBe('wrong-service'))
  it('reads healthz at the normalized URL', async () => {
    let url = ''
    const fetcher: any = async (value: string) => { url = value; return new Response(JSON.stringify({ service: 'codex-chatgpt-web', mode: 'full' }), { headers: { 'content-type': 'application/json' } }) }
    expect(await readBridgeHealth('http://127.0.0.1:17841/', fetcher)).toMatchObject({ mode: 'full' })
    expect(url).toBe('http://127.0.0.1:17841/healthz')
  })
  it('rejects unhealthy status', async () => {
    const fetcher: any = async () => new Response('', { status: 503 })
    await expect(readBridgeHealth('http://x', fetcher)).rejects.toThrow('HEALTH_HTTP_503')
  })
  it('reports an offline upstream', async () => {
    const fetcher: any = async () => { throw new Error('ECONNREFUSED') }
    await expect(readBridgeHealth('http://127.0.0.1:17841', fetcher)).rejects.toThrow('ECONNREFUSED')
  })
})
