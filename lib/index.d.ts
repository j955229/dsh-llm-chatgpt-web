import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { ChatGptWebAdapter } from './adapter.js';
export { PROVIDER, ROUTES } from './models.js';
export { serializeRequest } from './serialize.js';
export declare const name = "llm-chatgpt-web";
export declare const inject: string[];
export interface Config {
    baseURL?: string;
    networkAccess?: boolean;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
