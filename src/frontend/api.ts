import { useStore } from './store'
import type { WebhookEvent, GitHubWebhookStatus, GitLabWebhookStatus } from './types'

export interface PreflightCheck {
  id: string
  name: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  fix?: string
}

export interface PreflightResult {
  status: 'ok' | 'warn' | 'fail'
  checks: PreflightCheck[]
  failed: number
  warned: number
  passed: number
}

export interface TelegramStatus {
  enabled: boolean
  connected: boolean
  botUsername: string | null
  hasToken: boolean
  hasChatId: boolean
  tokenPreview: string
  chatId: string
  notifications: {
    taskCompleted: boolean; taskFailed: boolean; swarmInit: boolean
    swarmShutdown: boolean; agentError: boolean; taskProgress: boolean
  }
}

const API_BASE = '/api'

function addApiLog(level: string, message: string) {
  try { useStore.getState().addLog({ level, message, source: 'api' }) } catch { /* store not ready */ }
}

const DEFAULT_TIMEOUT = 45_000 // 45s timeout — CLI operations can take 30s+

async function request<T>(path: string, options?: RequestInit & { timeout?: number }): Promise<T> {
  const method = options?.method ?? 'GET'
  addApiLog('debug', `${method} ${path}`)

  const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: options?.signal ?? controller.signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      const msg = err.error || res.statusText
      addApiLog('error', `${method} ${path} failed: ${msg}`)
      throw new Error(msg)
    }
    addApiLog('info', `${method} ${path} OK`)
    return res.json()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      const msg = `${method} ${path} timed out after ${timeoutMs / 1000}s`
      addApiLog('error', msg)
      throw new Error(msg)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// System
export const api = {
  system: {
    health: () => request('/system/health', { timeout: 10_000 }),
    info: () => request('/system/info'),
    metrics: () => request('/system/metrics'),
    status: () => request('/system/status'),
    reset: () => request('/system/reset', { method: 'POST' }),
    preflight: () => request<PreflightResult>('/system/preflight', { timeout: 60_000 }),
    preflightFix: () => request<{
      results: Array<{ id: string; action: string; success: boolean; detail: string }>
      success: number; failed: number; total: number
    }>('/system/preflight/fix', { method: 'POST', timeout: 180_000 }),
  },

  swarm: {
    init: (opts: { topology?: string; maxAgents?: number; strategy?: string }) =>
      request('/swarm/init', { method: 'POST', body: JSON.stringify(opts) }),
    status: () => request('/swarm/status'),
    health: () => request('/swarm/health'),
    shutdown: () => request('/swarm/shutdown', { method: 'POST' }),
  },

  agents: {
    list: () => request('/agents'),
    spawn: (opts: { type: string; name: string; config?: Record<string, unknown> }) =>
      request('/agents/spawn', { method: 'POST', body: JSON.stringify(opts) }),
    status: (id: string) => request(`/agents/${id}/status`),
    health: (id: string) => request(`/agents/${id}/health`),
    terminate: (id: string) => request(`/agents/${id}/terminate`, { method: 'POST' }),
    terminateAll: () => request('/agents/terminate-all', { method: 'POST' }),
    update: (id: string, data: Record<string, unknown>) =>
      request(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    pool: () => request('/agents/pool'),
  },

  tasks: {
    list: () => request('/tasks'),
    create: (opts: { title: string; description: string; priority?: string; assignTo?: string; cwd?: string }) =>
      request('/tasks', { method: 'POST', body: JSON.stringify(opts) }),
    status: (id: string) => request(`/tasks/${id}/status`),
    assign: (id: string, agentId: string) =>
      request(`/tasks/${id}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) }),
    complete: (id: string, result?: string) =>
      request(`/tasks/${id}/complete`, { method: 'POST', body: JSON.stringify({ result }) }),
    cancel: (id: string) => request(`/tasks/${id}/cancel`, { method: 'POST' }),
    cleanCompleted: () => request<{ ok: boolean; deleted: number }>('/tasks/clean-completed', { method: 'POST' }),
    continue: (id: string, instruction: string) =>
      request(`/tasks/${id}/continue`, { method: 'POST', body: JSON.stringify({ instruction }) }),
    output: (id: string, tail = 200) =>
      request<{ taskId: string; lines: Array<{ type: string; content: string; timestamp: string }> }>(`/tasks/${id}/output?tail=${tail}`),
    summary: () => request('/tasks/summary'),
  },

  memory: {
    list: (namespace?: string, limit?: number) =>
      request(`/memory?${new URLSearchParams({ ...(namespace && { namespace }), ...(limit && { limit: String(limit) }) })}`),
    store: (opts: { key: string; value: string; namespace?: string; tags?: string[]; ttl?: number }) =>
      request('/memory', { method: 'POST', body: JSON.stringify(opts) }),
    retrieve: (key: string, namespace?: string) =>
      request(`/memory/${key}?${new URLSearchParams({ ...(namespace && { namespace }) })}`),
    search: (query: string, namespace?: string, limit?: number) =>
      request('/memory/search', { method: 'POST', body: JSON.stringify({ query, namespace, limit }) }),
    delete: (key: string, namespace?: string) =>
      request(`/memory/${key}?${new URLSearchParams({ ...(namespace && { namespace }) })}`, { method: 'DELETE' }),
    stats: () => request('/memory/stats'),
    migrate: (opts: { from: string; to: string }) =>
      request('/memory/migrate', { method: 'POST', body: JSON.stringify(opts) }),
  },

  sessions: {
    list: () => request('/sessions'),
    save: (name?: string) => request('/sessions/save', { method: 'POST', body: JSON.stringify({ name }) }),
    restore: (id: string) => request(`/sessions/${id}/restore`, { method: 'POST' }),
    info: (id: string) => request(`/sessions/${id}`),
    delete: (id: string) => request(`/sessions/${id}`, { method: 'DELETE' }),
  },

  hiveMind: {
    init: (opts?: { protocol?: string }) =>
      request('/hive-mind/init', { method: 'POST', body: JSON.stringify(opts || {}) }),
    status: () => request('/hive-mind/status'),
    join: (agentId: string) =>
      request('/hive-mind/join', { method: 'POST', body: JSON.stringify({ agentId }) }),
    leave: (agentId: string) =>
      request('/hive-mind/leave', { method: 'POST', body: JSON.stringify({ agentId }) }),
    broadcast: (message: string) =>
      request('/hive-mind/broadcast', { method: 'POST', body: JSON.stringify({ message }) }),
    consensus: (topic: string, options: string[]) =>
      request('/hive-mind/consensus', { method: 'POST', body: JSON.stringify({ topic, options }) }),
    memory: () => request('/hive-mind/memory'),
    shutdown: () => request('/hive-mind/shutdown', { method: 'POST' }),
  },

  neural: {
    status: () => request('/neural/status'),
    train: (opts: { model: string; data?: unknown }) =>
      request('/neural/train', { method: 'POST', body: JSON.stringify(opts) }),
    predict: (opts: { model: string; input: unknown }) =>
      request('/neural/predict', { method: 'POST', body: JSON.stringify(opts) }),
    optimize: () => request('/neural/optimize', { method: 'POST' }),
    patterns: () => request('/neural/patterns'),
    compress: () => request('/neural/compress', { method: 'POST' }),
  },

  performance: {
    metrics: () => request('/performance/metrics'),
    benchmark: (opts?: { type?: string }) =>
      request('/performance/benchmark', { method: 'POST', body: JSON.stringify(opts || {}) }),
    bottleneck: () => request('/performance/bottleneck'),
    optimize: () => request('/performance/optimize', { method: 'POST' }),
    profile: () => request('/performance/profile'),
    report: () => request('/performance/report'),
  },

  hooks: {
    list: () => request('/hooks'),
    init: () => request('/hooks/init', { method: 'POST' }),
    metrics: () => request('/hooks/metrics'),
    explain: (hookName: string) => request(`/hooks/${hookName}/explain`),
  },

  workflows: {
    list: () => request('/workflows'),
    create: (opts: { name: string; steps: unknown[] }) =>
      request('/workflows', { method: 'POST', body: JSON.stringify(opts) }),
    execute: (id: string) => request(`/workflows/${id}/execute`, { method: 'POST' }),
    status: (id: string) => request(`/workflows/${id}/status`),
    cancel: (id: string) => request(`/workflows/${id}/cancel`, { method: 'POST' }),
    pause: (id: string) => request(`/workflows/${id}/pause`, { method: 'POST' }),
    resume: (id: string) => request(`/workflows/${id}/resume`, { method: 'POST' }),
    delete: (id: string) => request(`/workflows/${id}`, { method: 'DELETE' }),
    templates: () => request('/workflows/templates'),
  },

  coordination: {
    metrics: () => request('/coordination/metrics'),
    topology: () => request('/coordination/topology'),
    sync: () => request('/coordination/sync', { method: 'POST' }),
    consensus: (topic: string) =>
      request('/coordination/consensus', { method: 'POST', body: JSON.stringify({ topic }) }),
  },

  config: {
    list: () => request('/config'),
    get: (key: string) => request(`/config/${key}`),
    set: (key: string, value: unknown) =>
      request(`/config/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
    reset: () => request('/config/reset', { method: 'POST' }),
    export: () => request('/config/export'),
    import: (data: unknown) =>
      request('/config/import', { method: 'POST', body: JSON.stringify(data) }),
    getServerSettings: () => request<{ skipPermissions: boolean }>('/config/server-settings'),
    setServerSettings: (settings: { skipPermissions: boolean }) =>
      request<{ skipPermissions: boolean }>('/config/server-settings', { method: 'PUT', body: JSON.stringify(settings) }),
    getTelegramStatus: () => request<TelegramStatus>('/config/telegram'),
    setTelegramConfig: (config: { enabled?: boolean; token?: string; chatId?: string; notifications?: Partial<TelegramStatus['notifications']> }) =>
      request<TelegramStatus>('/config/telegram', { method: 'PUT', body: JSON.stringify(config) }),
    testTelegram: () => request<{ ok: boolean; error?: string }>('/config/telegram/test', { method: 'POST' }),
    getTelegramLog: () => request<{ log: Array<{ timestamp: string; direction: 'in' | 'out'; message: string }> }>('/config/telegram/log'),
  },

  viz: {
    sessions: () => request('/viz/sessions'),
    session: (id: string) => request(`/viz/sessions/${id}`),
    nodeLogs: (sessionId: string, nodeId: string, tail = 100) =>
      request(`/viz/sessions/${sessionId}/logs/${nodeId}?tail=${tail}`),
  },

  swarmMonitor: {
    snapshot: (currentOnly = false) => request(`/swarm-monitor/snapshot${currentOnly ? '?current=true' : ''}`),
    purge: () => request('/swarm-monitor/purge', { method: 'POST' }),
    agents: () => request('/swarm-monitor/agents'),
    health: () => request('/swarm-monitor/health'),
    metrics: () => request('/swarm-monitor/metrics'),
    agentOutput: (agentId: string) => request<{ agentId: string; lines: string[] }>(`/swarm-monitor/output/${agentId}`),
  },

  aiDefence: {
    analyze: (input: string) =>
      request('/ai-defence/analyze', { method: 'POST', body: JSON.stringify({ input }) }),
    scan: () => request('/ai-defence/scan'),
    stats: () => request('/ai-defence/stats'),
  },

  webhooks: {
    getGitHubConfig: () => request<GitHubWebhookStatus>('/webhooks/github/config'),
    setGitHubConfig: (config: Record<string, unknown>) =>
      request('/webhooks/github/config', { method: 'PUT', body: JSON.stringify(config) }),
    getGitHubEvents: () => request<WebhookEvent[]>('/webhooks/github/events'),
    testGitHub: () => request<{ ok: boolean; eventId?: string; taskId?: string; error?: string }>(
      '/webhooks/github/test', { method: 'POST' }),
    getGitLabConfig: () => request<GitLabWebhookStatus>('/webhooks/gitlab/config'),
    setGitLabConfig: (config: Record<string, unknown>) =>
      request('/webhooks/gitlab/config', { method: 'PUT', body: JSON.stringify(config) }),
    getGitLabEvents: () => request<WebhookEvent[]>('/webhooks/gitlab/events'),
    testGitLab: () => request<{ ok: boolean; eventId?: string; taskId?: string; error?: string }>(
      '/webhooks/gitlab/test', { method: 'POST' }),
  },
}

// WebSocket connection
export function createWebSocket(onMessage: (msg: { type: string; payload: unknown }) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      onMessage(msg)
    } catch {
      console.error('Invalid WS message', event.data)
    }
  }

  return ws
}
