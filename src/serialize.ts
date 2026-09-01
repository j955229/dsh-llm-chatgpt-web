import type { AttachmentReader, DshBlock, DshMessage, NativeRequest, TurnEnvironment } from './types.js'
import { renderEnvironment, metadataSandbox } from './environment.js'
import { stableTurnIdentity } from './identity.js'
import { routeFor } from './models.js'

type InputItem = Record<string, unknown>

async function imageContent(block: Extract<DshBlock, { type: 'image' }>, attachments: AttachmentReader, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const stored = await attachments.readImage(block.attachment, signal)
  const encoded = Buffer.from(stored.data).toString('base64')
  return { type: 'input_image', image_url: `data:${stored.ref.mediaType};base64,${encoded}`, detail: 'auto' }
}

function flattenResult(blocks: readonly DshBlock[]): string {
  return blocks.map(block => {
    if (block.type === 'text' || block.type === 'reasoning') return block.text
    if (block.type === 'tool-call') return JSON.stringify({ tool: block.name, arguments: block.arguments })
    if (block.type === 'tool-result') return flattenResult(block.content)
    if (block.type === 'image') return `[image ${block.attachment.mediaType} ${block.attachment.width}x${block.attachment.height}]`
    return ''
  }).join('\n')
}

async function serializeMessage(
  message: DshMessage,
  attachments: AttachmentReader,
  currentTurnId: string | undefined,
  signal?: AbortSignal,
): Promise<InputItem[]> {
  const metadata = currentTurnId ? { internal_chat_message_metadata_passthrough: { turn_id: currentTurnId } } : {}
  if (message.source.kind === 'tool') {
    return message.content.filter((block): block is Extract<DshBlock, { type: 'tool-result' }> => block.type === 'tool-result').map(block => ({
      type: 'function_call_output', call_id: block.toolCallId, output: block.isError ? `Error: ${flattenResult(block.content)}` : flattenResult(block.content),
    }))
  }
  if (message.role === 'assistant') {
    const result: InputItem[] = []
    const visible: Record<string, unknown>[] = []
    for (const block of message.content) {
      if (block.type === 'text') visible.push({ type: 'output_text', text: block.text })
      else if (block.type === 'reasoning') result.push({ type: 'reasoning', id: `rs_${message.id}`, summary: [{ type: 'summary_text', text: block.text }] })
      else if (block.type === 'tool-call') result.push({ type: 'function_call', id: `fc_${block.id}`, call_id: block.id, name: block.name, arguments: block.arguments })
    }
    if (visible.length) result.unshift({ type: 'message', id: message.id, role: 'assistant', content: visible })
    return result
  }
  // DSH compaction creates its instruction as a plugin-authored user message. When it is the
  // current turn user, keep it as user so codex-chatgpt-web can bind native turn identity to it.
  // Other plugin-authored context remains developer content.
  const role = currentTurnId && message.role === 'user'
    ? 'user'
    : message.source.kind === 'plugin' || message.role === 'system'
      ? 'developer'
      : 'user'
  const content: Record<string, unknown>[] = []
  for (const block of message.content) {
    if (block.type === 'text' || block.type === 'reasoning') content.push({ type: 'input_text', text: block.text })
    else if (block.type === 'image') content.push(await imageContent(block, attachments, signal))
    else if (block.type === 'tool-result') content.push({ type: 'input_text', text: flattenResult([block]) })
  }
  return [{ type: 'message', id: message.id, role, content, ...metadata }]
}

export interface SerializeOptions {
  model: string
  messages: DshMessage[]
  system?: string
  tools?: { name: string; description: string; parameters: Record<string, unknown> }[]
  maxTokens?: number
  temperature?: number
  stop?: string[]
  sessionId: string
  purpose?: 'compaction' | 'session-title'
  signal?: AbortSignal
  environment: TurnEnvironment
  attachments: AttachmentReader
}

export async function serializeRequest(options: SerializeOptions): Promise<NativeRequest> {
  const route = routeFor(options.model)
  const { threadId, turnId, userIndex } = stableTurnIdentity(options.sessionId, options.messages, options.purpose)
  const input: InputItem[] = []
  const environmentItem = {
    type: 'message', id: `env_${turnId}`, role: 'user',
    content: [{ type: 'input_text', text: renderEnvironment(options.environment) }],
    internal_chat_message_metadata_passthrough: { turn_id: turnId },
  }
  for (let index = 0; index < options.messages.length; index++) {
    if (index === userIndex) input.push(environmentItem)
    input.push(...await serializeMessage(options.messages[index]!, options.attachments, index === userIndex ? turnId : undefined, options.signal))
  }
  const turnMetadata = {
    thread_id: threadId,
    turn_id: turnId,
    request_kind: 'turn',
    sandbox: metadataSandbox(options.environment.sandboxMode),
    workspaces: Object.fromEntries(options.environment.workspaceRoots.map(root => [root, {}])),
  }
  const body: Record<string, unknown> = {
    model: route.id,
    stream: true,
    store: false,
    input,
    reasoning: { effort: route.effort },
    prompt_cache_key: threadId,
    client_metadata: { 'x-codex-turn-metadata': JSON.stringify(turnMetadata) },
  }
  if (options.system) body.instructions = options.system
  if (options.tools?.length) {
    body.tools = options.tools.map(tool => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters, strict: false }))
    body.tool_choice = 'auto'
    body.parallel_tool_calls = true
  }
  if (options.maxTokens !== undefined) body.max_output_tokens = options.maxTokens
  if (options.temperature !== undefined) body.temperature = options.temperature
  if (options.stop?.length) body.stop = options.stop
  return { body, threadId, turnId }
}
