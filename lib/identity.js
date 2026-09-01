import { createHash } from 'node:crypto';
function uuidFrom(seed) {
    const bytes = createHash('sha256').update(seed).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function latestRealUserIndex(messages) {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message.role === 'user' && message.source?.kind === 'user')
            return index;
    }
    return -1;
}
function latestUserIndex(messages) {
    for (let index = messages.length - 1; index >= 0; index--) {
        if (messages[index].role === 'user')
            return index;
    }
    return -1;
}
export function stableTurnIdentity(sessionId, messages, purpose) {
    const userIndex = purpose === 'compaction' ? latestUserIndex(messages) : latestRealUserIndex(messages);
    if (userIndex < 0)
        throw new Error('A ChatGPT Web turn requires a DSH user message.');
    const message = messages[userIndex];
    const scope = purpose ?? 'conversation';
    const threadId = uuidFrom(`dsh-chatgpt-web\0${scope}\0${sessionId}`);
    const fallback = JSON.stringify(message.content);
    const turnId = uuidFrom(`dsh-chatgpt-web-turn\0${scope}\0${sessionId}\0${message.id || fallback}`);
    return { threadId, turnId, userIndex };
}
