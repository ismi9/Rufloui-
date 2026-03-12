// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  gitlabWebhookRoutes,
  getGitLabWebhookEvents,
  updateGitLabEventByTaskId,
  GitLabWebhookConfig,
  GitLabWebhookStores,
} from '../webhook-gitlab'

// ── Shared test fixtures ──────────────────────────────────────────────────

const testIssuePayload = {
  object_attributes: {
    action: 'open',
    title: 'Test GitLab issue',
    description: 'Test body content',
    url: 'https://gitlab.com/group/project/-/issues/42',
    iid: 42,
  },
  project: { path_with_namespace: 'group/project' },
  user: { username: 'gitlab-dev' },
  labels: [{ title: 'bug' }, { title: 'urgent' }],
}

// ── Router helper ─────────────────────────────────────────────────────────

function createTestRouter(overrides?: Partial<GitLabWebhookConfig>) {
  const config: GitLabWebhookConfig = {
    enabled: true,
    gitlabToken: 'glpat-test',
    webhookSecret: '',
    repos: [],
    autoAssign: false,
    taskTemplate: '',
    ...overrides,
  }

  const stores: GitLabWebhookStores = {
    createAndAssignTask: vi.fn().mockResolvedValue({ taskId: 't1', assigned: true }),
    broadcast: vi.fn(),
  }

  const router = gitlabWebhookRoutes(
    () => config,
    (c) => { Object.assign(config, c) },
    stores,
  )

  return { config, stores, router }
}

/** Find and call a route handler on the Express router */
async function callRoute(
  router: ReturnType<typeof gitlabWebhookRoutes>,
  method: 'post' | 'get' | 'put',
  path: string,
  opts?: {
    body?: unknown
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

// ── POST /gitlab — valid issue event ──────────────────────────────────────

describe('POST /gitlab — valid issue event', () => {
  it('returns 200 and ok:true for a valid opened issue', async () => {
    const { router } = createTestRouter()

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
    expect((json as any).action).toBe('task_created')
    expect((json as any).eventId).toMatch(/^gl-/)
  })

  it('stores the event with correct fields', async () => {
    const { router } = createTestRouter()
    const eventsBefore = getGitLabWebhookEvents().length

    await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    const events = getGitLabWebhookEvents()
    expect(events.length).toBeGreaterThan(eventsBefore)

    const latest = events[0]
    expect(latest.provider).toBe('gitlab')
    expect(latest.event).toBe('issue.open')
    expect(latest.title).toBe('Test GitLab issue')
    expect(latest.author).toBe('gitlab-dev')
    expect(latest.labels).toEqual(['bug', 'urgent'])
    expect(latest.number).toBe(42)
    expect(latest.repo).toBe('group/project')
    expect(latest.url).toBe('https://gitlab.com/group/project/-/issues/42')
    expect(latest.receivedAt).toBeTruthy()
    expect(latest.status).toBe('received')
  })

  it('broadcasts webhook:received event', async () => {
    const { router, stores } = createTestRouter()

    await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(stores.broadcast).toHaveBeenCalledWith('webhook:received', expect.objectContaining({
      provider: 'gitlab',
      event: 'issue.open',
    }))
  })

  it('handles reopen action', async () => {
    const { router } = createTestRouter()
    const payload = {
      ...testIssuePayload,
      object_attributes: { ...testIssuePayload.object_attributes, action: 'reopen' },
    }

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: payload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
  })
})

// ── POST /gitlab — disabled ───────────────────────────────────────────────

describe('POST /gitlab — disabled', () => {
  it('returns 503 when webhooks are disabled', async () => {
    const { router } = createTestRouter({ enabled: false })

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(503)
    expect((json as any).error).toMatch(/disabled/i)
  })
})

// ── POST /gitlab — token validation ──────────────────────────────────────

describe('POST /gitlab — token validation', () => {
  it('returns 401 when X-Gitlab-Token header is missing', async () => {
    const { router } = createTestRouter({ webhookSecret: 'my-secret' })

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(401)
    expect((json as any).error).toMatch(/missing/i)
  })

  it('returns 401 when X-Gitlab-Token does not match', async () => {
    const { router } = createTestRouter({ webhookSecret: 'my-secret' })

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook', 'x-gitlab-token': 'wrong-secret' },
    })

    expect(status).toBe(401)
    expect((json as any).error).toMatch(/invalid/i)
  })

  it('accepts correct X-Gitlab-Token', async () => {
    const { router } = createTestRouter({ webhookSecret: 'my-secret' })

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook', 'x-gitlab-token': 'my-secret' },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
  })

  it('skips token validation when no secret configured', async () => {
    const { router } = createTestRouter({ webhookSecret: '' })

    const { status } = await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
  })
})

// ── POST /gitlab — event filtering ───────────────────────────────────────

describe('POST /gitlab — event filtering', () => {
  it('ignores non-Issue Hook events', async () => {
    const { router } = createTestRouter()

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: {},
      headers: { 'x-gitlab-event': 'Push Hook' },
    })

    expect(status).toBe(200)
    expect((json as any).action).toBe('ignored')
  })

  it('ignores close action on issues', async () => {
    const { router } = createTestRouter()
    const payload = {
      ...testIssuePayload,
      object_attributes: { ...testIssuePayload.object_attributes, action: 'close' },
    }

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: payload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    expect((json as any).action).toBe('ignored')
  })

  it('ignores update action on issues', async () => {
    const { router } = createTestRouter()
    const payload = {
      ...testIssuePayload,
      object_attributes: { ...testIssuePayload.object_attributes, action: 'update' },
    }

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: payload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    expect((json as any).action).toBe('ignored')
  })
})

// ── POST /gitlab — repo filtering ────────────────────────────────────────

describe('POST /gitlab — repo filtering', () => {
  it('ignores events from non-monitored repos', async () => {
    const { router } = createTestRouter({ repos: ['other/project'] })

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    expect((json as any).action).toBe('ignored')
    expect((json as any).reason).toMatch(/not monitored/)
  })

  it('accepts events when repo is in monitored list', async () => {
    const { router } = createTestRouter({ repos: ['group/project'] })

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
    expect((json as any).action).toBe('task_created')
  })

  it('accepts events when repo list is empty (all repos)', async () => {
    const { router } = createTestRouter({ repos: [] })

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
  })
})

// ── POST /gitlab — autoAssign ─────────────────────────────────────────────

describe('POST /gitlab — autoAssign', () => {
  it('creates and assigns task when autoAssign is enabled', async () => {
    const { router, stores } = createTestRouter({ autoAssign: true })

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    expect((json as any).taskId).toBe('t1')
    expect(stores.createAndAssignTask).toHaveBeenCalledWith(
      '[group/project#42] Test GitLab issue',
      expect.stringContaining('GitLab Issue:'),
    )
  })

  it('does not create task when autoAssign is disabled', async () => {
    const { router, stores } = createTestRouter({ autoAssign: false })

    await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(stores.createAndAssignTask).not.toHaveBeenCalled()
  })

  it('sets status to failed when task creation throws', async () => {
    const { router, stores } = createTestRouter({ autoAssign: true })
    ;(stores.createAndAssignTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    const events = getGitLabWebhookEvents()
    const latest = events[0]
    expect(latest.status).toBe('failed')
  })
})

// ── GET /gitlab/config ────────────────────────────────────────────────────

describe('GET /gitlab/config', () => {
  it('returns config with masked token', async () => {
    const { router } = createTestRouter({ gitlabToken: 'glpat-abcdefghij' })

    const { status, json } = await callRoute(router, 'get', '/gitlab/config')

    expect(status).toBe(200)
    const c = json as any
    expect(c.enabled).toBe(true)
    expect(c.hasToken).toBe(true)
    expect(c.tokenPreview).toBe('...ghij')
    expect(c.repos).toEqual([])
    expect(c.autoAssign).toBe(false)
  })

  it('returns empty preview when no token set', async () => {
    const { router } = createTestRouter({ gitlabToken: '' })

    const { json } = await callRoute(router, 'get', '/gitlab/config')

    expect((json as any).hasToken).toBe(false)
    expect((json as any).tokenPreview).toBe('')
  })
})

// ── PUT /gitlab/config ────────────────────────────────────────────────────

describe('PUT /gitlab/config', () => {
  it('updates config fields', async () => {
    const { router, config } = createTestRouter()

    const { status, json } = await callRoute(router, 'put', '/gitlab/config', {
      body: {
        enabled: false,
        gitlabToken: 'new-token',
        repos: ['a/b', 'c/d'],
        autoAssign: true,
        taskTemplate: 'custom template',
      },
    })

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
    expect(config.enabled).toBe(false)
    expect(config.gitlabToken).toBe('new-token')
    expect(config.repos).toEqual(['a/b', 'c/d'])
    expect(config.autoAssign).toBe(true)
    expect(config.taskTemplate).toBe('custom template')
  })

  it('filters invalid repos (must contain /)', async () => {
    const { router, config } = createTestRouter()

    await callRoute(router, 'put', '/gitlab/config', {
      body: { repos: ['valid/repo', 'noslash', 'also/valid'] },
    })

    expect(config.repos).toEqual(['valid/repo', 'also/valid'])
  })
})

// ── POST /gitlab/test ─────────────────────────────────────────────────────

describe('POST /gitlab/test', () => {
  it('returns 503 when disabled', async () => {
    const { router } = createTestRouter({ enabled: false })

    const { status } = await callRoute(router, 'post', '/gitlab/test')

    expect(status).toBe(503)
  })

  it('creates a test event', async () => {
    const { router, stores } = createTestRouter({ enabled: true })

    const { status, json } = await callRoute(router, 'post', '/gitlab/test')

    expect(status).toBe(200)
    expect((json as any).ok).toBe(true)
    expect((json as any).eventId).toMatch(/^gl-test-/)
    expect(stores.broadcast).toHaveBeenCalledWith('webhook:received', expect.objectContaining({
      provider: 'gitlab',
      repo: 'test/webhook-test',
    }))
  })

  it('auto-assigns test event when autoAssign enabled', async () => {
    const { router, stores } = createTestRouter({ enabled: true, autoAssign: true })

    const { json } = await callRoute(router, 'post', '/gitlab/test')

    expect((json as any).taskId).toBe('t1')
    expect((json as any).assigned).toBe(true)
    expect(stores.createAndAssignTask).toHaveBeenCalled()
  })

  it('does not auto-assign when disabled', async () => {
    const { router, stores } = createTestRouter({ enabled: true, autoAssign: false })

    const { json } = await callRoute(router, 'post', '/gitlab/test')

    expect((json as any).message).toMatch(/auto-assign disabled/)
    expect(stores.createAndAssignTask).not.toHaveBeenCalled()
  })

  it('handles task creation failure on test', async () => {
    const { router, stores } = createTestRouter({ enabled: true, autoAssign: true })
    ;(stores.createAndAssignTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))

    const { json } = await callRoute(router, 'post', '/gitlab/test')

    expect((json as any).ok).toBe(false)
    expect((json as any).error).toMatch(/failed/i)
  })
})

// ── GET /gitlab/events ────────────────────────────────────────────────────

describe('GET /gitlab/events', () => {
  it('returns the events array', async () => {
    const { router } = createTestRouter()

    // Add an event first
    await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    const { status, json } = await callRoute(router, 'get', '/gitlab/events')

    expect(status).toBe(200)
    expect(Array.isArray(json)).toBe(true)
    expect((json as any[]).length).toBeGreaterThan(0)
  })
})

// ── updateGitLabEventByTaskId ─────────────────────────────────────────────

describe('updateGitLabEventByTaskId', () => {
  it('updates status of event matching taskId', async () => {
    const { router, stores } = createTestRouter({ autoAssign: true })

    await callRoute(router, 'post', '/gitlab', {
      body: testIssuePayload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    const events = getGitLabWebhookEvents()
    const latest = events[0]
    expect(latest.taskId).toBe('t1')

    updateGitLabEventByTaskId('t1', 'completed')

    expect(latest.status).toBe('completed')
  })

  it('does nothing for unknown taskId', () => {
    updateGitLabEventByTaskId('nonexistent', 'failed')
    // No error thrown
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles missing project in payload', async () => {
    const { router } = createTestRouter()
    const payload = {
      object_attributes: { action: 'open', title: 'No project', iid: 1 },
      user: { username: 'dev' },
      labels: [],
    }

    const { status, json } = await callRoute(router, 'post', '/gitlab', {
      body: payload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    const events = getGitLabWebhookEvents()
    expect(events[0].repo).toBe('unknown/unknown')
  })

  it('handles missing labels in payload', async () => {
    const { router } = createTestRouter()
    const payload = {
      object_attributes: { action: 'open', title: 'No labels', iid: 5 },
      project: { path_with_namespace: 'a/b' },
      user: { username: 'dev' },
    }

    const { status } = await callRoute(router, 'post', '/gitlab', {
      body: payload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    const events = getGitLabWebhookEvents()
    expect(events[0].labels).toEqual([])
  })

  it('handles missing user in payload', async () => {
    const { router } = createTestRouter()
    const payload = {
      object_attributes: { action: 'open', title: 'No user', iid: 6 },
      project: { path_with_namespace: 'a/b' },
      labels: [],
    }

    const { status } = await callRoute(router, 'post', '/gitlab', {
      body: payload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    expect(status).toBe(200)
    const events = getGitLabWebhookEvents()
    expect(events[0].author).toBe('unknown')
  })

  it('truncates long description in task body', async () => {
    const { router, stores } = createTestRouter({ autoAssign: true })
    const payload = {
      ...testIssuePayload,
      object_attributes: {
        ...testIssuePayload.object_attributes,
        description: 'Z'.repeat(3000),
      },
    }

    await callRoute(router, 'post', '/gitlab', {
      body: payload,
      headers: { 'x-gitlab-event': 'Issue Hook' },
    })

    const taskDesc = (stores.createAndAssignTask as ReturnType<typeof vi.fn>).mock.calls[0][1] as string
    // Body should be truncated to 2000 chars
    expect(taskDesc.length).toBeLessThan(3000)
  })
})
