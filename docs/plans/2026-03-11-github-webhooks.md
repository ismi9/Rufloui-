# GitHub Webhook Integration — Issue-to-Task Pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Receive GitHub webhook events (issue opened) and automatically create + assign swarm tasks that investigate, code, test, and submit a PR to resolve the issue.

**Architecture:** A new `webhook-github.ts` backend module receives `POST /api/webhooks/github` with HMAC-SHA256 validation, normalizes the payload into a `WebhookEvent`, persists it, creates a task via the existing `createAndAssignTask` pattern, and broadcasts events to the frontend. A new `WebhooksPanel.tsx` page lets users configure the GitHub integration (token, secret, repos) and view incoming event history. The existing swarm pipeline (`launchWorkflowForTask`) handles all execution — no changes needed there.

**Tech Stack:** Express routes, Node.js `crypto` (HMAC), GitHub REST API via `fetch`, React 19 page, Zustand store slice, existing swarm pipeline.

---

## Task 1: Backend — Webhook Config Persistence

**Files:**
- Create: `src/backend/webhook-github.ts`
- Modify: `src/backend/server.ts:23-35` (near telegram config)

### Step 1: Create the config types and load/save functions

Create `src/backend/webhook-github.ts` with config types and persistence (following the Telegram pattern in `server.ts:23-80`):

```typescript
import { createHmac } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs'
import { join } from 'path'

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
}

export interface WebhookEvent {
  id: string
  provider: 'github'
  repo: string
  event: string           // 'issues.opened', 'issues.reopened', etc.
  title: string
  body: string
  url: string             // HTML URL of the issue
  number: number
  author: string
  labels: string[]
  receivedAt: string
  taskId?: string         // Linked RuFloUI task ID (set after task creation)
  status: 'received' | 'processing' | 'completed' | 'failed' | 'ignored'
}

export interface GitHubWebhookHandle {
  getConfig: () => GitHubWebhookConfig
  getEvents: () => WebhookEvent[]
}

const DEFAULT_CONFIG: GitHubWebhookConfig = {
  enabled: false,
  githubToken: '',
  webhookSecret: '',
  repos: [],
  autoAssign: true,
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
  payload: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
  // Constant-time comparison
  if (expected.length !== signature.length) return false
  let result = 0
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return result === 0
}
```

### Step 2: Commit

```bash
git add src/backend/webhook-github.ts
git commit -m "feat(webhooks): add GitHub webhook config types and persistence"
```

---

## Task 2: Backend — Webhook Receiver Route

**Files:**
- Modify: `src/backend/webhook-github.ts` (add route factory)
- Modify: `src/backend/server.ts:2707-2721` (mount route)

### Step 1: Add the webhook route factory and config API to webhook-github.ts

Append to `src/backend/webhook-github.ts`:

```typescript
import { Router, Request, Response, RequestHandler } from 'express'

// ── In-memory event store ──────────────────────────────────────────────────

const MAX_EVENTS = 200
let webhookEvents: WebhookEvent[] = []

function addEvent(event: WebhookEvent): void {
  webhookEvents.unshift(event)
  if (webhookEvents.length > MAX_EVENTS) webhookEvents = webhookEvents.slice(0, MAX_EVENTS)
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

  // Error wrapper (same pattern as server.ts h())
  const wrap = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
    async (req, res, _next) => {
      try { await fn(req, res) } catch (err: unknown) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
      }
    }

  // ── Webhook receiver ───────────────────────────────────────────────────

  // GitHub sends POST with X-Hub-Event header and X-Hub-Signature-256
  // Raw body is needed for HMAC — we parse JSON ourselves
  router.post('/github', wrap(async (req, res) => {
    const config = getConfig()
    if (!config.enabled) {
      res.status(503).json({ error: 'GitHub webhooks disabled' })
      return
    }

    // Validate HMAC signature
    const rawBody = JSON.stringify(req.body) // express.json() already parsed
    const sig = req.headers['x-hub-signature-256'] as string | undefined
    if (config.webhookSecret && !verifyGitHubSignature(rawBody, sig, config.webhookSecret)) {
      res.status(401).json({ error: 'Invalid signature' })
      return
    }

    const ghEvent = req.headers['x-github-event'] as string || 'unknown'
    const payload = req.body

    // Only handle issue events for now
    if (ghEvent !== 'issues') {
      res.json({ ok: true, action: 'ignored', reason: `event type '${ghEvent}' not handled` })
      return
    }

    const action = payload.action // 'opened', 'reopened', 'edited', etc.
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
      const taskDesc = [
        `GitHub Issue: ${issue.html_url}`,
        `Author: ${issue.user?.login}`,
        `Labels: ${event.labels.join(', ') || 'none'}`,
        '',
        issue.body?.slice(0, 2000) || 'No description provided.',
        '',
        '---',
        'Instructions: Analyze this issue, investigate the codebase, implement a fix, write tests, and prepare a summary of changes.',
      ].join('\n')

      try {
        const result = await stores.createAndAssignTask(taskTitle, taskDesc)
        event.taskId = result.taskId
        event.status = result.assigned ? 'processing' : 'received'
        stores.broadcast('webhook:updated', event)
      } catch (err) {
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
    })
  }))

  router.put('/github/config', wrap(async (req, res) => {
    const config = getConfig()
    const { enabled, githubToken, webhookSecret, repos, autoAssign } = req.body
    if (typeof enabled === 'boolean') config.enabled = enabled
    if (typeof githubToken === 'string') config.githubToken = githubToken
    if (typeof webhookSecret === 'string') config.webhookSecret = webhookSecret
    if (Array.isArray(repos)) config.repos = repos.filter((r: unknown) => typeof r === 'string' && r.includes('/'))
    if (typeof autoAssign === 'boolean') config.autoAssign = autoAssign
    setConfig(config)
    saveGitHubWebhookConfig(config)
    res.json({ ok: true })
  }))

  // ── Events API ─────────────────────────────────────────────────────────

  router.get('/github/events', wrap(async (_req, res) => {
    res.json(webhookEvents)
  }))

  return router
}
```

### Step 2: Mount in server.ts

Add import near line 11 (after telegram import):

```typescript
import { loadGitHubWebhookConfig, saveGitHubWebhookConfig, GitHubWebhookConfig, githubWebhookRoutes } from './webhook-github'
```

Add state near line 23 (after telegram config block):

```typescript
let githubWebhookConfig = loadGitHubWebhookConfig()
```

Mount route near line 2721 (after `app.use('/api/ai-defence', ...)`):

```typescript
app.use('/api/webhooks', githubWebhookRoutes(
  () => githubWebhookConfig,
  (c) => { githubWebhookConfig = c },
  {
    createAndAssignTask: async (title: string, description: string) => {
      const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const task = { id, title, description, status: 'pending', priority: 'high', createdAt: new Date().toISOString() }
      taskStore.set(id, task as any)
      broadcast('task:added', task)
      if (!swarmShutdown) {
        ;(task as any).status = 'in_progress'
        ;(task as any).startedAt = new Date().toISOString()
        broadcast('task:updated', { ...task, id })
        launchWorkflowForTask(id, title, description)
        return { taskId: id, assigned: true }
      }
      return { taskId: id, assigned: false }
    },
    broadcast,
  },
))
```

### Step 3: Commit

```bash
git add src/backend/webhook-github.ts src/backend/server.ts
git commit -m "feat(webhooks): add GitHub webhook receiver with HMAC validation and auto-task creation"
```

---

## Task 3: Frontend — API Client + Types

**Files:**
- Modify: `src/frontend/api.ts:253` (before closing `}` of `api` object)
- Modify: `src/frontend/types.ts` (append)

### Step 1: Add WebhookEvent type to types.ts

Append to `src/frontend/types.ts`:

```typescript
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

export interface GitHubWebhookStatus {
  enabled: boolean
  hasToken: boolean
  tokenPreview: string
  webhookSecret: string
  hasSecret: boolean
  repos: string[]
  autoAssign: boolean
}
```

### Step 2: Add API namespace to api.ts

Insert before the closing `}` of the `api` object (before `aiDefence` closing, around line 253):

```typescript
  webhooks: {
    getGitHubConfig: () => request<GitHubWebhookStatus>('/webhooks/github/config'),
    setGitHubConfig: (config: Record<string, unknown>) =>
      request('/webhooks/github/config', { method: 'PUT', body: JSON.stringify(config) }),
    getGitHubEvents: () => request<WebhookEvent[]>('/webhooks/github/events'),
  },
```

Add to imports at top of `api.ts`:

```typescript
import type { WebhookEvent, GitHubWebhookStatus } from '@/types'
```

### Step 3: Commit

```bash
git add src/frontend/api.ts src/frontend/types.ts
git commit -m "feat(webhooks): add frontend API client and types for GitHub webhooks"
```

---

## Task 4: Frontend — WebhooksPanel Page

**Files:**
- Create: `src/frontend/pages/WebhooksPanel.tsx`

### Step 1: Create the page

Create `src/frontend/pages/WebhooksPanel.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api } from '@/api'
import type { WebhookEvent, GitHubWebhookStatus } from '@/types'

const styles = {
  page: {
    display: 'flex', flexDirection: 'column' as const, gap: '1.5rem',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  title: {
    fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem',
  },
  grid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem',
  },
  field: {
    display: 'flex', flexDirection: 'column' as const, gap: '0.35rem', marginBottom: '0.75rem',
  },
  label: {
    fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  },
  input: {
    padding: '0.5rem 0.75rem', borderRadius: '6px',
    border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '0.9rem', width: '100%',
  },
  row: {
    display: 'flex', gap: '0.5rem', alignItems: 'center',
  },
  toggle: {
    display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
  },
  eventRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.6rem 0', borderBottom: '1px solid var(--border-primary)',
  },
  eventTitle: {
    fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem',
  },
  eventMeta: {
    fontSize: '0.8rem', color: 'var(--text-muted)',
  },
  badge: {
    fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px',
    fontWeight: 600,
  },
  webhookUrl: {
    padding: '0.5rem 0.75rem', borderRadius: '6px',
    background: 'var(--bg-tertiary)', color: 'var(--accent-green)',
    fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' as const,
    border: '1px solid var(--border-primary)',
  },
  instructions: {
    fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6,
  },
  msg: (ok: boolean) => ({
    fontSize: '0.85rem', padding: '0.5rem 0.75rem', borderRadius: '6px', marginTop: '0.5rem',
    background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
    color: ok ? 'var(--accent-green)' : 'var(--accent-red)',
    border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
  }),
}

export default function WebhooksPanel() {
  const [config, setConfig] = useState<GitHubWebhookStatus | null>(null)
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Form fields
  const [enabled, setEnabled] = useState(false)
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [repos, setRepos] = useState('')
  const [autoAssign, setAutoAssign] = useState(true)

  const fetchConfig = useCallback(async () => {
    try {
      const c = await api.webhooks.getGitHubConfig()
      setConfig(c)
      setEnabled(c.enabled)
      setAutoAssign(c.autoAssign)
      setRepos(c.repos.join(', '))
    } catch { /* ignore */ }
  }, [])

  const fetchEvents = useCallback(async () => {
    try {
      const evts = await api.webhooks.getGitHubEvents()
      setEvents(evts)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchConfig()
    fetchEvents()
    const interval = setInterval(fetchEvents, 10_000)
    return () => clearInterval(interval)
  }, [fetchConfig, fetchEvents])

  const handleSave = async () => {
    setSaving(true)
    setMsg('')
    try {
      const update: Record<string, unknown> = {
        enabled,
        autoAssign,
        repos: repos.split(',').map(r => r.trim()).filter(Boolean),
      }
      if (token) update.githubToken = token
      if (secret) update.webhookSecret = secret
      await api.webhooks.setGitHubConfig(update)
      setMsg('Saved!')
      setEditing(false)
      setToken('')
      setSecret('')
      await fetchConfig()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const webhookUrl = `${window.location.origin}/api/webhooks/github`

  const statusColor = (s: string) => {
    if (s === 'completed') return 'var(--accent-green)'
    if (s === 'processing') return 'var(--accent-orange)'
    if (s === 'failed') return 'var(--accent-red)'
    if (s === 'ignored') return 'var(--text-muted)'
    return 'var(--accent-blue)'
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Webhooks</div>
          <div style={styles.subtitle}>Receive events from external services and trigger swarm tasks</div>
        </div>
      </div>

      {/* GitHub Configuration */}
      <Card title="GitHub Integration" actions={
        !editing
          ? <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>
          : undefined
      }>
        {/* Status banner */}
        <div style={{
          display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem',
          padding: '0.5rem 0.75rem', borderRadius: '6px',
          background: config?.enabled ? 'rgba(34,197,94,0.1)' : 'rgba(100,100,100,0.1)',
          border: `1px solid ${config?.enabled ? 'rgba(34,197,94,0.3)' : 'rgba(100,100,100,0.3)'}`,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: config?.enabled ? 'var(--accent-green)' : 'var(--text-muted)',
          }} />
          <span style={{ fontSize: '0.85rem', color: config?.enabled ? 'var(--accent-green)' : 'var(--text-muted)' }}>
            {config?.enabled ? 'Enabled' : 'Disabled'}
            {config?.enabled && config?.hasToken ? ' — Token configured' : ''}
          </span>
        </div>

        {editing ? (
          <>
            <div style={styles.field}>
              <label style={styles.toggle}>
                <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Enable GitHub Webhooks</span>
              </label>
            </div>

            <div style={styles.field}>
              <span style={styles.label}>GitHub Token (repo scope)</span>
              <input
                style={styles.input}
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder={config?.hasToken ? `Current: ${config.tokenPreview}` : 'ghp_...'}
              />
            </div>

            <div style={styles.field}>
              <span style={styles.label}>Webhook Secret</span>
              <input
                style={styles.input}
                type="password"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                placeholder={config?.hasSecret ? 'Current: ****' : 'Optional but recommended'}
              />
            </div>

            <div style={styles.field}>
              <span style={styles.label}>Monitored Repos (comma-separated, e.g. owner/repo)</span>
              <input
                style={styles.input}
                value={repos}
                onChange={e => setRepos(e.target.value)}
                placeholder="owner/repo1, owner/repo2 (empty = all)"
              />
            </div>

            <div style={styles.field}>
              <label style={styles.toggle}>
                <input type="checkbox" checked={autoAssign} onChange={e => setAutoAssign(e.target.checked)} />
                <span style={{ color: 'var(--text-primary)' }}>Auto-create and assign tasks for new issues</span>
              </label>
            </div>

            <div style={styles.row}>
              <Button variant="primary" loading={saving} onClick={handleSave}>Save</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
            {msg && <div style={styles.msg(/saved/i.test(msg))}>{msg}</div>}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={styles.instructions}>
              <strong>Repos:</strong> {config?.repos.length ? config.repos.join(', ') : 'All (no filter)'}
            </div>
            <div style={styles.instructions}>
              <strong>Auto-assign:</strong> {config?.autoAssign ? 'Yes' : 'No'}
            </div>
          </div>
        )}
      </Card>

      {/* Webhook URL */}
      <Card title="Webhook URL">
        <div style={styles.instructions}>
          Copy this URL into your GitHub repo settings under <strong>Settings &gt; Webhooks &gt; Add webhook</strong>.
          Set content type to <code>application/json</code> and select <strong>Issues</strong> events.
        </div>
        <div style={{ ...styles.webhookUrl, marginTop: '0.75rem' }}>{webhookUrl}</div>
      </Card>

      {/* Event History */}
      <Card title="Recent Events" actions={
        <Button size="sm" variant="ghost" onClick={fetchEvents}>Refresh</Button>
      }>
        {events.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: '1rem 0', textAlign: 'center' }}>
            No webhook events received yet
          </div>
        ) : (
          events.map(evt => (
            <div key={evt.id} style={styles.eventRow}>
              <div>
                <div style={styles.eventTitle}>
                  {evt.repo}#{evt.number} — {evt.title}
                </div>
                <div style={styles.eventMeta}>
                  {evt.event} by {evt.author} — {new Date(evt.receivedAt).toLocaleString()}
                  {evt.taskId && <span> — Task: {evt.taskId}</span>}
                </div>
              </div>
              <span style={{
                ...styles.badge,
                color: statusColor(evt.status),
                background: statusColor(evt.status) + '20',
              }}>
                {evt.status}
              </span>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
```

### Step 2: Commit

```bash
git add src/frontend/pages/WebhooksPanel.tsx
git commit -m "feat(webhooks): add WebhooksPanel page with config UI and event history"
```

---

## Task 5: Frontend — Wire Up Route, Nav, and WebSocket

**Files:**
- Modify: `src/frontend/App.tsx:24` (add lazy import) and `App.tsx:395-ish` (add route)
- Modify: `src/frontend/components/Layout.tsx:22` (add icon import) and `Layout.tsx:54` (add nav item)

### Step 1: Add lazy import and route in App.tsx

After line 24 (`const SwarmMonitorPanel = ...`), add:

```typescript
const WebhooksPanel = React.lazy(() => import('./pages/WebhooksPanel'))
```

In the `<Routes>` block, add a new `<Route>` after the config route (around line 395):

```tsx
<Route
  path="webhooks"
  element={
    <Suspense fallback={<LoadingSpinner />}>
      <WebhooksPanel />
    </Suspense>
  }
/>
```

### Step 2: Add sidebar nav item in Layout.tsx

Add `Webhook` icon to the import from `lucide-react` (line 4-22):

```typescript
import { ..., Webhook } from 'lucide-react'
```

Add nav item to the **Operations** group (line 65-71), after the Sessions entry:

```typescript
{
  title: 'Operations',
  items: [
    { label: 'Workflows', to: '/workflows', icon: Workflow },
    { label: 'Hooks', to: '/hooks', icon: Terminal },
    { label: 'Sessions', to: '/sessions', icon: Save },
    { label: 'Webhooks', to: '/webhooks', icon: Webhook },
  ],
},
```

### Step 3: Commit

```bash
git add src/frontend/App.tsx src/frontend/components/Layout.tsx
git commit -m "feat(webhooks): wire up WebhooksPanel route and sidebar navigation"
```

---

## Task 6: Backend — Update Webhook Event Status on Task Completion

**Files:**
- Modify: `src/backend/webhook-github.ts` (export function to update event status)
- Modify: `src/backend/server.ts` (hook into broadcast for task:updated)

### Step 1: Add event status updater to webhook-github.ts

Add exported function:

```typescript
export function updateWebhookEventByTaskId(taskId: string, status: WebhookEvent['status']): void {
  const event = webhookEvents.find(e => e.taskId === taskId)
  if (event) event.status = status
}

export function getWebhookEvents(): WebhookEvent[] {
  return webhookEvents
}
```

### Step 2: Hook into broadcast in server.ts

In the `broadcast()` function (around line 268, after the telegram line), add:

```typescript
// Update webhook event status when linked task completes/fails
if (type === 'task:updated') {
  const p = payload as { id?: string; status?: string }
  if (p?.id && (p.status === 'completed' || p.status === 'failed')) {
    updateWebhookEventByTaskId(p.id, p.status as 'completed' | 'failed')
  }
}
```

Add the import at the top of server.ts:

```typescript
import { ..., updateWebhookEventByTaskId } from './webhook-github'
```

### Step 3: Commit

```bash
git add src/backend/webhook-github.ts src/backend/server.ts
git commit -m "feat(webhooks): update webhook event status when linked task completes"
```

---

## Task 7: Documentation Updates

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`
- Modify: `.env.example`

### Step 1: Add to .env.example

```
# GitHub Webhooks
GITHUB_WEBHOOK_ENABLED=false
GITHUB_TOKEN=
GITHUB_WEBHOOK_SECRET=
GITHUB_WEBHOOK_REPOS=owner/repo1,owner/repo2
```

### Step 2: Add Webhooks section to README.md

After the Telegram section, add:

```markdown
## GitHub Webhooks (Optional)

Automatically create swarm tasks when GitHub issues are opened.

### Setup

1. Open the RuFloUI dashboard, go to **Webhooks** in the sidebar.
2. Click **Edit**, enable GitHub Webhooks, paste your GitHub token (needs `repo` scope).
3. Optionally add a webhook secret and list repos to monitor.
4. Copy the **Webhook URL** shown on the page.
5. In your GitHub repo, go to **Settings > Webhooks > Add webhook**.
6. Paste the URL, set content type to `application/json`, select **Issues** events.

### How It Works

When a new issue is opened in a monitored repo:

1. GitHub sends a POST to RuFloUI's webhook endpoint
2. RuFloUI validates the HMAC signature (if secret configured)
3. A high-priority task is created with the issue title and body
4. If a swarm is active, the task is auto-assigned to the multi-agent pipeline
5. Agents investigate, code, test, and produce a result
6. Event status updates in the Webhooks page as the task progresses

### Environment Variables (alternative to dashboard)

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_WEBHOOK_ENABLED` | `false` | Enable webhook receiver |
| `GITHUB_TOKEN` | — | GitHub PAT with `repo` scope |
| `GITHUB_WEBHOOK_SECRET` | — | HMAC secret for signature validation |
| `GITHUB_WEBHOOK_REPOS` | — | Comma-separated `owner/repo` list |
```

### Step 3: Add to CHANGELOG.md

Add under a new version header (or append to current if unreleased):

```markdown
## [Unreleased]

### Added

- **GitHub Webhook Integration** — Receive GitHub issue events and auto-create swarm tasks
  - Webhook endpoint `POST /api/webhooks/github` with HMAC-SHA256 signature validation
  - Dashboard UI (Webhooks page) with config editor, webhook URL, and event history
  - Auto-creates high-priority tasks from new/reopened issues
  - Auto-assigns to active swarm pipeline (researcher → coder → tester → reviewer)
  - Event status tracking (received → processing → completed/failed)
  - Config persisted to `.ruflo/github-webhook.json`
  - Fallback to environment variables when no dashboard config
```

### Step 4: Add webhook routes to CLAUDE.md API routes table

In the API routes table, add:

```markdown
| `/api/webhooks` | POST github, GET/PUT github/config, GET github/events | GitHub webhook receiver + config |
```

### Step 5: Commit

```bash
git add README.md CHANGELOG.md CLAUDE.md .env.example
git commit -m "docs: add GitHub webhook integration documentation"
```

---

## Task 8: Manual Testing Checklist

Run these checks to verify the integration:

1. **Build check**: `npx tsc --noEmit` — must pass with zero errors
2. **No-config startup**: Start server without GitHub env vars → no errors, webhook endpoint returns 503
3. **Config save**: Enable via Webhooks page, save token + secret + repos → config persists in `.ruflo/github-webhook.json`
4. **Webhook URL**: Shown correctly on page, copyable
5. **Simulated webhook**: `curl -X POST http://localhost:3001/api/webhooks/github -H "Content-Type: application/json" -H "X-GitHub-Event: issues" -d '{"action":"opened","issue":{"title":"Test issue","body":"Fix the bug","number":42,"html_url":"https://github.com/test/repo/issues/42","user":{"login":"testuser"},"labels":[]},"repository":{"full_name":"test/repo"}}'` → should create task and appear in events list
6. **Event history**: Events page shows received webhook with status
7. **Ignored events**: Push event returns `action: ignored`
8. **HMAC validation**: Request with wrong signature returns 401
9. **Sidebar nav**: "Webhooks" appears under Operations with Webhook icon
10. **Telegram notification**: If Telegram enabled, task completion notification fires for webhook-created tasks

---

## Summary

| Task | Description | Files | Estimated Size |
|------|-------------|-------|---------------|
| 1 | Config types + persistence | `webhook-github.ts` (new) | ~100 lines |
| 2 | Webhook receiver route + config API | `webhook-github.ts` + `server.ts` | ~150 lines + 20 lines |
| 3 | Frontend API client + types | `api.ts` + `types.ts` | ~25 lines |
| 4 | WebhooksPanel page | `WebhooksPanel.tsx` (new) | ~250 lines |
| 5 | Route + nav wiring | `App.tsx` + `Layout.tsx` | ~10 lines each |
| 6 | Event status sync | `webhook-github.ts` + `server.ts` | ~15 lines |
| 7 | Documentation | `README`, `CHANGELOG`, `CLAUDE.md`, `.env.example` | ~50 lines |
| 8 | Manual testing | N/A | Verification only |

**Total new code:** ~600 lines across 2 new files + edits to 6 existing files.
