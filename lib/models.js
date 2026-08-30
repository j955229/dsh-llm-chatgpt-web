import { describeHttpFailure, formatUpstreamFailure, safeCause, safeDetail } from './upstream-error.js';
export const PROVIDER = 'chatgpt-web';
export const ROUTES = [
    { id: 'chatgpt-web/light', name: 'ChatGPT Web / Instant', effort: 'low', description: 'Fastest GPT-5.6 Sol route.' },
    { id: 'chatgpt-web/medium', name: 'ChatGPT Web / Medium', effort: 'medium', description: 'Balanced GPT-5.6 Sol route.' },
    { id: 'chatgpt-web/high', name: 'ChatGPT Web / High', effort: 'high', description: 'High-reasoning GPT-5.6 Sol route.' },
    { id: 'chatgpt-web/extra-high', name: 'ChatGPT Web / Extra High', effort: 'xhigh', description: 'Extra-high reasoning; requires a ChatGPT Pro account.' },
    { id: 'chatgpt-web/pro', name: 'ChatGPT Web / Pro', effort: 'ultra', description: 'Maximum reasoning; requires a ChatGPT Pro account.' },
    { id: 'chatgpt-web/luna', name: 'ChatGPT Web / Luna', effort: 'low', description: 'GPT-5.6 Luna route; only available when the account lacks Sol access.' },
];
export class ModelDiscoveryError extends Error {
    code = 'MODEL_DISCOVERY_FAILED';
    constructor(message, options) {
        super(message, options);
        this.name = 'ModelDiscoveryError';
    }
}
export function routeFor(model) {
    const route = ROUTES.find(item => item.id === model);
    if (!route)
        throw new Error(`Unknown ChatGPT Web model route: ${model}`);
    return route;
}
export async function discoverRoutes(baseURL, fetchImpl, signal, headers = {}, logger) {
    signal?.throwIfAborted();
    let response;
    try {
        response = await fetchImpl(`${baseURL.replace(/\/+$/, '')}/v1/models`, { method: 'GET', signal, headers });
    }
    catch (cause) {
        if (signal?.aborted)
            throw signal.reason;
        throw new ModelDiscoveryError(`Could not connect to codex-chatgpt-web model discovery: ${safeDetail(cause)}`, { cause: safeCause(cause) });
    }
    if (!response.ok) {
        const failure = await describeHttpFailure(response);
        throw new ModelDiscoveryError(`codex-chatgpt-web model discovery failed: ${formatUpstreamFailure(failure)}`);
    }
    let value;
    try {
        value = await response.json();
    }
    catch (cause) {
        throw new ModelDiscoveryError(`codex-chatgpt-web /v1/models returned malformed JSON: ${safeDetail(cause)}`, { cause: safeCause(cause) });
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.models)) {
        throw new ModelDiscoveryError('codex-chatgpt-web /v1/models response is missing a models array.');
    }
    const available = new Set();
    for (const item of value.models) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.slug !== 'string') {
            throw new ModelDiscoveryError('codex-chatgpt-web /v1/models contains a malformed model entry.');
        }
        const slug = String(item.slug);
        if (!slug.startsWith(`${PROVIDER}/`))
            continue;
        if (!ROUTES.some(route => route.id === slug)) {
            logger?.warn?.(`llm-chatgpt-web: ignoring unknown bridge model slug ${safeDetail(slug, 200)}`);
            continue;
        }
        available.add(slug);
    }
    return ROUTES.filter(route => available.has(route.id));
}
export class ModelCatalog {
    options;
    routes = [];
    refreshedAt = 0;
    failure;
    inFlight;
    constructor(options) {
        this.options = options;
    }
    async load(signal, force = false) {
        signal?.throwIfAborted();
        const cacheMs = this.options.cacheMs ?? 30_000;
        if (!force && this.refreshedAt && Date.now() - this.refreshedAt < cacheMs) {
            if (this.failure)
                throw this.failure;
            return this.routes;
        }
        if (this.inFlight)
            return this.inFlight;
        this.inFlight = discoverRoutes(this.options.baseURL, this.options.fetch, signal, this.options.headers, this.options.logger).then(routes => {
            this.routes = routes;
            this.failure = undefined;
            this.refreshedAt = Date.now();
            this.options.logger?.info?.(`llm-chatgpt-web: discovered ${routes.length} available ChatGPT Web model route(s)`);
            return routes;
        }).catch(cause => {
            const failure = cause instanceof ModelDiscoveryError
                ? cause
                : new ModelDiscoveryError(safeDetail(cause), { cause: safeCause(cause) });
            this.routes = [];
            this.failure = failure;
            this.refreshedAt = Date.now();
            this.options.logger?.error?.(`llm-chatgpt-web: model discovery failed closed: ${safeDetail(failure)}`);
            throw failure;
        }).finally(() => { this.inFlight = undefined; });
        return this.inFlight;
    }
    async list(signal) {
        try {
            return await this.load(signal, true);
        }
        catch (cause) {
            if (signal?.aborted)
                throw signal.reason;
            return [];
        }
    }
    async require(model, signal) {
        const route = routeFor(model);
        const routes = await this.load(signal);
        if (!routes.some(item => item.id === route.id)) {
            throw new ModelDiscoveryError(`ChatGPT Web model is not available in the bridge catalog: ${model}`);
        }
        return route;
    }
}
export function modelInfo(route) {
    return { provider: PROVIDER, id: route.id, name: route.name, description: route.description, inputModalities: ['text', 'image'] };
}
export function resolvedModel(route) {
    return { ...modelInfo(route), reasoning: { efforts: [{ id: route.effort, name: route.effort }], defaultEffort: route.effort } };
}
