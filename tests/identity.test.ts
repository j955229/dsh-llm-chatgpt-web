import { describe, expect, it } from 'vitest'
import { latestRealUserIndex, stableTurnIdentity } from '../src/identity.js'

const user = (id = 'u1') => ({ id, role: 'user' as const, source: { kind: 'user' }, content: [{ type: 'text' as const, text: 'hi' }] })

describe('stable turn identity', () => {
  it('finds the latest genuine user, not tool output', () => {
    const messages: any[] = [user(), { id: 'tool', role: 'user', source: { kind: 'tool' }, content: [] }]
    expect(latestRealUserIndex(messages)).toBe(0)
  })
  it('is deterministic', () => expect(stableTurnIdentity('s1', [user()])).toEqual(stableTurnIdentity('s1', [user()])))
  it('changes turn id for a new user message', () => expect(stableTurnIdentity('s1', [user('a')]).turnId).not.toBe(stableTurnIdentity('s1', [user('b')]).turnId))
  it('changes thread id for another session', () => expect(stableTurnIdentity('s1', [user()]).threadId).not.toBe(stableTurnIdentity('s2', [user()]).threadId))
  it('isolates auxiliary session-title identities', () => expect(stableTurnIdentity('s1', [user()]).threadId).not.toBe(stableTurnIdentity('s1', [user()], 'session-title').threadId))
  it('produces UUID-shaped identifiers', () => expect(stableTurnIdentity('s1', [user()]).turnId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab]/))
  it('rejects a history without a real user', () => expect(() => stableTurnIdentity('s1', [] as any)).toThrow(/genuine/))
})
