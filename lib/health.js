export async function readBridgeHealth(baseURL, fetchImpl, signal, headers = {}) {
    const response = await fetchImpl(`${baseURL.replace(/\/+$/, '')}/healthz`, { signal, headers });
    if (!response.ok)
        throw new Error(`HEALTH_HTTP_${response.status}`);
    const value = await response.json();
    if (!value || typeof value !== 'object')
        throw new Error('HEALTH_MALFORMED');
    return value;
}
export function toolModeProblem(health) {
    if (health.service !== 'codex-chatgpt-web')
        return 'wrong-service';
    if (health.mode !== 'full')
        return 'browser-only';
    return undefined;
}
