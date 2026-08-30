import z from '@deepseek-ai/schemastery';
import { ChatGptWebAdapter } from './adapter.js';
import { PROVIDER } from './models.js';
export { ChatGptWebAdapter } from './adapter.js';
export { CapabilityCatalog, capabilityConfigPath, readAccountCapabilities, routesForCapabilities } from './capabilities.js';
export { PROVIDER, ROUTES } from './models.js';
export { serializeRequest } from './serialize.js';
export const name = 'llm-chatgpt-web';
export const inject = ['llm', 'sessions', 'workspaceRegistry', 'sandboxPolicy', 'attachments'];
export const Config = z.object({
    baseURL: z.string().default('http://127.0.0.1:17841'),
    networkAccess: z.boolean().default(false),
});
export function apply(ctx, config) {
    const adapter = new ChatGptWebAdapter({
        baseURL: config.baseURL ?? 'http://127.0.0.1:17841',
        networkAccess: config.networkAccess ?? false,
        context: ctx,
        logger: ctx.logger,
    });
    ctx.llm.registerAdapter([PROVIDER], adapter);
    ctx.logger.info('llm-chatgpt-web: registered provider chatgpt-web with account capability discovery');
    void adapter.listModels(PROVIDER);
}
