import { describe, expect, it } from 'vitest'
import { ROUTES, resolvedModel, routeContextWindow, routeFor } from '../src/models.js'

describe('model routes', () => {
  it('keeps all six routes as known metadata', () => expect(ROUTES.map(route => route.id)).toEqual([
    'chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high',
    'chatgpt-web/extra-high', 'chatgpt-web/pro', 'chatgpt-web/luna',
  ]))

  it('keeps Pro on Codex ultra without a silent fallback', () => expect(routeFor('chatgpt-web/pro')).toMatchObject({ id: 'chatgpt-web/pro', effort: 'ultra' }))
  it('keeps Extra High on xhigh without a silent fallback', () => expect(routeFor('chatgpt-web/extra-high')).toMatchObject({ id: 'chatgpt-web/extra-high', effort: 'xhigh' }))
  it('rejects unknown routes', () => expect(() => routeFor('chatgpt-web/unknown')).toThrow(/Unknown ChatGPT Web model route/))

  it('matches upstream Plus context windows', () => {
    const capabilities = { proAvailable: false, experimentalBiggerContext: false }
    expect(routeContextWindow(routeFor('chatgpt-web/light'), capabilities)).toBe(41_000)
    expect(routeContextWindow(routeFor('chatgpt-web/medium'), capabilities)).toBe(90_000)
    expect(routeContextWindow(routeFor('chatgpt-web/high'), capabilities)).toBe(90_000)
  })

  it('matches the upstream three-part Bigger Context ceiling', () => {
    const capabilities = { proAvailable: false, experimentalBiggerContext: true }
    expect(routeContextWindow(routeFor('chatgpt-web/high'), capabilities)).toBe(270_000)
    expect(resolvedModel(routeFor('chatgpt-web/high'), capabilities).context?.contextWindow).toBe(270_000)
  })

  it('matches upstream Pro and Luna context windows', () => {
    const pro = { proAvailable: true, experimentalBiggerContext: false }
    expect(routeContextWindow(routeFor('chatgpt-web/high'), pro)).toBe(111_193)
    expect(routeContextWindow(routeFor('chatgpt-web/pro'), pro)).toBe(112_193)
    expect(routeContextWindow(routeFor('chatgpt-web/luna'), pro)).toBe(1_050_000)
  })
})
