import type { Route } from './models.js';
export interface AccountCapabilities {
    solAvailable: boolean;
    proAvailable: boolean;
}
export interface CapabilityLogger {
    info?(message: string): void;
    warn?(message: string): void;
    error?(message: string): void;
}
export interface CapabilityCatalogOptions {
    configPath?: string;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    readText?: (path: string) => Promise<string>;
    logger?: CapabilityLogger;
}
export declare class CapabilityDiscoveryError extends Error {
    readonly code = "CAPABILITY_DISCOVERY_FAILED";
    constructor(message: string);
}
export declare function capabilityConfigPath(env?: NodeJS.ProcessEnv, homeDir?: string): string;
export declare function routesForCapabilities(capabilities: AccountCapabilities): readonly Route[];
export declare function readAccountCapabilities(configPath: string, readText?: (path: string) => Promise<string>): Promise<AccountCapabilities>;
export declare class CapabilityCatalog {
    private readonly options;
    private readonly configPath;
    private readonly readText;
    constructor(options?: CapabilityCatalogOptions);
    list(signal?: AbortSignal): Promise<readonly Route[]>;
}
