import type { RuntimeContext, TurnEnvironment } from './types.js'

export function resolveEnvironment(ctx: RuntimeContext, sessionId: string, networkAccess: boolean): TurnEnvironment {
  const session = ctx.sessions.get(sessionId)
  if (!session) throw new Error(`DSH session not found: ${sessionId}`)
  const policy = ctx.sandboxPolicy.resolve({ session })
  const cwd = session.header.cwd ?? policy.workspaceRoot
  if (!cwd) throw new Error('The DSH session has no public cwd or workspace root.')
  const roots = new Set<string>([policy.workspaceRoot])
  for (const workspace of ctx.workspaceRegistry.list()) {
    if (workspace.sessionIds.includes(sessionId)) roots.add(workspace.path)
  }
  return { cwd, workspaceRoots: [...roots], sandboxMode: policy.mode, networkAccess }
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

export function renderEnvironment(environment: TurnEnvironment): string {
  const roots = environment.workspaceRoots.map(root => `<root>${xml(root)}</root>`).join('')
  return `<environment_context><cwd>${xml(environment.cwd)}</cwd><workspace_roots>${roots}</workspace_roots><sandbox_mode>${environment.sandboxMode}</sandbox_mode><network_access>${environment.networkAccess ? 'enabled' : 'disabled'}</network_access></environment_context>`
}

export function metadataSandbox(mode: TurnEnvironment['sandboxMode']): string {
  return mode === 'danger-full-access' ? 'none' : mode
}
