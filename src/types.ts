export interface DshMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  source: { kind: string; [key: string]: unknown }
  content: DshBlock[]
}

export type DshBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'image'; attachment: ImageRef }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'tool-result'; toolCallId: string; content: DshBlock[]; isError?: boolean }

export interface ImageRef { attachmentId: string; mediaType: string; bytes: number; width: number; height: number; name?: string }
export interface AttachmentReader { readImage(ref: ImageRef, signal?: AbortSignal): Promise<{ data: Uint8Array; ref: ImageRef }> }
export interface SessionLike { id: string; header: { cwd?: string } }
export interface RuntimeContext {
  sessions: { get(id: string): SessionLike | undefined }
  workspaceRegistry: { list(): readonly { path: string; sessionIds: readonly string[] }[] }
  sandboxPolicy: { resolve(request: { session: SessionLike }): { mode: 'read-only' | 'workspace-write' | 'danger-full-access'; workspaceRoot: string } }
  attachments: AttachmentReader
}

export interface TurnEnvironment { cwd: string; workspaceRoots: string[]; sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access'; networkAccess: boolean }
export interface NativeRequest { body: Record<string, unknown>; threadId: string; turnId: string }
