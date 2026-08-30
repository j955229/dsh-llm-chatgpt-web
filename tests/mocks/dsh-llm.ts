export abstract class LlmAdapter {}

export class LlmError extends Error {
  readonly code: string
  constructor(message: string, code: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'LlmError'
    this.code = code
  }
}

export function attributionHeaders(): Record<string, string> {
  return { 'user-agent': 'dsh-llm-chatgpt-web-test' }
}
