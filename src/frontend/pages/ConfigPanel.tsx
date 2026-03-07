import { useEffect, useState, useCallback } from 'react'
import { api } from '@/api'
import { useStore } from '@/store'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ShieldAlert } from 'lucide-react'

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

  const fetchServerSettings = useCallback(async () => {
    try {
      const data = await api.config.getServerSettings()
      setSkipPermissions(data.skipPermissions)
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

  useEffect(() => {
    fetchConfigs()
    fetchServerSettings()
  }, [fetchConfigs, fetchServerSettings])

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
