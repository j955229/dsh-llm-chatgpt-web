import type { LlmModelInfo, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'

export const PROVIDER = 'chatgpt-web'

export const ROUTES = [
  { id: 'chatgpt-web/light', name: 'ChatGPT Web / Instant', effort: 'low', description: 'Fastest GPT-5.6 Sol route.' },
  { id: 'chatgpt-web/medium', name: 'ChatGPT Web / Medium', effort: 'medium', description: 'Balanced GPT-5.6 Sol route.' },
  { id: 'chatgpt-web/high', name: 'ChatGPT Web / High', effort: 'high', description: 'High-reasoning GPT-5.6 Sol route.' },
  { id: 'chatgpt-web/extra-high', name: 'ChatGPT Web / Extra High', effort: 'xhigh', description: 'Extra-high reasoning; requires a ChatGPT Pro account.' },
  { id: 'chatgpt-web/pro', name: 'ChatGPT Web / Pro', effort: 'ultra', description: 'Maximum reasoning; requires a ChatGPT Pro account.' },
  { id: 'chatgpt-web/luna', name: 'ChatGPT Web / Luna', effort: 'low', description: 'GPT-5.6 Luna route; only available when the account lacks Sol access.' },
] as const

export type Route = typeof ROUTES[number]

export function routeFor(model: string): Route {
  const route = ROUTES.find(item => item.id === model)
  if (!route) throw new Error(`Unknown ChatGPT Web model route: ${model}`)
  return route
}

export function modelInfo(route: Route): LlmModelInfo {
  return { provider: PROVIDER, id: route.id, name: route.name, description: route.description, inputModalities: ['text', 'image'] }
}

export function resolvedModel(route: Route): LlmResolvedModelInfo {
  return { ...modelInfo(route), reasoning: { efforts: [{ id: route.effort, name: route.effort }], defaultEffort: route.effort } }
}
