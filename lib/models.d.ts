import type { LlmModelInfo, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
export declare const PROVIDER = "chatgpt-web";
export declare const ROUTES: readonly [{
    readonly id: "chatgpt-web/light";
    readonly name: "ChatGPT Web / Instant";
    readonly effort: "low";
    readonly description: "Fastest GPT-5.6 Sol route.";
}, {
    readonly id: "chatgpt-web/medium";
    readonly name: "ChatGPT Web / Medium";
    readonly effort: "medium";
    readonly description: "Balanced GPT-5.6 Sol route.";
}, {
    readonly id: "chatgpt-web/high";
    readonly name: "ChatGPT Web / High";
    readonly effort: "high";
    readonly description: "High-reasoning GPT-5.6 Sol route.";
}, {
    readonly id: "chatgpt-web/extra-high";
    readonly name: "ChatGPT Web / Extra High";
    readonly effort: "xhigh";
    readonly description: "Extra-high reasoning; requires a ChatGPT Pro account.";
}, {
    readonly id: "chatgpt-web/pro";
    readonly name: "ChatGPT Web / Pro";
    readonly effort: "ultra";
    readonly description: "Maximum reasoning; requires a ChatGPT Pro account.";
}, {
    readonly id: "chatgpt-web/luna";
    readonly name: "ChatGPT Web / Luna";
    readonly effort: "low";
    readonly description: "GPT-5.6 Luna route; only available when the account lacks Sol access.";
}];
export type Route = typeof ROUTES[number];
export interface ModelDiscoveryLogger {
    info?(message: string): void;
    warn?(message: string): void;
    error?(message: string): void;
}
export interface ModelCatalogOptions {
    baseURL: string;
    fetch: typeof globalThis.fetch;
    headers?: Record<string, string>;
    logger?: ModelDiscoveryLogger;
    cacheMs?: number;
}
export declare class ModelDiscoveryError extends Error {
    readonly code = "MODEL_DISCOVERY_FAILED";
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
export declare function routeFor(model: string): Route;
export declare function discoverRoutes(baseURL: string, fetchImpl: typeof globalThis.fetch, signal?: AbortSignal, headers?: Record<string, string>, logger?: ModelDiscoveryLogger): Promise<readonly Route[]>;
export declare class ModelCatalog {
    private readonly options;
    private routes;
    private refreshedAt;
    private failure;
    private inFlight;
    constructor(options: ModelCatalogOptions);
    private load;
    list(signal?: AbortSignal): Promise<readonly Route[]>;
    require(model: string, signal?: AbortSignal): Promise<Route>;
}
export declare function modelInfo(route: Route): LlmModelInfo;
export declare function resolvedModel(route: Route): LlmResolvedModelInfo;
