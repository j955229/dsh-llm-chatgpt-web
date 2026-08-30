declare module '@deepseek-ai/dsh-llm' {
  export type ReasoningEffortId = string
  export interface LlmProviderInfo { id: string; name: string }
  export interface LlmModelInfo { provider: string; id: string; name: string; description?: string; inputModalities?: readonly ('text' | 'image')[] }
  export interface LlmResolvedModelInfo extends LlmModelInfo { reasoning?: { efforts: readonly { id: string; name: string }[]; defaultEffort?: string } }
  export interface GenerateOptions { provider: string; model: string; reasoningEffort?: string; messages: any[]; system?: string; tools?: any[]; temperature?: number; maxTokens?: number; stop?: string[]; signal?: AbortSignal; sessionId?: string; purpose?: 'compaction' | 'session-title' }
  export type StreamChunk = any
  export abstract class LlmAdapter {
    providerInfo(provider: string): LlmProviderInfo
    listModels(provider: string): Promise<readonly LlmModelInfo[]>
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>
    abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>
  }
  export class LlmError extends Error { constructor(message: string, code: string, options?: { status?: number; cause?: unknown; providerRetryAfterMs?: number; requestId?: string }) }
  export function attributionHeaders(): Record<string, string>
}
