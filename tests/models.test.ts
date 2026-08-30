import { describe, expect, it } from 'vitest'
import { ModelCatalog, ROUTES, routeFor } from '../src/models.js'

const response = (slugs: string[]) => new Response(JSON.stringify({ models: slugs.map(slug => ({ slug })) }), {
  headers: { 'content-type': 'application/json' },
})

function catalog(fetcher: typeof fetch, messages: string[] = []): ModelCatalog {
  return new ModelCatalog({
    baseURL: 'http://127.0.0.1:17841/', fetch: fetcher, cacheMs: 60_000,
    logger: {
      info: message => messages.push(`info:${message}`),
      warn: message => messages.push(`warn:${message}`),
      error: message => messages.push(`error:${message}`),
    },
  })
}

describe('model catalog', () => {
  it('keeps all six routes only as known metadata', () => expect(ROUTES.map(route => route.id)).toEqual([
    'chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high',
    'chatgpt-web/extra-high', 'chatgpt-web/pro', 'chatgpt-web/luna',
  ]))

  it('exposes only Luna when the bridge returns Luna', async () => {
    const routes = await catalog(async () => response(['chatgpt-web/luna'])).list()
    expect(routes.map(route => route.id)).toEqual(['chatgpt-web/luna'])
  })

  it('exposes only the three Plus Sol routes', async () => {
    const routes = await catalog(async () => response(['chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high'])).list()
    expect(routes.map(route => route.id)).toEqual(['chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high'])
  })

  it('exposes all five Pro Sol routes', async () => {
    const routes = await catalog(async () => response([
      'chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high',
      'chatgpt-web/extra-high', 'chatgpt-web/pro',
    ])).list()
    expect(routes.map(route => route.id)).toEqual([
      'chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high',
      'chatgpt-web/extra-high', 'chatgpt-web/pro',
    ])
  })

  it('ignores unknown ChatGPT Web slugs and logs the policy', async () => {
    const messages: string[] = []
    const routes = await catalog(async () => response(['chatgpt-web/high', 'chatgpt-web/future-tier']), messages).list()
    expect(routes.map(route => route.id)).toEqual(['chatgpt-web/high'])
    expect(messages.some(message => message.includes('ignoring unknown bridge model slug chatgpt-web/future-tier'))).toBe(true)
  })

  it('filters native non-ChatGPT-Web models', async () => {
    const routes = await catalog(async () => response(['gpt-5.6-sol', 'chatgpt-web/medium', 'gpt-5.4-mini'])).list()
    expect(routes.map(route => route.id)).toEqual(['chatgpt-web/medium'])
  })

  it('fails closed when /v1/models cannot connect', async () => {
    const messages: string[] = []
    const routes = await catalog(async () => { throw new Error('ECONNREFUSED') }, messages).list()
    expect(routes).toEqual([])
    expect(messages.some(message => message.includes('model discovery failed closed'))).toBe(true)
  })

  it('fails closed for malformed /v1/models JSON', async () => {
    const routes = await catalog(async () => new Response('{bad', { headers: { 'content-type': 'application/json' } })).list()
    expect(routes).toEqual([])
  })

  it('fails closed for a malformed model entry', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ models: [{ id: 'chatgpt-web/high' }] }))
    expect(await catalog(fetcher).list()).toEqual([])
  })

  it('never serves a stale catalog after a failed refresh', async () => {
    let online = true
    const instance = catalog(async () => online ? response(['chatgpt-web/high']) : Promise.reject(new Error('offline')))
    expect((await instance.list()).map(route => route.id)).toEqual(['chatgpt-web/high'])
    online = false
    expect(await instance.list()).toEqual([])
    await expect(instance.require('chatgpt-web/high')).rejects.toThrow(/offline|discovery/i)
  })

  it('keeps Pro on Codex ultra without a silent fallback', () => expect(routeFor('chatgpt-web/pro')).toMatchObject({ id: 'chatgpt-web/pro', effort: 'ultra' }))
  it('keeps Extra High on xhigh without a silent fallback', () => expect(routeFor('chatgpt-web/extra-high')).toMatchObject({ id: 'chatgpt-web/extra-high', effort: 'xhigh' }))
})
