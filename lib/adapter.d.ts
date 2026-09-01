import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { AccountCapabilities } from './capabilities.js';
import type { Route } from './models.js';
import type { RuntimeContext } from './types.js';
export interface AdapterOptions {
    baseURL: string;
    networkAccess: boolean;
    context: RuntimeContext;
    fetch?: typeof globalThis.fetch;
    logger?: {
        info?(message: string): void;
        warn?(message: string): void;
        error?(message: string): void;
    };
    capabilityCatalog?: {
        list(signal?: AbortSignal): Promise<readonly Route[]>;
        capabilities?(signal?: AbortSignal): Promise<AccountCapabilities | undefined>;
    };
}
export declare class ChatGptWebAdapter extends LlmAdapter {
    private readonly options;
    private readonly fetchImpl;
    private readonly catalog;
    constructor(options: AdapterOptions);
    providerInfo(provider: string): LlmProviderInfo;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    private assertToolMode;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
