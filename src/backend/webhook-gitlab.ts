import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs'
import { join } from 'path'
import { Router, Request, Response, RequestHandler } from 'express'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GitLabWebhookConfig {
  enabled: boolean
  /** GitLab personal access token (for future API use) */
  gitlabToken: string
  /** Secret token — GitLab sends this as X-Gitlab-Token header (plain comparison) */
  webhookSecret: string
  /** Projects to monitor — array of "namespace/project" strings */
  repos: string[]
  /** Auto-assign new issue tasks to the active swarm */
  autoAssign: boolean
  /** Custom instructions template. Placeholders: {{title}}, {{body}}, {{url}}, {{author}}, {{labels}}, {{repo}}, {{number}} */
  taskTemplate: string
}

export interface GitLabWebhookEvent {
  id: string
  provider: 'gitlab'
  repo: string
  event: string
  title: string
  body: string
  url: string
  number: number
  author: string
  labels: string[]
  receivedAt: string
  taskId?: string
  status: 'received' | 'processing' | 'completed' | 'failed' | 'ignored'
}

const DEFAULT_TEMPLATE = 'Analyze this issue, investigate the codebase, implement a fix, write tests, and prepare a summary of changes.'

const DEFAULT_CONFIG: GitLabWebhookConfig = {
  enabled: false,
  gitlabToken: '',
  webhookSecret: '',
  repos: [],
  autoAssign: true,
  taskTemplate: '',
}

function buildTaskDescription(event: GitLabWebhookEvent, template: string): string {
  const bodyText = event.body?.slice(0, 2000) || 'No description provided.'
  const instructions = template || DEFAULT_TEMPLATE
  const rendered = instructions
    .replace(/\{\{title\}\}/g, event.title)
    .replace(/\{\{body\}\}/g, bodyText)
    .replace(/\{\{url\}\}/g, event.url)
    .replace(/\{\{author\}\}/g, event.author)
    .replace(/\{\{labels\}\}/g, event.labels.join(', ') || 'none')
    .replace(/\{\{repo\}\}/g, event.repo)
    .replace(/\{\{number\}\}/g, String(event.number))

  const templateHasBody = template && /\{\{body\}\}/.test(template)

  const parts = [
    `GitLab Issue: ${event.url}`,
    `Author: ${event.author}`,
    `Labels: ${event.labels.join(', ') || 'none'}`,
  ]
  if (!templateHasBody) {
    parts.push('', bodyText)
  }
  parts.push('', '---', `Instructions: ${rendered}`)

  return parts.join('\n')
}

// ── Persistence ────────────────────────────────────────────────────────────

function configPath(): string {
  const dir = process.env.RUFLO_PERSIST_DIR || '.ruflo'
  return join(dir, 'gitlab-webhook.json')
}

export function loadGitLabWebhookConfig(): GitLabWebhookConfig {
  try {
    if (existsSync(configPath())) {
      const raw = JSON.parse(readFileSync(configPath(), 'utf-8'))
      return { ...DEFAULT_CONFIG, ...raw }
    }
  } catch { /* use defaults */ }
  return {
    ...DEFAULT_CONFIG,
    enabled: process.env.GITLAB_WEBHOOK_ENABLED === 'true',
    gitlabToken: process.env.GITLAB_TOKEN || '',
    webhookSecret: process.env.GITLAB_WEBHOOK_SECRET || '',
    repos: process.env.GITLAB_WEBHOOK_REPOS?.split(',').map(r => r.trim()).filter(Boolean) || [],
  }
}

export function saveGitLabWebhookConfig(config: GitLabWebhookConfig): void {
  const dir = process.env.RUFLO_PERSIST_DIR || '.ruflo'
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8')
  try { chmodSync(configPath(), 0o600) } catch { /* Windows */ }
}

// ── In-memory event store ──────────────────────────────────────────────────

const MAX_EVENTS = 200
let gitlabEvents: GitLabWebhookEvent[] = []

function addEvent(event: GitLabWebhookEvent): void {
  gitlabEvents.unshift(event)
  if (gitlabEvents.length > MAX_EVENTS) gitlabEvents = gitlabEvents.slice(0, MAX_EVENTS)
}

export function updateGitLabEventByTaskId(taskId: string, status: GitLabWebhookEvent['status']): void {
  const event = gitlabEvents.find(e => e.taskId === taskId)
  if (event) event.status = status
}

export function getGitLabWebhookEvents(): GitLabWebhookEvent[] {
  return gitlabEvents
}

// ── Route Factory ──────────────────────────────────────────────────────────

export interface GitLabWebhookStores {
  createAndAssignTask: (title: string, description: string) => Promise<{ taskId: string; assigned: boolean }>
  broadcast: (type: string, payload: unknown) => void
}

export function gitlabWebhookRoutes(
  getConfig: () => GitLabWebhookConfig,
  setConfig: (c: GitLabWebhookConfig) => void,
  stores: GitLabWebhookStores,
): Router {
  const router = Router()

  const wrap = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
    async (req, res, _next) => {
      try { await fn(req, res) } catch (err: unknown) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
      }
    }

  // ── Webhook receiver ───────────────────────────────────────────────────

  router.post('/gitlab', wrap(async (req, res) => {
    const config = getConfig()
    if (!config.enabled) {
      res.status(503).json({ error: 'GitLab webhooks disabled' })
      return
    }

    // GitLab uses a simple token comparison (no HMAC)
    if (config.webhookSecret) {
      const token = req.headers['x-gitlab-token'] as string | undefined
      if (!token) {
        res.status(401).json({ error: 'Missing X-Gitlab-Token header' })
        return
      }
      if (token !== config.webhookSecret) {
        res.status(401).json({ error: 'Invalid token' })
        return
      }
    }

    const glEvent = req.headers['x-gitlab-event'] as string || 'unknown'
    const payload = req.body

    // Only handle Issue Hook events
    if (glEvent !== 'Issue Hook') {
      res.json({ ok: true, action: 'ignored', reason: `event type '${glEvent}' not handled` })
      return
    }

    const attrs = payload.object_attributes || {}
    const action = attrs.action
    if (action !== 'open' && action !== 'reopen') {
      res.json({ ok: true, action: 'ignored', reason: `issue.${action || 'unknown'} not handled` })
      return
    }

    const repo = payload.project?.path_with_namespace || 'unknown/unknown'

    // Check if this repo is monitored
    if (config.repos.length > 0 && !config.repos.includes(repo)) {
      res.json({ ok: true, action: 'ignored', reason: `repo '${repo}' not monitored` })
      return
    }

    const event: GitLabWebhookEvent = {
      id: `gl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      provider: 'gitlab',
      repo,
      event: `issue.${action}`,
      title: attrs.title || 'Untitled',
      body: attrs.description || '',
      url: attrs.url || '',
      number: attrs.iid || 0,
      author: payload.user?.username || 'unknown',
      labels: (payload.labels || []).map((l: { title: string }) => l.title),
      receivedAt: new Date().toISOString(),
      status: 'received',
    }
    addEvent(event)
    stores.broadcast('webhook:received', event)

    // Auto-create task if enabled
    if (config.autoAssign) {
      event.status = 'processing'
      stores.broadcast('webhook:updated', event)

      const taskTitle = `[${repo}#${attrs.iid}] ${attrs.title}`
      const taskDesc = buildTaskDescription(event, config.taskTemplate)

      try {
        const result = await stores.createAndAssignTask(taskTitle, taskDesc)
        event.taskId = result.taskId
        event.status = result.assigned ? 'processing' : 'received'
        stores.broadcast('webhook:updated', event)
      } catch {
        event.status = 'failed'
        stores.broadcast('webhook:updated', event)
      }
    }

    res.json({ ok: true, action: 'task_created', eventId: event.id, taskId: event.taskId })
  }))

  // ── Config API ─────────────────────────────────────────────────────────

  router.get('/gitlab/config', wrap(async (_req, res) => {
    const config = getConfig()
    res.json({
      enabled: config.enabled,
      hasToken: !!config.gitlabToken,
      tokenPreview: config.gitlabToken ? '...' + config.gitlabToken.slice(-4) : '',
      webhookSecret: config.webhookSecret ? '****' : '',
      hasSecret: !!config.webhookSecret,
      repos: config.repos,
      autoAssign: config.autoAssign,
      taskTemplate: config.taskTemplate || '',
    })
  }))

  router.put('/gitlab/config', wrap(async (req, res) => {
    const config = getConfig()
    const { enabled, gitlabToken, webhookSecret, repos, autoAssign, taskTemplate } = req.body
    if (typeof enabled === 'boolean') config.enabled = enabled
    if (typeof gitlabToken === 'string') config.gitlabToken = gitlabToken
    if (typeof webhookSecret === 'string') config.webhookSecret = webhookSecret
    if (Array.isArray(repos)) config.repos = repos.filter((r: unknown) => typeof r === 'string' && (r as string).includes('/'))
    if (typeof autoAssign === 'boolean') config.autoAssign = autoAssign
    if (typeof taskTemplate === 'string') config.taskTemplate = taskTemplate
    setConfig(config)
    res.json({ ok: true })
  }))

  // ── Test endpoint ───────────────────────────────────────────────────────

  router.post('/gitlab/test', wrap(async (_req, res) => {
    const config = getConfig()
    if (!config.enabled) {
      res.status(503).json({ error: 'GitLab webhooks disabled' })
      return
    }

    const event: GitLabWebhookEvent = {
      id: `gl-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      provider: 'gitlab',
      repo: 'test/webhook-test',
      event: 'issue.open',
      title: 'Test GitLab webhook event',
      body: 'This is a test event sent from the RuFloUI dashboard to verify the GitLab webhook pipeline works correctly.',
      url: 'https://gitlab.com/test/webhook-test/-/issues/0',
      number: 0,
      author: 'rufloui-test',
      labels: ['test'],
      receivedAt: new Date().toISOString(),
      status: 'received',
    }
    addEvent(event)
    stores.broadcast('webhook:received', event)

    if (config.autoAssign) {
      event.status = 'processing'
      stores.broadcast('webhook:updated', event)
      const taskTitle = `[test/webhook-test#0] Test GitLab webhook event`
      const taskDesc = buildTaskDescription(event, config.taskTemplate)
      try {
        const result = await stores.createAndAssignTask(taskTitle, taskDesc)
        event.taskId = result.taskId
        event.status = result.assigned ? 'processing' : 'received'
        stores.broadcast('webhook:updated', event)
        res.json({ ok: true, eventId: event.id, taskId: result.taskId, assigned: result.assigned })
      } catch {
        event.status = 'failed'
        stores.broadcast('webhook:updated', event)
        res.json({ ok: false, error: 'Task creation failed', eventId: event.id })
      }
    } else {
      res.json({ ok: true, eventId: event.id, message: 'Test event created (auto-assign disabled)' })
    }
  }))

  // ── Events API ─────────────────────────────────────────────────────────

  router.get('/gitlab/events', wrap(async (_req, res) => {
    res.json(gitlabEvents)
  }))

  return router
}
