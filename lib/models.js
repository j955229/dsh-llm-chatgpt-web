export const PROVIDER = 'chatgpt-web';
export const ROUTES = [
    { id: 'chatgpt-web/light', name: 'ChatGPT Web / Instant', effort: 'low', description: 'Fastest GPT-5.6 Sol route.' },
    { id: 'chatgpt-web/medium', name: 'ChatGPT Web / Medium', effort: 'medium', description: 'Balanced GPT-5.6 Sol route.' },
    { id: 'chatgpt-web/high', name: 'ChatGPT Web / High', effort: 'high', description: 'High-reasoning GPT-5.6 Sol route.' },
    { id: 'chatgpt-web/extra-high', name: 'ChatGPT Web / Extra High', effort: 'xhigh', description: 'Extra-high reasoning; requires a ChatGPT Pro account.' },
    { id: 'chatgpt-web/pro', name: 'ChatGPT Web / Pro', effort: 'ultra', description: 'Maximum reasoning; requires a ChatGPT Pro account.' },
    { id: 'chatgpt-web/luna', name: 'ChatGPT Web / Luna', effort: 'low', description: 'GPT-5.6 Luna route; only available when the account lacks Sol access.' },
];
const PLUS_INSTANT_CONTEXT_WINDOW = 41_000;
const PLUS_REASONING_CONTEXT_WINDOW = 90_000;
const CHATGPT_WEB_PLATFORM_RESERVE_TOKENS = 8_192;
const PRO_STANDARD_CONTEXT_WINDOW = 103_000 + CHATGPT_WEB_PLATFORM_RESERVE_TOKENS + 1;
const PRO_MODEL_CONTEXT_WINDOW = 104_000 + CHATGPT_WEB_PLATFORM_RESERVE_TOKENS + 1;
const LUNA_CONTEXT_WINDOW = 1_050_000;
const BIGGER_CONTEXT_MULTIPLIER = 3;
export function routeFor(model) {
    const route = ROUTES.find(item => item.id === model);
    if (!route)
        throw new Error(`Unknown ChatGPT Web model route: ${model}`);
    return route;
}
export function routeContextWindow(route, capabilities) {
    if (route.id === 'chatgpt-web/luna')
        return LUNA_CONTEXT_WINDOW;
    const baseWindow = capabilities.proAvailable
        ? route.id === 'chatgpt-web/pro' ? PRO_MODEL_CONTEXT_WINDOW : PRO_STANDARD_CONTEXT_WINDOW
        : route.id === 'chatgpt-web/light' ? PLUS_INSTANT_CONTEXT_WINDOW : PLUS_REASONING_CONTEXT_WINDOW;
    return capabilities.experimentalBiggerContext
        ? baseWindow * BIGGER_CONTEXT_MULTIPLIER
        : baseWindow;
}
export function modelInfo(route) {
    return { provider: PROVIDER, id: route.id, name: route.name, description: route.description, inputModalities: ['text', 'image'] };
}
export function resolvedModel(route, capabilities) {
    return {
        ...modelInfo(route),
        ...(capabilities ? { context: { contextWindow: routeContextWindow(route, capabilities) } } : {}),
        reasoning: { efforts: [{ id: route.effort, name: route.effort }], defaultEffort: route.effort },
    };
}
