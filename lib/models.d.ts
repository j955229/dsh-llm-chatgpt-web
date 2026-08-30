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
export declare function routeFor(model: string): Route;
export declare function modelInfo(route: Route): LlmModelInfo;
export declare function resolvedModel(route: Route): LlmResolvedModelInfo;
