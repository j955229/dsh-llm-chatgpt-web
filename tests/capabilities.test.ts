import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CapabilityCatalog, capabilityConfigPath, readAccountCapabilities, routesForCapabilities } from '../src/capabilities.js'

const temporaryDirectories: string[] = []

async function temporaryConfig(value: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-chatgpt-web-capabilities-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'config.json')
  await writeFile(path, value, 'utf8')
  return path
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('account capability discovery', () => {
  it.each([
    [{ solAvailable: false, proAvailable: false }, ['chatgpt-web/luna']],
    [{ solAvailable: true, proAvailable: false }, ['chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high']],
    [{ solAvailable: true, proAvailable: true }, ['chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high', 'chatgpt-web/extra-high', 'chatgpt-web/pro']],
  ] as const)('maps %o to the expected routes', (capabilities, expected) => {
    expect(routesForCapabilities(capabilities).map(route => route.id)).toEqual(expected)
  })

  it('rejects contradictory capability flags', () => {
    expect(() => routesForCapabilities({ solAvailable: false, proAvailable: true })).toThrow(/contradictory/)
  })

  it('uses CODEX_CHATGPT_WEB_HOME before the default user directory', () => {
    expect(capabilityConfigPath({ CODEX_CHATGPT_WEB_HOME: 'D:\\custom-launcher' }, 'C:\\Users\\test')).toBe('D:\\custom-launcher\\config.json')
    expect(capabilityConfigPath({}, 'C:\\Users\\test')).toBe('C:\\Users\\test\\.codex-chatgpt-web\\config.json')
  })

  it('fails closed when the config is missing', async () => {
    const messages: string[] = []
    const catalog = new CapabilityCatalog({ configPath: join(tmpdir(), 'definitely-missing-chatgpt-web-config.json'), logger: { warn: message => messages.push(message) } })
    expect(await catalog.list()).toEqual([])
    expect(messages.join('\n')).toContain('failed closed')
  })

  it('fails closed for malformed JSON', async () => {
    const path = await temporaryConfig('{bad')
    expect(await new CapabilityCatalog({ configPath: path }).list()).toEqual([])
  })

  it('does not leak unrelated config secrets through errors or logs', async () => {
    const secret = 'ghp_DO_NOT_LEAK_THIS_TOKEN'
    const path = await temporaryConfig(JSON.stringify({ solAvailable: 'yes', proAvailable: false, controlToken: secret, cookies: secret }))
    const messages: string[] = []
    const catalog = new CapabilityCatalog({ configPath: path, logger: { warn: message => messages.push(message) } })
    expect(await catalog.list()).toEqual([])
    await expect(readAccountCapabilities(path)).rejects.not.toThrow(secret)
    expect(messages.join('\n')).not.toContain(secret)
  })
})
