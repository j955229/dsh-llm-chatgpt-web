import { describe, expect, it } from 'vitest'
import { ROUTES, routeFor } from '../src/models.js'

describe('model routes', () => {
  it('keeps all six routes as known metadata', () => expect(ROUTES.map(route => route.id)).toEqual([
    'chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high',
    'chatgpt-web/extra-high', 'chatgpt-web/pro', 'chatgpt-web/luna',
  ]))

  it('keeps Pro on Codex ultra without a silent fallback', () => expect(routeFor('chatgpt-web/pro')).toMatchObject({ id: 'chatgpt-web/pro', effort: 'ultra' }))
  it('keeps Extra High on xhigh without a silent fallback', () => expect(routeFor('chatgpt-web/extra-high')).toMatchObject({ id: 'chatgpt-web/extra-high', effort: 'xhigh' }))
  it('rejects unknown routes', () => expect(() => routeFor('chatgpt-web/unknown')).toThrow(/Unknown ChatGPT Web model route/))
})
