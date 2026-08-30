import type { DshMessage } from './types.js';
export declare function latestRealUserIndex(messages: readonly DshMessage[]): number;
export declare function stableTurnIdentity(sessionId: string, messages: readonly DshMessage[], purpose?: string): {
    threadId: string;
    turnId: string;
    userIndex: number;
};
