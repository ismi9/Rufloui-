import { useEffect, useState, useCallback, useRef } from 'react'
import { api, TelegramStatus } from '@/api'
import { useStore } from '@/store'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ShieldAlert, Send } from 'lucide-react'

interface ConfigEntry {
  key: string
  value: unknown
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '6px 10px',
  fontSize: 13,
  color: 'var(--text-primary)',
  width: '100%',
  outline: 'none',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 120,
  resize: 'vertical' as const,
  fontFamily: 'monospace',
  fontSize: 12,
}

export default function ConfigPanel() {
  const { addLog } = useStore()
  const [configs, setConfigs] = useState<ConfigEntry[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [exportJson, setExportJson] = useState('')
  const [importJson, setImportJson] = useState('')
  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [loading, setLoading] = useState('')
  const [skipPermissions, setSkipPermissions] = useState<boolean | null>(null)
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null)
  const [tgToken, setTgToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')
  const [tgSaving, setTgSaving] = useState(false)
  const [tgEditing, setTgEditing] = useState(false)
  const [tgTestMsg, setTgTestMsg] = useState('')
  const [tgLog, setTgLog] = useState<Array<{ timestamp: string; direction: 'in' | 'out'; message: string }>>([])
  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchServerSettings = useCallback(async () => {
    try {
      const data = await api.config.getServerSettings()
      setSkipPermissions(data.skipPermissions)
    } catch {
      // endpoint may not exist on older backends
    }
    try {
      const tg = await api.config.getTelegramStatus()
      setTelegram(tg)
      setTgChatId(tg.chatId || '')
    } catch {
      // endpoint may not exist on older backends
    }
  }, [])

  const toggleSkipPermissions = async () => {
    const next = !skipPermissions
    try {
      const data = await api.config.setServerSettings({ skipPermissions: next })
      setSkipPermissions(data.skipPermissions)
      addLog({ level: 'info', message: `Auto-permissions ${data.skipPermissions ? 'enabled' : 'disabled'}`, source: 'config' })
    } catch (err) {
      addLog({ level: 'error', message: `Failed to toggle permissions: ${(err as Error).message}`, source: 'config' })
    }
  }

  const fetchConfigs = useCallback(async () => {
    try {
      const data = (await api.config.list()) as ConfigEntry[] | Record<string, unknown>
      if (Array.isArray(data)) {
        setConfigs(data)
      } else {
        setConfigs(Object.entries(data).map(([key, value]) => ({ key, value })))
      }
    } catch (err) {
      addLog({ level: 'error', message: `Config list failed: ${(err as Error).message}`, source: 'config' })
    }
  }, [addLog])

  const fetchTelegramLog = useCallback(async () => {
    try {
      const data = await api.config.getTelegramLog()
      setTgLog(data.log || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchConfigs()
    fetchServerSettings()
  }, [fetchConfigs, fetchServerSettings])

  // Poll telegram activity log every 10s when bot is enabled/connected
  useEffect(() => {
    if (telegram?.enabled || telegram?.connected) {
      fetchTelegramLog()
      logIntervalRef.current = setInterval(fetchTelegramLog, 10_000)
    }
    return () => {
      if (logIntervalRef.current) {
        clearInterval(logIntervalRef.current)
        logIntervalRef.current = null
      }
    }
  }, [telegram?.enabled, telegram?.connected, fetchTelegramLog])

  const startEdit = (entry: ConfigEntry) => {
    setEditingKey(entry.key)
    setEditValue(typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value))
  }

  const handleSave = async (key: string) => {
    setLoading(`save-${key}`)
    try {
      let parsed: unknown = editValue
      try { parsed = JSON.parse(editValue) } catch { /* keep as string */ }
      await api.config.set(key, parsed)
      setEditingKey(null)
      addLog({ level: 'info', message: `Config "${key}" updated`, source: 'config' })
      await fetchConfigs()
    } catch (err) {
      addLog({ level: 'error', message: `Save "${key}" failed: ${(err as Error).message}`, source: 'config' })
    } finally {
      setLoading('')
    }
  }

  const handleExport = async () => {
    setLoading('export')
    try {
      const data = await api.config.export()
      setExportJson(JSON.stringify(data, null, 2))
      setShowExport(true)
      addLog({ level: 'info', message: 'Config exported', source: 'config' })
    } catch (err) {
      addLog({ level: 'error', message: `Export failed: ${(err as Error).message}`, source: 'config' })
    } finally {
      setLoading('')
    }
  }

  const handleImport = async () => {
    setLoading('import')
    try {
      const data = JSON.parse(importJson)
      await api.config.import(data)
      setShowImport(false)
      setImportJson('')
      addLog({ level: 'info', message: 'Config imported', source: 'config' })
      await fetchConfigs()
    } catch (err) {
      addLog({ level: 'error', message: `Import failed: ${(err as Error).message}`, source: 'config' })
    } finally {
      setLoading('')
    }
  }

  const handleReset = async () => {
    setLoading('reset')
    try {
      await api.config.reset()
      setShowResetConfirm(false)
      addLog({ level: 'info', message: 'Config reset to defaults', source: 'config' })
      await fetchConfigs()
    } catch (err) {
      addLog({ level: 'error', message: `Reset failed: ${(err as Error).message}`, source: 'config' })
    } finally {
      setLoading('')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Actions Bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button loading={loading === 'export'} onClick={handleExport}>Export Config</Button>
        <Button variant="secondary" onClick={() => setShowImport(!showImport)}>Import Config</Button>
        <Button variant="danger" onClick={() => setShowResetConfirm(true)}>Reset All</Button>
      </div>

      {/* Reset Confirmation */}
      {showResetConfirm && (
        <Card>
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 500 }}>
              Are you sure you want to reset all configuration to defaults?
            </span>
            <Button variant="danger" size="sm" loading={loading === 'reset'} onClick={handleReset}>Confirm Reset</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Export View */}
      {showExport && (
        <Card>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Exported Config</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(exportJson)}>Copy</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowExport(false)}>Close</Button>
              </div>
            </div>
            <textarea readOnly value={exportJson} style={textareaStyle} />
          </div>
        </Card>
      )}

      {/* Import View */}
      {showImport && (
        <Card>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Import Config</div>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste JSON configuration here..."
              style={textareaStyle}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button loading={loading === 'import'} onClick={handleImport}>Import</Button>
              <Button variant="ghost" onClick={() => { setShowImport(false); setImportJson('') }}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Server Settings */}
      {skipPermissions !== null && (
        <Card>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
              Server Settings
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderRadius: 'var(--radius)',
              background: skipPermissions ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)',
              border: `1px solid ${skipPermissions ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ShieldAlert size={20} color={skipPermissions ? 'var(--accent-red)' : 'var(--accent-green)'} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Autonomous Agent Permissions
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {skipPermissions
                      ? 'Agents run with --dangerously-skip-permissions (no confirmation prompts)'
                      : 'Agents require manual approval for each tool use'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
                    RUFLOUI_SKIP_PERMISSIONS={skipPermissions ? 'true' : 'false'}
                  </div>
                </div>
              </div>
              <button
                onClick={toggleSkipPermissions}
                style={{
                  position: 'relative',
                  width: 48, height: 26, borderRadius: 13,
                  border: 'none', cursor: 'pointer',
                  background: skipPermissions ? 'var(--accent-red)' : 'var(--accent-green)',
                  transition: 'background 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 3, left: skipPermissions ? 25 : 3,
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Telegram Bot */}
      {telegram && (
        <Card>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                Telegram Bot
              </div>
              <div style={{
                padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: telegram.connected ? 'var(--accent-green)' : telegram.enabled ? 'var(--accent-red)' : 'var(--text-muted)',
                color: '#fff',
              }}>
                {telegram.connected ? 'ONLINE' : telegram.enabled ? 'ERROR' : 'OFF'}
              </div>
            </div>

            {/* Status banner */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', borderRadius: 'var(--radius)', marginBottom: 16,
              background: telegram.connected
                ? 'rgba(34, 197, 94, 0.08)'
                : telegram.enabled
                  ? 'rgba(239, 68, 68, 0.08)'
                  : 'rgba(148, 163, 184, 0.08)',
              border: `1px solid ${telegram.connected
                ? 'rgba(34, 197, 94, 0.2)'
                : telegram.enabled
                  ? 'rgba(239, 68, 68, 0.2)'
                  : 'rgba(148, 163, 184, 0.2)'}`,
            }}>
              <Send size={20} color={telegram.connected ? 'var(--accent-green)' : 'var(--text-muted)'} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {telegram.connected
                    ? `Connected as @${telegram.botUsername || '...'}`
                    : telegram.enabled
                      ? `Not connected — ${!telegram.hasToken ? 'missing token' : !telegram.hasChatId ? 'missing chat ID' : 'connection failed'}`
                      : 'Disabled — configure below to enable'}
                </div>
                {telegram.connected && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Receiving commands and sending notifications to chat {telegram.chatId}
                  </div>
                )}
              </div>
            </div>

            {/* Enable/Disable toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 0', borderBottom: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Enable Telegram Bot</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Activate polling and notifications
                </div>
              </div>
              <button
                disabled={tgSaving}
                onClick={async () => {
                  setTgSaving(true)
                  setTgTestMsg('')
                  try {
                    const next = !telegram.enabled
                    const res = await api.config.setTelegramConfig({ enabled: next })
                    setTelegram(res)
                    addLog({ level: 'info', message: `Telegram bot ${next ? 'enabled' : 'disabled'}`, source: 'config' })
                  } catch (err) {
                    addLog({ level: 'error', message: `Telegram toggle failed: ${(err as Error).message}`, source: 'config' })
                  } finally {
                    setTgSaving(false)
                  }
                }}
                style={{
                  position: 'relative',
                  width: 48, height: 26, borderRadius: 13,
                  border: 'none', cursor: tgSaving ? 'wait' : 'pointer',
                  background: telegram.enabled ? 'var(--accent-green)' : 'var(--text-muted)',
                  transition: 'background 0.2s ease',
                  flexShrink: 0, opacity: tgSaving ? 0.6 : 1,
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 3, left: telegram.enabled ? 25 : 3,
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>

            {/* Configuration fields */}
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                  Bot Token {telegram.hasToken && !tgEditing && (
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(configured: {telegram.tokenPreview})</span>
                  )}
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    onFocus={() => setTgEditing(true)}
                    placeholder={telegram.hasToken ? 'Enter new token to change...' : 'Paste bot token from @BotFather'}
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Get a token from <span style={{ fontWeight: 600 }}>@BotFather</span> on Telegram: send /newbot and follow the prompts
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                  Chat ID
                </label>
                <input
                  value={tgChatId}
                  onChange={(e) => { setTgChatId(e.target.value); setTgEditing(true) }}
                  placeholder="Your Telegram chat ID (e.g. 123456789)"
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Message <span style={{ fontWeight: 600 }}>@userinfobot</span> on Telegram to get your chat ID
                </div>
              </div>

              {/* Save + Test buttons */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <Button
                  loading={tgSaving}
                  disabled={!tgEditing && !tgToken}
                  onClick={async () => {
                    setTgSaving(true)
                    setTgTestMsg('')
                    try {
                      const update: { token?: string; chatId?: string; enabled?: boolean } = {}
                      if (tgToken) update.token = tgToken
                      if (tgChatId) update.chatId = tgChatId
                      // Auto-enable when saving credentials
                      if ((tgToken || telegram.hasToken) && tgChatId) update.enabled = true
                      const res = await api.config.setTelegramConfig(update)
                      setTelegram(res)
                      setTgChatId(res.chatId || '')
                      setTgToken('')
                      setTgEditing(false)
                      setTgTestMsg(res.connected ? 'Saved and connected!' : 'Saved but connection failed — check token and chat ID')
                      addLog({ level: 'info', message: 'Telegram config updated', source: 'config' })
                    } catch (err) {
                      setTgTestMsg(`Save failed: ${(err as Error).message}`)
                      addLog({ level: 'error', message: `Telegram save failed: ${(err as Error).message}`, source: 'config' })
                    } finally {
                      setTgSaving(false)
                    }
                  }}
                >
                  Save & Connect
                </Button>
                <Button
                  variant="secondary"
                  loading={tgSaving}
                  disabled={!telegram.connected}
                  onClick={async () => {
                    setTgSaving(true)
                    setTgTestMsg('')
                    try {
                      const res = await api.config.testTelegram()
                      setTgTestMsg(res.ok ? 'Test message sent!' : `Test failed: ${res.error}`)
                    } catch (err) {
                      setTgTestMsg(`Test failed: ${(err as Error).message}`)
                    } finally {
                      setTgSaving(false)
                    }
                  }}
                >
                  Send Test
                </Button>
                {tgTestMsg && (
                  <span style={{
                    fontSize: 12,
                    color: /connected|sent|Saved/i.test(tgTestMsg) ? 'var(--accent-green)' : 'var(--accent-red)',
                  }}>
                    {tgTestMsg}
                  </span>
                )}
              </div>
            </div>

            {/* Commands reference */}
            {telegram.connected && (
              <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 'var(--radius)', background: 'var(--bg-primary)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Available Commands</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12, fontFamily: 'monospace' }}>
                  {[
                    ['/status', 'System overview'],
                    ['/agents', 'List agents'],
                    ['/tasks', 'Tasks by status'],
                    ['/task <id>', 'Task detail'],
                    ['/swarm', 'Swarm info'],
                    ['/workflows', 'List workflows'],
                    ['/run <desc>', 'Create & run task'],
                    ['/cancel <id>', 'Cancel a task'],
                    ['/help', 'Command list'],
                  ].map(([cmd, desc]) => (
                    <div key={cmd} style={{ display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--accent-blue)', whiteSpace: 'nowrap' }}>{cmd}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notifications */}
            {(telegram.connected || telegram.enabled) && telegram.notifications && (
              <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 'var(--radius)', background: 'var(--bg-primary)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Notifications</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {([
                    ['taskCompleted', 'Task Completed'],
                    ['taskFailed', 'Task Failed'],
                    ['swarmInit', 'Swarm Initialized'],
                    ['swarmShutdown', 'Swarm Shutdown'],
                    ['agentError', 'Agent Error'],
                    ['taskProgress', 'Task Progress'],
                  ] as const).map(([key, label]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{label}</span>
                      <button
                        onClick={async () => {
                          const newVal = !telegram.notifications[key]
                          try {
                            const res = await api.config.setTelegramConfig({ notifications: { [key]: newVal } })
                            setTelegram(res)
                          } catch (err) {
                            addLog({ level: 'error', message: `Notification toggle failed: ${(err as Error).message}`, source: 'config' })
                          }
                        }}
                        style={{
                          position: 'relative',
                          width: 36, height: 20, borderRadius: 10,
                          border: 'none', cursor: 'pointer',
                          background: telegram.notifications[key] ? 'var(--accent-green)' : 'var(--text-muted)',
                          transition: 'background 0.2s ease',
                          flexShrink: 0,
                        }}
                      >
                        <div style={{
                          position: 'absolute',
                          top: 2, left: telegram.notifications[key] ? 18 : 2,
                          width: 16, height: 16, borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity Log */}
            {(telegram.connected || telegram.enabled) && (
              <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 'var(--radius)', background: 'var(--bg-primary)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Activity Log</div>
                <div style={{
                  maxHeight: 200, overflowY: 'auto', fontSize: 12, fontFamily: 'monospace',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {tgLog.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', padding: '8px 0' }}>No activity yet</div>
                  ) : (
                    [...tgLog].reverse().map((entry, i) => {
                      const time = new Date(entry.timestamp).toLocaleTimeString()
                      const arrow = entry.direction === 'out' ? '\u2192' : '\u2190'
                      const color = entry.direction === 'out' ? 'var(--accent-blue)' : 'var(--accent-green)'
                      const msg = entry.message.length > 80 ? entry.message.slice(0, 77) + '...' : entry.message
                      return (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', lineHeight: '18px' }}>
                          <span style={{ color, flexShrink: 0 }}>{arrow}</span>
                          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{time}</span>
                          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg}</span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Config List */}
      <Card>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Configuration</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Key', 'Value', 'Actions'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 12 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {configs.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No configuration entries</td>
                  </tr>
                ) : (
                  configs.map((entry) => (
                    <tr key={entry.key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'monospace', fontSize: 12 }}>
                        {entry.key}
                      </td>
                      <td style={{ padding: '10px 12px', maxWidth: 400 }}>
                        {editingKey === entry.key ? (
                          <input
                            style={inputStyle}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(entry.key); if (e.key === 'Escape') setEditingKey(null) }}
                            autoFocus
                          />
                        ) : (
                          <span
                            style={{ color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12 }}
                            onClick={() => startEdit(entry)}
                          >
                            {typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {editingKey === entry.key ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Button size="sm" loading={loading === `save-${entry.key}`} onClick={() => handleSave(entry.key)}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => startEdit(entry)}>Edit</Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

    </div>
  )
}
