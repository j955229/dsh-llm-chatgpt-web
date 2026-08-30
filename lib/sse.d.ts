export interface SseRecord {
    event?: string;
    data: string;
}
export declare function decodeSse(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseRecord>;
export declare function responsesToChunks(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<any>;
