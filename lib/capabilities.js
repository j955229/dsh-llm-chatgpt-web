import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { ROUTES } from './models.js';
import { safeDetail } from './upstream-error.js';
export class CapabilityDiscoveryError extends Error {
    code = 'CAPABILITY_DISCOVERY_FAILED';
    constructor(message) {
        super(message);
        this.name = 'CapabilityDiscoveryError';
    }
}
function expandHome(value, homeDir) {
    if (value === '~')
        return homeDir;
    if (value.startsWith('~/') || value.startsWith('~\\'))
        return join(homeDir, value.slice(2));
    return value;
}
export function capabilityConfigPath(env = process.env, homeDir = homedir()) {
    const configured = env.CODEX_CHATGPT_WEB_HOME?.trim();
    const directory = configured ? expandHome(configured, homeDir) : join(homeDir, '.codex-chatgpt-web');
    return join(isAbsolute(directory) ? directory : resolve(directory), 'config.json');
}
export function routesForCapabilities(capabilities) {
    if (!capabilities.solAvailable && capabilities.proAvailable) {
        throw new CapabilityDiscoveryError('codex-chatgpt-web capability flags are contradictory: Pro requires Sol.');
    }
    const ids = capabilities.solAvailable
        ? capabilities.proAvailable
            ? ['chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high', 'chatgpt-web/extra-high', 'chatgpt-web/pro']
            : ['chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/high']
        : ['chatgpt-web/luna'];
    return ROUTES.filter(route => ids.includes(route.id));
}
export async function readAccountCapabilities(configPath, readText = path => readFile(path, 'utf8')) {
    let text;
    try {
        text = await readText(configPath);
    }
    catch (cause) {
        throw new CapabilityDiscoveryError(`Could not read codex-chatgpt-web config at ${configPath}: ${safeDetail(cause)}`);
    }
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new CapabilityDiscoveryError(`codex-chatgpt-web config at ${configPath} contains malformed JSON.`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new CapabilityDiscoveryError(`codex-chatgpt-web config at ${configPath} is not a JSON object.`);
    }
    const config = value;
    if (typeof config.solAvailable !== 'boolean' || typeof config.proAvailable !== 'boolean') {
        throw new CapabilityDiscoveryError(`codex-chatgpt-web config at ${configPath} must contain boolean solAvailable and proAvailable fields.`);
    }
    const capabilities = { solAvailable: config.solAvailable, proAvailable: config.proAvailable };
    routesForCapabilities(capabilities);
    return capabilities;
}
export class CapabilityCatalog {
    options;
    configPath;
    readText;
    constructor(options = {}) {
        this.options = options;
        this.configPath = options.configPath ?? capabilityConfigPath(options.env, options.homeDir);
        this.readText = options.readText ?? (path => readFile(path, 'utf8'));
    }
    async list(signal) {
        signal?.throwIfAborted();
        try {
            const routes = routesForCapabilities(await readAccountCapabilities(this.configPath, this.readText));
            signal?.throwIfAborted();
            this.options.logger?.info?.(`llm-chatgpt-web: discovered ${routes.length} model route(s) from account capabilities`);
            return routes;
        }
        catch (cause) {
            if (signal?.aborted)
                throw signal.reason;
            const message = cause instanceof CapabilityDiscoveryError ? cause.message : 'Unexpected account capability discovery failure.';
            this.options.logger?.warn?.(`llm-chatgpt-web: account capability discovery failed closed: ${message}`);
            return [];
        }
    }
}
