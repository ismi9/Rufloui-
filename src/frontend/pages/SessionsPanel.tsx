import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { useStore } from '@/store'
import { api } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Database, Save, Trash2, RefreshCw, Plus, Search } from 'lucide-react'
import type { Session } from '@/types'

const s = {
  page: { display: 'flex', flexDirection: 'column', gap: 20 } as CSSProperties,
  banner: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '20px 24px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 20, flexWrap: 'wrap',
  } as CSSProperties,
  bannerInfo: { display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  bannerTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' } as CSSProperties,
  bannerMeta: { display: 'flex', gap: 20, flexWrap: 'wrap' } as CSSProperties,
  metaItem: { fontSize: 13, color: 'var(--text-secondary)' } as CSSProperties,
  metaLabel: { fontSize: 11, color: 'var(--text-muted)', marginRight: 4 } as CSSProperties,
  actionsRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340, 1fr))', gap: 14,
  } as CSSProperties,
  sessionCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    transition: 'border-color var(--transition)',
  } as CSSProperties,
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px', borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  cardName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' } as CSSProperties,
  cardBody: { padding: '14px 18px' } as CSSProperties,
  cardMeta: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
  } as CSSProperties,
  cardLabel: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const } as CSSProperties,
  cardValue: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 } as CSSProperties,
  cardActions: {
    display: 'flex', gap: 6, padding: '10px 18px',
    borderTop: '1px solid var(--border)',
  } as CSSProperties,
  overlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  } as CSSProperties,
  dialog: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: 24, minWidth: 360, maxWidth: 480,
  } as CSSProperties,
  dialogTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 } as CSSProperties,
  input: {
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '7px 12px', fontSize: 13,
    color: 'var(--text-primary)', outline: 'none', width: '100%',
  } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--text-muted)' } as CSSProperties,
  empty: { textAlign: 'center' as const, color: 'var(--text-muted)', padding: 40, fontSize: 14 } as CSSProperties,
  detail: {
    padding: '14px 18px', borderTop: '1px solid var(--border)',
    background: 'var(--bg-primary)',
  } as CSSProperties,
  detailSection: { marginBottom: 12 } as CSSProperties,
  detailTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const } as CSSProperties,
  detailList: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 } as CSSProperties,
  noBanner: {
    background: 'var(--bg-card)', border: '1px dashed var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '28px 24px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 16,
  } as CSSProperties,
}

interface SessionDetail {
  id: string
  name: string
  status: string
  createdAt: string
  agentCount: number
  taskCount: number
  agents?: Array<{ id: string; name: string; type: string; status: string }>
  tasks?: Array<{ id: string; title: string; status: string }>
}

export default function SessionsPanel() {
  const { sessions, activeSession, setSessions, setActiveSession } = useStore()

  const [loading, setLoading] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)

  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, SessionDetail>>({})
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.sessions.list() as { sessions?: Session[] } | Session[]
      setSessions(Array.isArray(data) ? data : (data.sessions ?? []))
    } catch (e) {
      console.error('Failed to fetch sessions', e)
    } finally {
      setLoading(false)
    }
  }, [setSessions])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await api.sessions.save(saveName || undefined) as Partial<Session> & Record<string, unknown>
      if (result.id) {
        setActiveSession(result as Session)
      }
      setSaveName('')
      setShowSaveDialog(false)
      fetchAll()
    } catch (e) {
      console.error('Save session failed', e)
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async (id: string) => {
    try {
      await api.sessions.restore(id)
      setRestoreConfirm(null)
      fetchAll()
    } catch (e) {
      console.error('Restore failed', e)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.sessions.delete(id)
      setDeleteConfirm(null)
      if (activeSession?.id === id) setActiveSession(null)
      fetchAll()
    } catch (e) {
      console.error('Delete failed', e)
    }
  }

  const toggleDetail = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!details[id]) {
      setLoadingDetail(id)
      try {
        const info = await api.sessions.info(id) as SessionDetail
        setDetails((prev) => ({ ...prev, [id]: info }))
      } catch (e) {
        console.error('Failed to fetch session info', e)
      } finally {
        setLoadingDetail(null)
      }
    }
  }

  return (
    <div style={s.page}>
      {/* Active Session Banner */}
      {activeSession ? (
        <div style={s.banner}>
          <div style={s.bannerInfo as CSSProperties}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={s.bannerTitle}>{activeSession.name || 'Active Session'}</span>
              <StatusBadge status={activeSession.status} size="sm" />
            </div>
            <div style={s.bannerMeta as CSSProperties}>
              <span style={s.metaItem}>
                <span style={s.metaLabel}>ID:</span>{(activeSession.id ?? '').slice(0, 12) || '—'}
              </span>
              <span style={s.metaItem}>
                <span style={s.metaLabel}>Agents:</span>{activeSession.agentCount}
              </span>
              <span style={s.metaItem}>
                <span style={s.metaLabel}>Tasks:</span>{activeSession.taskCount}
              </span>
              <span style={s.metaItem}>
                <span style={s.metaLabel}>Created:</span>
                {new Date(activeSession.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
          <div style={s.actionsRow as CSSProperties}>
            <Button size="sm" onClick={() => setShowSaveDialog(true)}>
              <Save size={14} /> Save Session
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchAll} loading={loading}>
              <RefreshCw size={14} />
            </Button>
          </div>
        </div>
      ) : (
        <div style={s.noBanner}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              No Active Session
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Save your current state or restore a previous session.
            </div>
          </div>
          <div style={s.actionsRow as CSSProperties}>
            <Button size="sm" onClick={() => setShowSaveDialog(true)}>
              <Save size={14} /> Save Current
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchAll} loading={loading}>
              <RefreshCw size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Sessions List */}
      <Card title={`Sessions (${sessions.length})`} actions={
        <Button variant="ghost" size="sm" onClick={fetchAll} loading={loading}>
          <RefreshCw size={14} /> Refresh
        </Button>
      }>
        {sessions.length === 0 ? (
          <div style={s.empty}>No saved sessions yet. Save your current state to get started.</div>
        ) : (
          <div style={s.grid}>
            {sessions.map((session) => (
              <div
                key={session.id}
                style={{
                  ...s.sessionCard,
                  borderColor: activeSession?.id === session.id ? 'var(--accent-blue)' : undefined,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)' }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    activeSession?.id === session.id ? 'var(--accent-blue)' : 'var(--border)'
                }}
              >
                <div style={s.cardHeader}>
                  <span style={s.cardName}>{session.name || (session.id ?? '').slice(0, 12) || '—'}</span>
                  <StatusBadge status={session.status} size="sm" />
                </div>
                <div style={s.cardBody}>
                  <div style={s.cardMeta}>
                    <div>
                      <div style={s.cardLabel}>Session ID</div>
                      <div style={s.cardValue}>{(session.id ?? '').slice(0, 16) || '—'}</div>
                    </div>
                    <div>
                      <div style={s.cardLabel}>Created</div>
                      <div style={s.cardValue}>
                        {new Date(session.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <div style={s.cardLabel}>Agents</div>
                      <div style={s.cardValue}>{session.agentCount}</div>
                    </div>
                    <div>
                      <div style={s.cardLabel}>Tasks</div>
                      <div style={s.cardValue}>{session.taskCount}</div>
                    </div>
                  </div>
                </div>

                {/* Expandable detail */}
                {expandedId === session.id && (
                  <div style={s.detail}>
                    {loadingDetail === session.id ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
                    ) : details[session.id] ? (
                      <>
                        <div style={s.detailSection}>
                          <div style={s.detailTitle}>Full Details</div>
                          <div style={s.detailList}>
                            <div>ID: {details[session.id].id}</div>
                            <div>Name: {details[session.id].name || '(unnamed)'}</div>
                            <div>Status: {details[session.id].status}</div>
                            <div>Created: {new Date(details[session.id].createdAt).toLocaleString()}</div>
                          </div>
                        </div>
                        {details[session.id].agents && details[session.id].agents!.length > 0 && (
                          <div style={s.detailSection}>
                            <div style={s.detailTitle}>
                              Agents ({details[session.id].agents!.length})
                            </div>
                            <div style={s.detailList}>
                              {details[session.id].agents!.map((a) => (
                                <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span>{a.name}</span>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({a.type})</span>
                                  <StatusBadge status={a.status} size="sm" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {details[session.id].tasks && details[session.id].tasks!.length > 0 && (
                          <div style={s.detailSection}>
                            <div style={s.detailTitle}>
                              Tasks ({details[session.id].tasks!.length})
                            </div>
                            <div style={s.detailList}>
                              {details[session.id].tasks!.map((t) => (
                                <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span>{t.title}</span>
                                  <StatusBadge status={t.status} size="sm" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        Failed to load details.
                      </div>
                    )}
                  </div>
                )}

                <div style={s.cardActions}>
                  <Button variant="primary" size="sm"
                    onClick={() => setRestoreConfirm(session.id)}>
                    <RefreshCw size={12} /> Restore
                  </Button>
                  <Button variant="secondary" size="sm"
                    onClick={() => toggleDetail(session.id)}>
                    <Search size={12} /> {expandedId === session.id ? 'Hide' : 'Info'}
                  </Button>
                  <Button variant="danger" size="sm"
                    onClick={() => setDeleteConfirm(session.id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Save Session Dialog */}
      {showSaveDialog && (
        <div style={s.overlay} onClick={() => setShowSaveDialog(false)}>
          <div style={s.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={s.dialogTitle}>Save Session</div>
            <div style={s.field as CSSProperties}>
              <span style={s.label}>Session Name (optional)</span>
              <input
                style={s.input}
                placeholder="My session..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} loading={saving}>
                <Save size={12} /> Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Dialog */}
      {restoreConfirm && (
        <div style={s.overlay} onClick={() => setRestoreConfirm(null)}>
          <div style={s.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={s.dialogTitle}>Restore Session</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              This will replace the current state with the saved session.
              Any unsaved changes will be lost. Continue?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setRestoreConfirm(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => handleRestore(restoreConfirm)}>
                <RefreshCw size={12} /> Restore
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div style={s.overlay} onClick={() => setDeleteConfirm(null)}>
          <div style={s.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={s.dialogTitle}>Delete Session</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Are you sure you want to permanently delete this session?
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleDelete(deleteConfirm)}>
                <Trash2 size={12} /> Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
