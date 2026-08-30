import { describe, expect, it } from 'vitest'
import { describeHttpFailure, extractUpstreamFailure, formatUpstreamFailure, redactSecrets, safeDetail } from '../src/upstream-error.js'

describe('upstream error safety', () => {
  it('preserves an HTTP 400 JSON message and upstream code', async () => {
    const response = new Response(JSON.stringify({ error: { message: 'Extra High is unavailable', code: 'model_not_available' } }), {
      status: 400, statusText: 'Bad Request',
    })
    expect(await describeHttpFailure(response)).toEqual({
      message: 'HTTP 400 Bad Request: Extra High is unavailable', code: 'model_not_available',
    })
  })

  it('preserves a bounded HTTP 500 text body', async () => {
    const response = new Response('ChatGPT response DOM disappeared while the browser turn was active', {
      status: 500, statusText: 'Internal Server Error',
    })
    expect(formatUpstreamFailure(await describeHttpFailure(response))).toContain('ChatGPT response DOM disappeared')
  })

  it('extracts a nested terminal failure reason and code', () => {
    expect(extractUpstreamFailure({ response: { error: { message: 'DOM changed', code: 'browser_dom_changed' } } })).toEqual({
      message: 'DOM changed', code: 'browser_dom_changed',
    })
  })

  it('redacts authorization, API keys, cookies, tunnel credentials, and MCP tokens', () => {
    const source = 'Authorization: Bearer abc.def token=secret api_key=sk-123456789 cookie=session-value tunnel_credential=tunnel-secret mcp_turn_token=turn-secret'
    const safe = redactSecrets(source)
    for (const secret of ['abc.def', 'secret', 'sk-123456789', 'session-value', 'tunnel-secret', 'turn-secret']) expect(safe).not.toContain(secret)
    expect(safe).toContain('[REDACTED]')
  })

  it('redacts secrets inside JSON-shaped upstream messages', () => {
    const safe = safeDetail(JSON.stringify({ error: { message: 'bad', authorization: 'Bearer hidden', mcp_turn_token: 'turn-hidden' } }))
    expect(safe).not.toContain('hidden')
    expect(safe).toContain('[REDACTED]')
  })
})
