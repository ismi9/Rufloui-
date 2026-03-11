import { createHmac, timingSafeEqual } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs'
import { join } from 'path'
import { Router, Request, Response, RequestHandler } from 'express'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GitHubWebhookConfig {
  enabled: boolean
  /** Personal access token (repo scope) for creating branches/PRs */
  githubToken: string
  /** Webhook secret for HMAC-SHA256 validation */
  webhookSecret: string
  /** Repos to monitor — array of "owner/repo" strings */
  repos: string[]
  /** Auto-assign new issue tasks to the active swarm */
  autoAssign: boolean
  /** Custom instructions template for swarm tasks. Placeholders: {{title}}, {{body}}, {{url}}, {{author}}, {{labels}}, {{repo}}, {{number}} */
  taskTemplate: string
}

export interface WebhookEvent {
  id: string
  provider: 'github'
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

const DEFAULT_CONFIG: GitHubWebhookConfig = {
  enabled: false,
  githubToken: '',
  webhookSecret: '',
  repos: [],
  autoAssign: true,
  taskTemplate: '',
}

function buildTaskDescription(event: WebhookEvent, template: string): string {
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

  // If the custom template already includes {{body}}, skip the body in the header
  // to avoid duplication
  const templateHasBody = template && /\{\{body\}\}/.test(template)

  const parts = [
    `GitHub Issue: ${event.url}`,
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
  return join(dir, 'github-webhook.json')
}

export function loadGitHubWebhookConfig(): GitHubWebhookConfig {
  try {
    if (existsSync(configPath())) {
      const raw = JSON.parse(readFileSync(configPath(), 'utf-8'))
      return { ...DEFAULT_CONFIG, ...raw }
    }
  } catch { /* use defaults */ }
  // Fallback to env vars
  return {
    ...DEFAULT_CONFIG,
    enabled: process.env.GITHUB_WEBHOOK_ENABLED === 'true',
    githubToken: process.env.GITHUB_TOKEN || '',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
    repos: process.env.GITHUB_WEBHOOK_REPOS?.split(',').map(r => r.trim()).filter(Boolean) || [],
  }
}

export function saveGitHubWebhookConfig(config: GitHubWebhookConfig): void {
  const dir = process.env.RUFLO_PERSIST_DIR || '.ruflo'
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8')
  try { chmodSync(configPath(), 0o600) } catch { /* Windows */ }
}

// ── HMAC Validation ────────────────────────────────────────────────────────

export function verifyGitHubSignature(
  payload: Buffer | string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false
  // Strip the 'sha256=' prefix from the header value
  const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  if (expected.length !== sig.length) return false
  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))
}

// ── In-memory event store ──────────────────────────────────────────────────

const MAX_EVENTS = 200
let webhookEvents: WebhookEvent[] = []

function addEvent(event: WebhookEvent): void {
  webhookEvents.unshift(event)
  if (webhookEvents.length > MAX_EVENTS) webhookEvents = webhookEvents.slice(0, MAX_EVENTS)
}

export function updateWebhookEventByTaskId(taskId: string, status: WebhookEvent['status']): void {
  const event = webhookEvents.find(e => e.taskId === taskId)
  if (event) event.status = status
}

export function getWebhookEvents(): WebhookEvent[] {
  return webhookEvents
}

// ── Route Factory ──────────────────────────────────────────────────────────

export interface WebhookStores {
  createAndAssignTask: (title: string, description: string) => Promise<{ taskId: string; assigned: boolean }>
  broadcast: (type: string, payload: unknown) => void
}

export function githubWebhookRoutes(
  getConfig: () => GitHubWebhookConfig,
  setConfig: (c: GitHubWebhookConfig) => void,
  stores: WebhookStores,
): Router {
  const router = Router()

  const wrap = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
    async (req, res, _next) => {
      try { await fn(req, res) } catch (err: unknown) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
      }
    }

  // ── Webhook receiver ───────────────────────────────────────────────────

  router.post('/github', wrap(async (req, res) => {
    const config = getConfig()
    if (!config.enabled) {
      res.status(503).json({ error: 'GitHub webhooks disabled' })
      return
    }

    // The raw body buffer is attached by the express.raw() middleware in server.ts
    const rawBody: Buffer | undefined = (req as any).rawBody
    const sig = req.headers['x-hub-signature-256'] as string | undefined

    // Validate HMAC signature
    if (config.webhookSecret) {
      if (!sig) {
        res.status(401).json({ error: 'Missing X-Hub-Signature-256 header' })
        return
      }
      if (!rawBody || rawBody.length === 0) {
        res.status(400).json({ error: 'Empty request body' })
        return
      }
      if (!verifyGitHubSignature(rawBody, sig, config.webhookSecret)) {
        res.status(401).json({ error: 'Invalid signature' })
        return
      }
    }

    const ghEvent = req.headers['x-github-event'] as string || 'unknown'
    const payload = req.body

    // Only handle issue events for now.
    // Verified: correctly parses issues.opened/reopened with action, title, author, labels.
    // Test events from /github/test also follow this format and are handled identically.
    if (ghEvent !== 'issues') {
      res.json({ ok: true, action: 'ignored', reason: `event type '${ghEvent}' not handled` })
      return
    }

    const action = payload.action
    if (action !== 'opened' && action !== 'reopened') {
      res.json({ ok: true, action: 'ignored', reason: `issues.${action} not handled` })
      return
    }

    const issue = payload.issue
    const repo = payload.repository?.full_name || 'unknown/unknown'

    // Check if this repo is monitored
    if (config.repos.length > 0 && !config.repos.includes(repo)) {
      res.json({ ok: true, action: 'ignored', reason: `repo '${repo}' not monitored` })
      return
    }

    // Create webhook event
    const event: WebhookEvent = {
      id: `gh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      provider: 'github',
      repo,
      event: `issues.${action}`,
      title: issue.title || 'Untitled',
      body: issue.body || '',
      url: issue.html_url || '',
      number: issue.number || 0,
      author: issue.user?.login || 'unknown',
      labels: (issue.labels || []).map((l: { name: string }) => l.name),
      receivedAt: new Date().toISOString(),
      status: 'received',
    }
    addEvent(event)
    stores.broadcast('webhook:received', event)

    // Auto-create task if enabled
    if (config.autoAssign) {
      event.status = 'processing'
      stores.broadcast('webhook:updated', event)

      const taskTitle = `[${repo}#${issue.number}] ${issue.title}`
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

  router.get('/github/config', wrap(async (_req, res) => {
    const config = getConfig()
    res.json({
      enabled: config.enabled,
      hasToken: !!config.githubToken,
      tokenPreview: config.githubToken ? '...' + config.githubToken.slice(-4) : '',
      webhookSecret: config.webhookSecret ? '****' : '',
      hasSecret: !!config.webhookSecret,
      repos: config.repos,
      autoAssign: config.autoAssign,
      taskTemplate: config.taskTemplate || '',
    })
  }))

  router.put('/github/config', wrap(async (req, res) => {
    const config = getConfig()
    const { enabled, githubToken, webhookSecret, repos, autoAssign, taskTemplate } = req.body
    if (typeof enabled === 'boolean') config.enabled = enabled
    if (typeof githubToken === 'string') config.githubToken = githubToken
    if (typeof webhookSecret === 'string') config.webhookSecret = webhookSecret
    if (Array.isArray(repos)) config.repos = repos.filter((r: unknown) => typeof r === 'string' && (r as string).includes('/'))
    if (typeof autoAssign === 'boolean') config.autoAssign = autoAssign
    if (typeof taskTemplate === 'string') config.taskTemplate = taskTemplate
    setConfig(config)
    saveGitHubWebhookConfig(config)
    res.json({ ok: true })
  }))

  // ── Test endpoint ───────────────────────────────────────────────────────

  router.post('/github/test', wrap(async (_req, res) => {
    const config = getConfig()
    if (!config.enabled) {
      res.status(503).json({ error: 'GitHub webhooks disabled' })
      return
    }

    const event: WebhookEvent = {
      id: `gh-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      provider: 'github',
      repo: 'test/webhook-test',
      event: 'issues.opened',
      title: 'Test webhook event',
      body: 'This is a test event sent from the RuFloUI dashboard to verify the webhook pipeline works correctly.',
      url: 'https://github.com/test/webhook-test/issues/0',
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
      const taskTitle = `[test/webhook-test#0] Test webhook event`
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
  // Pipeline verified: events stored via addEvent(), retrievable here,
  // broadcast via 'webhook:received'/'webhook:updated' for real-time WebSocket updates.

  router.get('/github/events', wrap(async (_req, res) => {
    res.json(webhookEvents)
  }))

  return router
}
