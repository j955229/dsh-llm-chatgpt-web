import { describe, expect, it } from 'vitest'
import { latestRealUserIndex, stableTurnIdentity } from '../src/identity.js'

const user = (id = 'u1') => ({ id, role: 'user' as const, source: { kind: 'user' }, content: [{ type: 'text' as const, text: 'hi' }] })
const pluginUser = (id = 'p1') => ({ id, role: 'user' as const, source: { kind: 'plugin' }, content: [{ type: 'text' as const, text: 'background task' }] })

describe('stable turn identity', () => {
  it('finds the latest genuine user, not tool output', () => {
    const messages: any[] = [user(), { id: 'tool', role: 'user', source: { kind: 'tool' }, content: [] }]
    expect(latestRealUserIndex(messages)).toBe(0)
  })
  it('prefers a genuine user over later plugin-authored context', () => {
    const messages: any[] = [user(), pluginUser()]
    expect(latestRealUserIndex(messages)).toBe(0)
  })
  it('falls back to the latest plugin-authored user for Tavern subagents', () => {
    const messages: any[] = [
      pluginUser('p1'),
      { id: 'skill', role: 'user', source: { kind: 'skill-catalog' }, content: [] },
      pluginUser('p2'),
      { id: 'tool', role: 'user', source: { kind: 'tool' }, content: [] },
    ]
    expect(latestRealUserIndex(messages)).toBe(2)
    expect(stableTurnIdentity('s1', messages).userIndex).toBe(2)
  })
  it('does not treat skill-catalog or tool messages as turn owners', () => {
    const messages: any[] = [
      { id: 'skill', role: 'user', source: { kind: 'skill-catalog' }, content: [] },
      { id: 'tool', role: 'user', source: { kind: 'tool' }, content: [] },
    ]
    expect(latestRealUserIndex(messages)).toBe(-1)
  })
  it('is deterministic', () => expect(stableTurnIdentity('s1', [user()])).toEqual(stableTurnIdentity('s1', [user()])))
  it('changes turn id for a new user message', () => expect(stableTurnIdentity('s1', [user('a')]).turnId).not.toBe(stableTurnIdentity('s1', [user('b')]).turnId))
  it('changes thread id for another session', () => expect(stableTurnIdentity('s1', [user()]).threadId).not.toBe(stableTurnIdentity('s2', [user()]).threadId))
  it('isolates auxiliary session-title identities', () => expect(stableTurnIdentity('s1', [user()]).threadId).not.toBe(stableTurnIdentity('s1', [user()], 'session-title').threadId))
  it('produces UUID-shaped identifiers', () => expect(stableTurnIdentity('s1', [user()]).turnId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab]/))
  it('rejects a history without a user or plugin-authored user', () => expect(() => stableTurnIdentity('s1', [] as any)).toThrow(/user or plugin-authored/))
})
