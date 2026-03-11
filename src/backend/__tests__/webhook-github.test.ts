// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import {
  verifyGitHubSignature,
  githubWebhookRoutes,
  getWebhookEvents,
  updateWebhookEventByTaskId,
  GitHubWebhookConfig,
  WebhookStores,
} from '../webhook-github'

// ── Helper: generate a valid GitHub-style HMAC signature ──────────────────

function sign(body: string | Buffer, secret: string): string {
  const hmac = createHmac('sha256', secret).update(body).digest('hex')
  return `sha256=${hmac}`
}

// ── Unit tests for verifyGitHubSignature() ────────────────────────────────

describe('verifyGitHubSignature', () => {
  const secret = 'test-webhook-secret'
  const body = '{"action":"opened","issue":{"title":"bug"}}'

  it('returns true for a valid HMAC signature (string payload)', () => {
    const sig = sign(body, secret)
    expect(verifyGitHubSignature(body, sig, secret)).toBe(true)
  })

  it('returns true for a valid HMAC signature (Buffer payload)', () => {
    const buf = Buffer.from(body, 'utf-8')
    const sig = sign(buf, secret)
    expect(verifyGitHubSignature(buf, sig, secret)).toBe(true)
  })

  it('returns false for an invalid HMAC signature', () => {
    const badSig = 'sha256=' + 'a'.repeat(64)
    expect(verifyGitHubSignature(body, badSig, secret)).toBe(false)
  })

  it('returns false when the signature header is undefined', () => {
    expect(verifyGitHubSignature(body, undefined, secret)).toBe(false)
  })

  it('returns false when the signature header is empty string', () => {
    expect(verifyGitHubSignature(body, '', secret)).toBe(false)
  })

  it('returns false when the secret is empty', () => {
    const sig = sign(body, secret)
    expect(verifyGitHubSignature(body, sig, '')).toBe(false)
  })

  it('detects tampered request body', () => {
    const sig = sign(body, secret)
    const tampered = body.replace('bug', 'exploit')
    expect(verifyGitHubSignature(tampered, sig, secret)).toBe(false)
  })

  it('works with signature that lacks sha256= prefix', () => {
    const hmac = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyGitHubSignature(body, hmac, secret)).toBe(true)
  })

  it('rejects a signature with wrong length', () => {
    expect(verifyGitHubSignature(body, 'sha256=abc', secret)).toBe(false)
  })
})

// ── Shared test fixtures ──────────────────────────────────────────────────

/** The test event payload matching the spec */
const testIssuePayload = {
  action: 'opened',
  issue: {
    number: 0,
    title: 'Test webhook event',
    body: 'Test body content',
    html_url: 'https://github.com/test/webhook-test/issues/0',
    user: { login: 'rufloui-test' },
    labels: [{ name: 'test' }],
  },
  repository: { full_name: 'test/webhook-test' },
}

// ── Router helper ─────────────────────────────────────────────────────────

function createTestRouter(overrides?: Partial<GitHubWebhookConfig>) {
  const config: GitHubWebhookConfig = {
    enabled: true,
    githubToken: 'ghp_test',
    webhookSecret: '',
    repos: [],
    autoAssign: false,
    taskTemplate: '',
    ...overrides,
  }

  const stores: WebhookStores = {
    createAndAssignTask: vi.fn().mockResolvedValue({ taskId: 't1', assigned: true }),
    broadcast: vi.fn(),
  }

  const router = githubWebhookRoutes(
    () => config,
    (c) => { Object.assign(config, c) },
    stores,
  )

  return { config, stores, router }
}

/** Find and call a route handler on the Express router */
async function callRoute(
  router: ReturnType<typeof githubWebhookRoutes>,
  method: 'post' | 'get' | 'put',
  path: string,
  opts?: {
    body?: unknown
    rawBody?: Buffer
    headers?: Record<string, string>
  },
): Promise<{ status: number; json: unknown }> {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  )
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} route found`)
  const handler = layer.route.stack[0].handle

  let statusCode = 200
  let jsonBody: unknown = null

  const req = {
    body: opts?.body ?? {},
    rawBody: opts?.rawBody,
    headers: {
      'content-type': 'application/json',
      ...(opts?.headers || {}),
    },
  }

  const res = {
    status(code: number) { statusCode = code; return this },
    json(data: unknown) { jsonBody = data; return this },
  }

  await handler(req, res, () => {})
  return { status: statusCode, json: jsonBody }
}

// ── (1) POST /api/webhooks/github — valid issue event returns 200 + stores event ──

describe('POST /github — valid issue event', () => {
  it('returns 200 and ok:true for a valid opened issue', async () => {
    const { router } = createTestRouter()

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
    expect((json as any).action).toBe('task_created')
    expect((json as any).eventId).toMatch(/^gh-/)
  })

  it('stores the event with correct fields', async () => {
    const { router } = createTestRouter()
    const eventsBefore = getWebhookEvents().length

    await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    const events = getWebhookEvents()
    expect(events.length).toBeGreaterThan(eventsBefore)

    const latest = events[0]
    expect(latest.provider).toBe('github')
    expect(latest.event).toBe('issues.opened')
    expect(latest.title).toBe('Test webhook event')
    expect(latest.author).toBe('rufloui-test')
    expect(latest.labels).toEqual(['test'])
    expect(latest.number).toBe(0)
    expect(latest.repo).toBe('test/webhook-test')
    expect(latest.url).toBe('https://github.com/test/webhook-test/issues/0')
    expect(latest.receivedAt).toBeTruthy()
    expect(latest.status).toBe('received')
  })

  it('broadcasts webhook:received event', async () => {
    const { router, stores } = createTestRouter()

    await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    expect(stores.broadcast).toHaveBeenCalledWith('webhook:received', expect.objectContaining({
      provider: 'github',
      title: 'Test webhook event',
    }))
  })

  it('handles reopened action', async () => {
    const { router } = createTestRouter()
    const reopenedPayload = { ...testIssuePayload, action: 'reopened' }

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: reopenedPayload,
      headers: { 'x-github-event': 'issues' },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)

    const latest = getWebhookEvents()[0]
    expect(latest.event).toBe('issues.reopened')
  })

  it('auto-assigns task when autoAssign is true', async () => {
    const { router, stores } = createTestRouter({ autoAssign: true })

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    expect(status).toBe(200)
    expect((json as any).taskId).toBe('t1')
    expect(stores.createAndAssignTask).toHaveBeenCalledWith(
      '[test/webhook-test#0] Test webhook event',
      expect.stringContaining('GitHub Issue:'),
    )
  })
})

// ── (2) GET /api/webhooks/github/events — returns stored events ───────────

describe('GET /github/events — returns stored events', () => {
  it('returns an array of events', async () => {
    const { router } = createTestRouter()

    // First add an event
    await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    const { status, json } = await callRoute(router, 'get', '/github/events')

    expect(status).toBe(200)
    expect(Array.isArray(json)).toBe(true)
    expect((json as any[]).length).toBeGreaterThan(0)
  })

  it('returns events in reverse chronological order (newest first)', async () => {
    const { router } = createTestRouter()

    // Post two events
    const payload1 = {
      ...testIssuePayload,
      issue: { ...testIssuePayload.issue, title: 'First event' },
    }
    const payload2 = {
      ...testIssuePayload,
      issue: { ...testIssuePayload.issue, title: 'Second event' },
    }

    await callRoute(router, 'post', '/github', {
      body: payload1,
      headers: { 'x-github-event': 'issues' },
    })
    await callRoute(router, 'post', '/github', {
      body: payload2,
      headers: { 'x-github-event': 'issues' },
    })

    const { json } = await callRoute(router, 'get', '/github/events')
    const events = json as any[]

    // Most recent should be first
    const secondIdx = events.findIndex((e: any) => e.title === 'Second event')
    const firstIdx = events.findIndex((e: any) => e.title === 'First event')
    expect(secondIdx).toBeLessThan(firstIdx)
  })

  it('contains all expected fields on each event', async () => {
    const { router } = createTestRouter()

    await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    const { json } = await callRoute(router, 'get', '/github/events')
    const latest = (json as any[])[0]

    expect(latest).toHaveProperty('id')
    expect(latest).toHaveProperty('provider')
    expect(latest).toHaveProperty('repo')
    expect(latest).toHaveProperty('event')
    expect(latest).toHaveProperty('title')
    expect(latest).toHaveProperty('body')
    expect(latest).toHaveProperty('url')
    expect(latest).toHaveProperty('number')
    expect(latest).toHaveProperty('author')
    expect(latest).toHaveProperty('labels')
    expect(latest).toHaveProperty('receivedAt')
    expect(latest).toHaveProperty('status')
  })
})

// ── (3) Invalid payloads — handled gracefully ─────────────────────────────

describe('POST /github — invalid payloads', () => {
  it('ignores non-issue events gracefully', async () => {
    const { router } = createTestRouter()

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: { action: 'created', comment: { body: 'nice' } },
      headers: { 'x-github-event': 'issue_comment' },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
    expect((json as any).action).toBe('ignored')
    expect((json as any).reason).toContain('issue_comment')
  })

  it('ignores unhandled issue actions (e.g. closed)', async () => {
    const { router } = createTestRouter()

    const closedPayload = { ...testIssuePayload, action: 'closed' }

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: closedPayload,
      headers: { 'x-github-event': 'issues' },
    })

    expect(status).toBe(200)
    expect((json as any).action).toBe('ignored')
    expect((json as any).reason).toContain('issues.closed')
  })

  it('handles missing issue fields gracefully (defaults to fallbacks)', async () => {
    const { router } = createTestRouter()

    const minimalPayload = {
      action: 'opened',
      issue: {}, // Missing title, body, user, labels, etc.
      repository: { full_name: 'test/minimal' },
    }

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: minimalPayload,
      headers: { 'x-github-event': 'issues' },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)

    const latest = getWebhookEvents()[0]
    expect(latest.title).toBe('Untitled')
    expect(latest.body).toBe('')
    expect(latest.author).toBe('unknown')
    expect(latest.labels).toEqual([])
    expect(latest.number).toBe(0)
  })

  it('handles completely empty body', async () => {
    const { router } = createTestRouter()

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: {},
      headers: { 'x-github-event': 'issues' },
    })

    // action is undefined, so it should be ignored (not opened/reopened)
    expect(status).toBe(200)
    expect((json as any).action).toBe('ignored')
  })

  it('handles missing x-github-event header (defaults to unknown)', async () => {
    const { router } = createTestRouter()

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: {}, // no x-github-event
    })

    expect(status).toBe(200)
    expect((json as any).action).toBe('ignored')
    expect((json as any).reason).toContain('unknown')
  })

  it('returns 503 when webhooks are disabled', async () => {
    const { router } = createTestRouter({ enabled: false })

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    expect(status).toBe(503)
    expect((json as any).error).toMatch(/disabled/)
  })

  it('ignores repo not in monitored list', async () => {
    const { router } = createTestRouter({ repos: ['allowed/repo'] })

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload, // repo is test/webhook-test, not in allowed list
      headers: { 'x-github-event': 'issues' },
    })

    expect(status).toBe(200)
    expect((json as any).action).toBe('ignored')
    expect((json as any).reason).toContain('not monitored')
  })

  it('returns 401 when signature is missing but secret is configured', async () => {
    const { router } = createTestRouter({ webhookSecret: 'my-secret' })

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      rawBody: Buffer.from(JSON.stringify(testIssuePayload)),
      headers: { 'x-github-event': 'issues' },
    })

    expect(status).toBe(401)
    expect((json as any).error).toBe('Missing X-Hub-Signature-256 header')
  })

  it('returns 400 when rawBody is empty and secret is configured', async () => {
    const { router } = createTestRouter({ webhookSecret: 'my-secret' })

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      rawBody: Buffer.alloc(0),
      headers: {
        'x-github-event': 'issues',
        'x-hub-signature-256': 'sha256=' + 'a'.repeat(64),
      },
    })

    expect(status).toBe(400)
    expect((json as any).error).toBe('Empty request body')
  })

  it('returns 401 for invalid signature when secret is configured', async () => {
    const { router } = createTestRouter({ webhookSecret: 'my-secret' })
    const rawBody = Buffer.from(JSON.stringify(testIssuePayload))

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      rawBody,
      headers: {
        'x-github-event': 'issues',
        'x-hub-signature-256': 'sha256=' + 'f'.repeat(64),
      },
    })

    expect(status).toBe(401)
    expect((json as any).error).toBe('Invalid signature')
  })
})

// ── (4) Config endpoints — GET/PUT /github/config ─────────────────────────

describe('GET /github/config', () => {
  it('returns config with masked secrets', async () => {
    const { router } = createTestRouter({
      githubToken: 'ghp_xxxxxxxxxxxxxxxxxxxx1234',
      webhookSecret: 'supersecret',
      repos: ['owner/repo'],
      autoAssign: true,
    })

    const { status, json } = await callRoute(router, 'get', '/github/config')

    expect(status).toBe(200)
    const data = json as any
    expect(data.enabled).toBe(true)
    expect(data.hasToken).toBe(true)
    expect(data.tokenPreview).toBe('...1234')
    expect(data.hasSecret).toBe(true)
    expect(data.webhookSecret).toBe('****')
    expect(data.repos).toEqual(['owner/repo'])
    expect(data.autoAssign).toBe(true)
  })

  it('shows empty token preview when no token set', async () => {
    const { router } = createTestRouter({ githubToken: '' })

    const { status, json } = await callRoute(router, 'get', '/github/config')

    expect(status).toBe(200)
    const data = json as any
    expect(data.hasToken).toBe(false)
    expect(data.tokenPreview).toBe('')
  })

  it('shows empty secret indicator when no secret set', async () => {
    const { router } = createTestRouter({ webhookSecret: '' })

    const { status, json } = await callRoute(router, 'get', '/github/config')

    expect(status).toBe(200)
    const data = json as any
    expect(data.hasSecret).toBe(false)
    expect(data.webhookSecret).toBe('')
  })
})

describe('PUT /github/config', () => {
  it('updates enabled flag', async () => {
    const { router, config } = createTestRouter({ enabled: false })

    const { status, json } = await callRoute(router, 'put', '/github/config', {
      body: { enabled: true },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
    expect(config.enabled).toBe(true)
  })

  it('updates repos list (filters invalid entries)', async () => {
    const { router, config } = createTestRouter()

    await callRoute(router, 'put', '/github/config', {
      body: { repos: ['valid/repo', 'also-valid/repo2', 'no-slash', ''] },
    })

    // Only entries with '/' should be kept
    expect(config.repos).toEqual(['valid/repo', 'also-valid/repo2'])
  })

  it('updates autoAssign flag', async () => {
    const { router, config } = createTestRouter({ autoAssign: false })

    await callRoute(router, 'put', '/github/config', {
      body: { autoAssign: true },
    })

    expect(config.autoAssign).toBe(true)
  })

  it('updates webhookSecret', async () => {
    const { router, config } = createTestRouter()

    await callRoute(router, 'put', '/github/config', {
      body: { webhookSecret: 'new-secret-value' },
    })

    expect(config.webhookSecret).toBe('new-secret-value')
  })

  it('updates taskTemplate', async () => {
    const { router, config } = createTestRouter()

    await callRoute(router, 'put', '/github/config', {
      body: { taskTemplate: 'Fix {{title}} by {{author}}' },
    })

    expect(config.taskTemplate).toBe('Fix {{title}} by {{author}}')
  })

  it('ignores unknown fields and wrong types', async () => {
    const { router, config } = createTestRouter({
      enabled: true,
      autoAssign: false,
    })

    await callRoute(router, 'put', '/github/config', {
      body: {
        enabled: 'not-a-boolean',    // wrong type, should be ignored
        autoAssign: 123,              // wrong type, should be ignored
        repos: 'not-an-array',        // wrong type, should be ignored
        unknownField: 'whatever',     // unknown field, should be ignored
      },
    })

    // Original values should be unchanged
    expect(config.enabled).toBe(true)
    expect(config.autoAssign).toBe(false)
    expect(config.repos).toEqual([])
  })

  it('updates multiple fields at once', async () => {
    const { router, config } = createTestRouter({
      enabled: false,
      autoAssign: false,
    })

    await callRoute(router, 'put', '/github/config', {
      body: {
        enabled: true,
        autoAssign: true,
        repos: ['new/repo'],
        githubToken: 'ghp_newtoken',
      },
    })

    expect(config.enabled).toBe(true)
    expect(config.autoAssign).toBe(true)
    expect(config.repos).toEqual(['new/repo'])
    expect(config.githubToken).toBe('ghp_newtoken')
  })
})

// ── Signature-protected POST /github (integration) ────────────────────────

describe('POST /github — with HMAC signature validation', () => {
  const secret = 'integration-test-secret'

  it('accepts valid signed request and stores event', async () => {
    const { router } = createTestRouter({ webhookSecret: secret })
    const bodyStr = JSON.stringify(testIssuePayload)
    const rawBody = Buffer.from(bodyStr)
    const sig = sign(rawBody, secret)

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      rawBody,
      headers: {
        'x-github-event': 'issues',
        'x-hub-signature-256': sig,
      },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)

    const latest = getWebhookEvents()[0]
    expect(latest.title).toBe('Test webhook event')
    expect(latest.author).toBe('rufloui-test')
  })

  it('rejects tampered body', async () => {
    const { router } = createTestRouter({ webhookSecret: secret })
    const bodyStr = JSON.stringify(testIssuePayload)
    const rawBody = Buffer.from(bodyStr)
    const sig = sign(rawBody, secret)

    const tampered = { ...testIssuePayload, action: 'deleted' }
    const tamperedRaw = Buffer.from(JSON.stringify(tampered))

    const { status } = await callRoute(router, 'post', '/github', {
      body: tampered,
      rawBody: tamperedRaw,
      headers: {
        'x-github-event': 'issues',
        'x-hub-signature-256': sig,
      },
    })

    expect(status).toBe(401)
  })
})

// ── (5) POST /github/test — test endpoint ──────────────────────────────────

describe('POST /github/test', () => {
  it('returns 503 when webhooks are disabled', async () => {
    const { router } = createTestRouter({ enabled: false })

    const { status, json } = await callRoute(router, 'post', '/github/test')

    expect(status).toBe(503)
    expect((json as any).error).toMatch(/disabled/)
  })

  it('creates a test event when autoAssign is off', async () => {
    const { router } = createTestRouter({ autoAssign: false })

    const { status, json } = await callRoute(router, 'post', '/github/test')

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
    expect((json as any).eventId).toMatch(/^gh-test-/)
    expect((json as any).message).toContain('auto-assign disabled')

    const latest = getWebhookEvents()[0]
    expect(latest.repo).toBe('test/webhook-test')
    expect(latest.title).toBe('Test webhook event')
    expect(latest.author).toBe('rufloui-test')
    expect(latest.status).toBe('received')
  })

  it('creates a test event and task when autoAssign is on', async () => {
    const { router, stores } = createTestRouter({ autoAssign: true })

    const { status, json } = await callRoute(router, 'post', '/github/test')

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
    expect((json as any).taskId).toBe('t1')
    expect((json as any).assigned).toBe(true)
    expect(stores.createAndAssignTask).toHaveBeenCalledWith(
      '[test/webhook-test#0] Test webhook event',
      expect.stringContaining('GitHub Issue:'),
    )
  })

  it('handles createAndAssignTask failure gracefully', async () => {
    const { router, stores } = createTestRouter({ autoAssign: true })
    ;(stores.createAndAssignTask as any).mockRejectedValueOnce(new Error('Swarm down'))

    const { status, json } = await callRoute(router, 'post', '/github/test')

    expect(status).toBe(200)
    expect((json as any).ok).toBe(false)
    expect((json as any).error).toContain('Task creation failed')

    const latest = getWebhookEvents()[0]
    expect(latest.status).toBe('failed')
  })

  it('broadcasts webhook:received event', async () => {
    const { router, stores } = createTestRouter({ autoAssign: false })

    await callRoute(router, 'post', '/github/test')

    expect(stores.broadcast).toHaveBeenCalledWith('webhook:received', expect.objectContaining({
      provider: 'github',
      title: 'Test webhook event',
      repo: 'test/webhook-test',
    }))
  })
})

// ── (6) buildTaskDescription — task template rendering ─────────────────────

describe('buildTaskDescription (via auto-assign)', () => {
  it('uses default template when taskTemplate is empty', async () => {
    const { router, stores } = createTestRouter({ autoAssign: true, taskTemplate: '' })

    await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    const call = (stores.createAndAssignTask as any).mock.calls[0]
    const desc: string = call[1]
    expect(desc).toContain('GitHub Issue:')
    expect(desc).toContain('Author: rufloui-test')
    expect(desc).toContain('Labels: test')
    expect(desc).toContain('Test body content') // body included in header
    expect(desc).toContain('Instructions:')
    expect(desc).toContain('Analyze this issue') // default template text
  })

  it('renders custom template with all placeholders', async () => {
    const template = 'Fix {{title}} in {{repo}}#{{number}} by {{author}}. Labels: {{labels}}. URL: {{url}}'
    const { router, stores } = createTestRouter({ autoAssign: true, taskTemplate: template })

    await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    const call = (stores.createAndAssignTask as any).mock.calls[0]
    const desc: string = call[1]
    expect(desc).toContain('Fix Test webhook event in test/webhook-test#0 by rufloui-test')
    expect(desc).toContain('Labels: test')
    expect(desc).toContain('URL: https://github.com/test/webhook-test/issues/0')
  })

  it('avoids body duplication when template includes {{body}}', async () => {
    const template = 'Issue details: {{body}}'
    const { router, stores } = createTestRouter({ autoAssign: true, taskTemplate: template })

    await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    const call = (stores.createAndAssignTask as any).mock.calls[0]
    const desc: string = call[1]
    // Body should appear in the rendered instructions but NOT in the header
    const lines = desc.split('\n')
    const beforeInstructions = lines.slice(0, lines.indexOf('---'))
    const bodyOccurrencesInHeader = beforeInstructions.filter(l => l.includes('Test body content')).length
    expect(bodyOccurrencesInHeader).toBe(0)
    // But body IS in the rendered instructions
    expect(desc).toContain('Issue details: Test body content')
  })

  it('includes body in header when template does NOT use {{body}}', async () => {
    const template = 'Just fix {{title}}'
    const { router, stores } = createTestRouter({ autoAssign: true, taskTemplate: template })

    await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    const call = (stores.createAndAssignTask as any).mock.calls[0]
    const desc: string = call[1]
    const lines = desc.split('\n')
    const beforeInstructions = lines.slice(0, lines.indexOf('---'))
    const bodyInHeader = beforeInstructions.some(l => l.includes('Test body content'))
    expect(bodyInHeader).toBe(true)
  })

  it('truncates long body to 2000 chars', async () => {
    const longBody = 'Z'.repeat(3000)
    const payload = {
      ...testIssuePayload,
      issue: { ...testIssuePayload.issue, body: longBody },
    }
    const { router, stores } = createTestRouter({ autoAssign: true })

    await callRoute(router, 'post', '/github', {
      body: payload,
      headers: { 'x-github-event': 'issues' },
    })

    const call = (stores.createAndAssignTask as any).mock.calls[0]
    const desc: string = call[1]
    // Body is truncated to 2000 chars via .slice(0, 2000)
    // It appears once in the header section (no {{body}} in default template)
    const zCount = (desc.match(/Z/g) || []).length
    expect(zCount).toBe(2000)
  })
})

// ── (7) autoAssign failure in webhook receiver ─────────────────────────────

describe('POST /github — autoAssign failure path', () => {
  it('marks event as failed when createAndAssignTask throws', async () => {
    const { router, stores } = createTestRouter({ autoAssign: true })
    ;(stores.createAndAssignTask as any).mockRejectedValueOnce(new Error('No swarm'))

    const { status, json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)

    const latest = getWebhookEvents()[0]
    expect(latest.status).toBe('failed')
  })

  it('broadcasts webhook:updated with failed status on error', async () => {
    const { router, stores } = createTestRouter({ autoAssign: true })
    ;(stores.createAndAssignTask as any).mockRejectedValueOnce(new Error('Boom'))

    await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    // Should broadcast updated with failed status
    const updatedCalls = (stores.broadcast as any).mock.calls.filter(
      (c: any[]) => c[0] === 'webhook:updated'
    )
    const lastUpdate = updatedCalls[updatedCalls.length - 1]
    expect(lastUpdate[1].status).toBe('failed')
  })
})

// ── (8) updateWebhookEventByTaskId ─────────────────────────────────────────

describe('updateWebhookEventByTaskId', () => {
  it('updates event status when matching taskId found', async () => {
    const { router } = createTestRouter({ autoAssign: true })

    const { json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    const taskId = (json as any).taskId
    expect(taskId).toBe('t1')

    // Now simulate task completion
    updateWebhookEventByTaskId(taskId, 'completed')

    const events = getWebhookEvents()
    const event = events.find(e => e.taskId === taskId)
    expect(event?.status).toBe('completed')
  })

  it('updates event status to failed', async () => {
    const { router } = createTestRouter({ autoAssign: true })

    const { json } = await callRoute(router, 'post', '/github', {
      body: testIssuePayload,
      headers: { 'x-github-event': 'issues' },
    })

    const taskId = (json as any).taskId
    updateWebhookEventByTaskId(taskId, 'failed')

    const event = getWebhookEvents().find(e => e.taskId === taskId)
    expect(event?.status).toBe('failed')
  })

  it('is a no-op when taskId does not match any event', () => {
    // Should not throw
    updateWebhookEventByTaskId('nonexistent-task-id', 'completed')
    // Just verify it doesn't throw — no assertion needed beyond this point
  })
})

// ── (9) GET /github/config — taskTemplate field ────────────────────────────

describe('GET /github/config — taskTemplate field', () => {
  it('returns taskTemplate when set', async () => {
    const { router } = createTestRouter({ taskTemplate: 'Custom: {{title}} fix' })

    const { status, json } = await callRoute(router, 'get', '/github/config')

    expect(status).toBe(200)
    expect((json as any).taskTemplate).toBe('Custom: {{title}} fix')
  })

  it('returns empty string when taskTemplate is not set', async () => {
    const { router } = createTestRouter({ taskTemplate: '' })

    const { status, json } = await callRoute(router, 'get', '/github/config')

    expect(status).toBe(200)
    expect((json as any).taskTemplate).toBe('')
  })
})
