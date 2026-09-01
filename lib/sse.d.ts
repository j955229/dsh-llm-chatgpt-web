export interface SseRecord {
    event?: string;
    data: string;
}
export declare class UpstreamSseError extends Error {
    readonly code?: string;
    constructor(failure: {
        message: string;
        code?: string;
    });
}
export declare function decodeSse(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseRecord>;
export declare function responsesToChunks(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<any>;
