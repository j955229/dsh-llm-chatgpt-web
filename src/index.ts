import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ChatGptWebAdapter } from './adapter.js'
import { PROVIDER } from './models.js'
import type { RuntimeContext } from './types.js'

export { ChatGptWebAdapter } from './adapter.js'
export { PROVIDER, ROUTES } from './models.js'
export { serializeRequest } from './serialize.js'

export const name = 'llm-chatgpt-web'
export const inject = ['llm', 'sessions', 'workspaceRegistry', 'sandboxPolicy', 'attachments']

export interface Config {
  baseURL?: string
  networkAccess?: boolean
}

export const Config: z<Config> = z.object({
  baseURL: z.string().default('http://127.0.0.1:17841'),
  networkAccess: z.boolean().default(false),
})

export function apply(ctx: Context, config: Config): void {
  const adapter = new ChatGptWebAdapter({
    baseURL: config.baseURL ?? 'http://127.0.0.1:17841',
    networkAccess: config.networkAccess ?? false,
    context: ctx as unknown as RuntimeContext,
    logger: ctx.logger,
  })
  ;(ctx as any).llm.registerAdapter([PROVIDER], adapter)
  ctx.logger.info('llm-chatgpt-web: registered provider chatgpt-web with dynamic bridge model discovery')
  void adapter.listModels(PROVIDER)
}
