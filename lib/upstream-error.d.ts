export interface UpstreamFailure {
    message: string;
    code?: string;
}
export declare function redactSecrets(value: string): string;
export declare function safeDetail(value: unknown, limit?: number): string;
export declare function safeCause(value: unknown): Error;
export declare function readLimitedResponseText(response: Response): Promise<string>;
export declare function extractUpstreamFailure(value: unknown): UpstreamFailure;
export declare function describeHttpFailure(response: Response): Promise<UpstreamFailure>;
export declare function malformedSseMessage(record: {
    event?: string;
    data: string;
}): string;
export declare function formatUpstreamFailure(failure: UpstreamFailure): string;
