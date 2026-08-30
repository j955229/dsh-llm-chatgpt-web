export interface BridgeHealth {
    service?: string;
    mode?: string;
    [key: string]: unknown;
}
export declare function readBridgeHealth(baseURL: string, fetchImpl: typeof fetch, signal?: AbortSignal, headers?: Record<string, string>): Promise<BridgeHealth>;
export declare function toolModeProblem(health: BridgeHealth): 'wrong-service' | 'browser-only' | undefined;
