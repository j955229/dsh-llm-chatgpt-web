import type { AttachmentReader, DshMessage, NativeRequest, TurnEnvironment } from './types.js';
export interface SerializeOptions {
    model: string;
    messages: DshMessage[];
    system?: string;
    tools?: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }[];
    maxTokens?: number;
    temperature?: number;
    stop?: string[];
    sessionId: string;
    purpose?: 'compaction' | 'session-title';
    signal?: AbortSignal;
    environment: TurnEnvironment;
    attachments: AttachmentReader;
}
export declare function serializeRequest(options: SerializeOptions): Promise<NativeRequest>;
