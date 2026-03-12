import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { api } from '@/api'
import type { WebhookEvent, GitHubWebhookStatus, GitLabWebhookStatus } from '@/types'

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
    fontWeight: 600, flexShrink: 0,
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
  tabs: {
    display: 'flex', gap: '0', borderBottom: '2px solid var(--border-primary)', marginBottom: '0.5rem',
  },
  tab: (active: boolean) => ({
    padding: '0.6rem 1.2rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
    color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
    marginBottom: '-2px', background: 'transparent', border: 'none',
    borderBottomWidth: '2px', borderBottomStyle: 'solid' as const,
    borderBottomColor: active ? 'var(--accent-blue)' : 'transparent',
  }),
  providerBadge: (provider: string) => ({
    fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700,
    marginRight: '0.4rem', flexShrink: 0,
    color: provider === 'gitlab' ? '#fc6d26' : '#fff',
    background: provider === 'gitlab' ? 'rgba(252,109,38,0.15)' : 'rgba(255,255,255,0.1)',
    border: `1px solid ${provider === 'gitlab' ? 'rgba(252,109,38,0.3)' : 'rgba(255,255,255,0.2)'}`,
  }),
}

const statusColor = (s: string) => {
  if (s === 'completed') return 'var(--accent-green)'
  if (s === 'processing') return 'var(--accent-orange)'
  if (s === 'failed') return 'var(--accent-red)'
  if (s === 'ignored') return 'var(--text-muted)'
  return 'var(--accent-blue)'
}

// ── GitHub Section ──────────────────────────────────────────────────

function GitHubSection() {
  const [config, setConfig] = useState<GitHubWebhookStatus | null>(null)
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  const [enabled, setEnabled] = useState(false)
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [repos, setRepos] = useState('')
  const [autoAssign, setAutoAssign] = useState(true)
  const [taskTemplate, setTaskTemplate] = useState('')

  const fetchConfig = useCallback(async () => {
    try {
      const c = await api.webhooks.getGitHubConfig()
      setConfig(c)
      setEnabled(c.enabled)
      setAutoAssign(c.autoAssign)
      setRepos(c.repos.join(', '))
      setTaskTemplate(c.taskTemplate || '')
    } catch { /* ignore */ }
  }, [])

  const fetchEvents = useCallback(async () => {
    try { setEvents(await api.webhooks.getGitHubEvents()) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchConfig()
    fetchEvents()
    const interval = setInterval(fetchEvents, 10_000)
    const onWsEvent = () => { fetchEvents() }
    window.addEventListener('webhook-event', onWsEvent)
    return () => { clearInterval(interval); window.removeEventListener('webhook-event', onWsEvent) }
  }, [fetchConfig, fetchEvents])

  const handleSave = async () => {
    setSaving(true); setMsg('')
    try {
      const update: Record<string, unknown> = {
        enabled, autoAssign,
        repos: repos.split(',').map(r => r.trim()).filter(Boolean),
      }
      if (token) update.githubToken = token
      if (secret) update.webhookSecret = secret
      update.taskTemplate = taskTemplate
      await api.webhooks.setGitHubConfig(update)
      setMsg('Saved!'); setEditing(false); setToken(''); setSecret('')
      await fetchConfig()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true); setTestMsg('')
    try {
      const result = await api.webhooks.testGitHub()
      if (result.ok) {
        setTestMsg(`Test event created!${result.taskId ? ` Task: ${result.taskId}` : ''}`)
        fetchEvents()
      } else { setTestMsg(result.error || 'Test failed') }
    } catch (err) {
      setTestMsg(err instanceof Error ? err.message : 'Test failed')
    } finally { setTesting(false) }
  }

  const webhookUrl = `${window.location.origin}/api/webhooks/github`

  return (
    <>
      <Card title="GitHub Integration" actions={
        !editing ? <Button size="sm" onClick={() => setEditing(true)}>Edit</Button> : undefined
      }>
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
              <input style={styles.input} type="password" value={token} onChange={e => setToken(e.target.value)}
                placeholder={config?.hasToken ? `Current: ${config.tokenPreview}` : 'ghp_...'} />
            </div>
            <div style={styles.field}>
              <span style={styles.label}>Webhook Secret</span>
              <input style={styles.input} type="password" value={secret} onChange={e => setSecret(e.target.value)}
                placeholder={config?.hasSecret ? 'Current: ****' : 'Optional but recommended'} />
            </div>
            <div style={styles.field}>
              <span style={styles.label}>Monitored Repos (comma-separated, e.g. owner/repo)</span>
              <input style={styles.input} value={repos} onChange={e => setRepos(e.target.value)}
                placeholder="owner/repo1, owner/repo2 (empty = all)" />
            </div>
            <div style={styles.field}>
              <label style={styles.toggle}>
                <input type="checkbox" checked={autoAssign} onChange={e => setAutoAssign(e.target.checked)} />
                <span style={{ color: 'var(--text-primary)' }}>Auto-create and assign tasks for new issues</span>
              </label>
            </div>
            <div style={styles.field}>
              <span style={styles.label}>Task Instructions Template</span>
              <textarea
                style={{ ...styles.input, minHeight: '80px', resize: 'vertical' as const, fontFamily: 'inherit' }}
                value={taskTemplate} onChange={e => setTaskTemplate(e.target.value)}
                placeholder="Default: Analyze this issue, investigate the codebase, implement a fix, write tests, and prepare a summary of changes.&#10;&#10;Placeholders: {{title}}, {{body}}, {{url}}, {{author}}, {{labels}}, {{repo}}, {{number}}" />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Leave empty for default. Use {'{{title}}'}, {'{{body}}'}, {'{{url}}'}, {'{{author}}'}, {'{{labels}}'}, {'{{repo}}'}, {'{{number}}'} as placeholders.
              </span>
            </div>
            <div style={styles.row}>
              <Button variant="primary" loading={saving} onClick={handleSave}>Save</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
            {msg && <div style={styles.msg(/saved/i.test(msg))}>{msg}</div>}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={styles.instructions}><strong>Repos:</strong> {config?.repos.length ? config.repos.join(', ') : 'All (no filter)'}</div>
            <div style={styles.instructions}><strong>Auto-assign:</strong> {config?.autoAssign ? 'Yes' : 'No'}</div>
            {config?.taskTemplate && (
              <div style={styles.instructions}>
                <strong>Template:</strong> {config.taskTemplate.slice(0, 100)}{config.taskTemplate.length > 100 ? '...' : ''}
              </div>
            )}
            {config?.enabled && (
              <div style={{ marginTop: '0.5rem' }}>
                <Button size="sm" variant="ghost" loading={testing} onClick={handleTest}>Send Test</Button>
                {testMsg && <div style={styles.msg(/created|ok/i.test(testMsg))}>{testMsg}</div>}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Webhook URL">
        <div style={styles.instructions}>
          Copy this URL into your GitHub repo settings under <strong>Settings &gt; Webhooks &gt; Add webhook</strong>.
          Set content type to <code>application/json</code> and select <strong>Issues</strong> events.
        </div>
        <div style={{ ...styles.webhookUrl, marginTop: '0.75rem' }}>{webhookUrl}</div>
      </Card>

      <EventList events={events} onRefresh={fetchEvents} />
    </>
  )
}

// ── GitLab Section ──────────────────────────────────────────────────

function GitLabSection() {
  const [config, setConfig] = useState<GitLabWebhookStatus | null>(null)
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  const [enabled, setEnabled] = useState(false)
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [repos, setRepos] = useState('')
  const [autoAssign, setAutoAssign] = useState(true)
  const [taskTemplate, setTaskTemplate] = useState('')

  const fetchConfig = useCallback(async () => {
    try {
      const c = await api.webhooks.getGitLabConfig()
      setConfig(c)
      setEnabled(c.enabled)
      setAutoAssign(c.autoAssign)
      setRepos(c.repos.join(', '))
      setTaskTemplate(c.taskTemplate || '')
    } catch { /* ignore */ }
  }, [])

  const fetchEvents = useCallback(async () => {
    try { setEvents(await api.webhooks.getGitLabEvents()) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchConfig()
    fetchEvents()
    const interval = setInterval(fetchEvents, 10_000)
    const onWsEvent = () => { fetchEvents() }
    window.addEventListener('webhook-event', onWsEvent)
    return () => { clearInterval(interval); window.removeEventListener('webhook-event', onWsEvent) }
  }, [fetchConfig, fetchEvents])

  const handleSave = async () => {
    setSaving(true); setMsg('')
    try {
      const update: Record<string, unknown> = {
        enabled, autoAssign,
        repos: repos.split(',').map(r => r.trim()).filter(Boolean),
      }
      if (token) update.gitlabToken = token
      if (secret) update.webhookSecret = secret
      update.taskTemplate = taskTemplate
      await api.webhooks.setGitLabConfig(update)
      setMsg('Saved!'); setEditing(false); setToken(''); setSecret('')
      await fetchConfig()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true); setTestMsg('')
    try {
      const result = await api.webhooks.testGitLab()
      if (result.ok) {
        setTestMsg(`Test event created!${result.taskId ? ` Task: ${result.taskId}` : ''}`)
        fetchEvents()
      } else { setTestMsg(result.error || 'Test failed') }
    } catch (err) {
      setTestMsg(err instanceof Error ? err.message : 'Test failed')
    } finally { setTesting(false) }
  }

  const webhookUrl = `${window.location.origin}/api/webhooks/gitlab`

  return (
    <>
      <Card title="GitLab Integration" actions={
        !editing ? <Button size="sm" onClick={() => setEditing(true)}>Edit</Button> : undefined
      }>
        <div style={{
          display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem',
          padding: '0.5rem 0.75rem', borderRadius: '6px',
          background: config?.enabled ? 'rgba(252,109,38,0.1)' : 'rgba(100,100,100,0.1)',
          border: `1px solid ${config?.enabled ? 'rgba(252,109,38,0.3)' : 'rgba(100,100,100,0.3)'}`,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: config?.enabled ? '#fc6d26' : 'var(--text-muted)',
          }} />
          <span style={{ fontSize: '0.85rem', color: config?.enabled ? '#fc6d26' : 'var(--text-muted)' }}>
            {config?.enabled ? 'Enabled' : 'Disabled'}
            {config?.enabled && config?.hasToken ? ' — Token configured' : ''}
          </span>
        </div>

        {editing ? (
          <>
            <div style={styles.field}>
              <label style={styles.toggle}>
                <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Enable GitLab Webhooks</span>
              </label>
            </div>
            <div style={styles.field}>
              <span style={styles.label}>GitLab Personal Access Token</span>
              <input style={styles.input} type="password" value={token} onChange={e => setToken(e.target.value)}
                placeholder={config?.hasToken ? `Current: ${config.tokenPreview}` : 'glpat-...'} />
            </div>
            <div style={styles.field}>
              <span style={styles.label}>Secret Token (X-Gitlab-Token)</span>
              <input style={styles.input} type="password" value={secret} onChange={e => setSecret(e.target.value)}
                placeholder={config?.hasSecret ? 'Current: ****' : 'Optional — plain token comparison'} />
            </div>
            <div style={styles.field}>
              <span style={styles.label}>Monitored Projects (comma-separated, e.g. namespace/project)</span>
              <input style={styles.input} value={repos} onChange={e => setRepos(e.target.value)}
                placeholder="group/project1, group/project2 (empty = all)" />
            </div>
            <div style={styles.field}>
              <label style={styles.toggle}>
                <input type="checkbox" checked={autoAssign} onChange={e => setAutoAssign(e.target.checked)} />
                <span style={{ color: 'var(--text-primary)' }}>Auto-create and assign tasks for new issues</span>
              </label>
            </div>
            <div style={styles.field}>
              <span style={styles.label}>Task Instructions Template</span>
              <textarea
                style={{ ...styles.input, minHeight: '80px', resize: 'vertical' as const, fontFamily: 'inherit' }}
                value={taskTemplate} onChange={e => setTaskTemplate(e.target.value)}
                placeholder="Default: Analyze this issue, investigate the codebase, implement a fix, write tests, and prepare a summary of changes.&#10;&#10;Placeholders: {{title}}, {{body}}, {{url}}, {{author}}, {{labels}}, {{repo}}, {{number}}" />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Leave empty for default. Use {'{{title}}'}, {'{{body}}'}, {'{{url}}'}, {'{{author}}'}, {'{{labels}}'}, {'{{repo}}'}, {'{{number}}'} as placeholders.
              </span>
            </div>
            <div style={styles.row}>
              <Button variant="primary" loading={saving} onClick={handleSave}>Save</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
            {msg && <div style={styles.msg(/saved/i.test(msg))}>{msg}</div>}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={styles.instructions}><strong>Projects:</strong> {config?.repos.length ? config.repos.join(', ') : 'All (no filter)'}</div>
            <div style={styles.instructions}><strong>Auto-assign:</strong> {config?.autoAssign ? 'Yes' : 'No'}</div>
            {config?.taskTemplate && (
              <div style={styles.instructions}>
                <strong>Template:</strong> {config.taskTemplate.slice(0, 100)}{config.taskTemplate.length > 100 ? '...' : ''}
              </div>
            )}
            {config?.enabled && (
              <div style={{ marginTop: '0.5rem' }}>
                <Button size="sm" variant="ghost" loading={testing} onClick={handleTest}>Send Test</Button>
                {testMsg && <div style={styles.msg(/created|ok/i.test(testMsg))}>{testMsg}</div>}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Webhook URL">
        <div style={styles.instructions}>
          In your GitLab project, go to <strong>Settings &gt; Webhooks &gt; Add new webhook</strong>.
          Paste this URL, set the secret token (optional), and check <strong>Issues events</strong>.
        </div>
        <div style={{ ...styles.webhookUrl, marginTop: '0.75rem', color: '#fc6d26' }}>{webhookUrl}</div>
      </Card>

      <EventList events={events} onRefresh={fetchEvents} />
    </>
  )
}

// ── Shared Event List ───────────────────────────────────────────────

function EventList({ events, onRefresh }: { events: WebhookEvent[]; onRefresh: () => void }) {
  return (
    <Card title="Recent Events" actions={
      <Button size="sm" variant="ghost" onClick={onRefresh}>Refresh</Button>
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
                <span style={styles.providerBadge(evt.provider)}>{evt.provider === 'gitlab' ? 'GL' : 'GH'}</span>
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
  )
}

// ── Main Panel ──────────────────────────────────────────────────────

export default function WebhooksPanel() {
  const [tab, setTab] = useState<'github' | 'gitlab'>('github')

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Webhooks</div>
          <div style={styles.subtitle}>Receive events from external services and trigger swarm tasks</div>
        </div>
      </div>

      <div style={styles.tabs}>
        <button style={styles.tab(tab === 'github')} onClick={() => setTab('github')}>GitHub</button>
        <button style={styles.tab(tab === 'gitlab')} onClick={() => setTab('gitlab')}>GitLab</button>
      </div>

      {tab === 'github' ? <GitHubSection /> : <GitLabSection />}
    </div>
  )
}
