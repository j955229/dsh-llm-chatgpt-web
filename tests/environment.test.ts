import { describe, expect, it } from 'vitest'
import { metadataSandbox, renderEnvironment, resolveEnvironment } from '../src/environment.js'

describe('environment context', () => {
  const session = { id: 's1', header: { cwd: 'D:\\work&x' } }
  const ctx: any = {
    sessions: { get: () => session },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write', workspaceRoot: 'D:\\work&x' }) },
    workspaceRegistry: { list: () => [{ path: 'D:\\work&x', sessionIds: ['s1'] }, { path: 'D:\\other', sessionIds: [] }] },
  }
  it('uses public session and policy context', () => expect(resolveEnvironment(ctx, 's1', false)).toEqual({ cwd: 'D:\\work&x', workspaceRoots: ['D:\\work&x'], sandboxMode: 'workspace-write', networkAccess: false }))
  it('escapes XML', () => expect(renderEnvironment(resolveEnvironment(ctx, 's1', false))).toContain('D:\\work&amp;x'))
  it('renders network state', () => expect(renderEnvironment({ ...resolveEnvironment(ctx, 's1', true), networkAccess: true })).toContain('<network_access>enabled</network_access>'))
  it('maps danger-full-access to Codex none', () => expect(metadataSandbox('danger-full-access')).toBe('none'))
  it('preserves read-only metadata', () => expect(metadataSandbox('read-only')).toBe('read-only'))
  it('rejects an unknown session', () => expect(() => resolveEnvironment({ ...ctx, sessions: { get: () => undefined } }, 'missing', false)).toThrow(/not found/))
})
