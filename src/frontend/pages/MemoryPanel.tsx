import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { useStore } from '@/store'
import { api } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Database, Search, Plus, Trash2, RefreshCw } from 'lucide-react'
import type { MemoryEntry, MemoryStats } from '@/types'

const s = {
  page: { display: 'flex', flexDirection: 'column', gap: 20 } as CSSProperties,
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 } as CSSProperties,
  statCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '16px 20px',
  } as CSSProperties,
  statLabel: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 } as CSSProperties,
  statValue: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' } as CSSProperties,
  hnswBadge: (on: boolean) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
    padding: '4px 10px', borderRadius: 'var(--radius)', marginTop: 8,
    background: on ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
    color: on ? 'var(--accent-green)' : 'var(--accent-red)',
  }) as CSSProperties,
  searchRow: {
    display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
  } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--text-muted)' } as CSSProperties,
  input: {
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '7px 12px', fontSize: 13,
    color: 'var(--text-primary)', outline: 'none', minWidth: 0,
  } as CSSProperties,
  textarea: {
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '7px 12px', fontSize: 13,
    color: 'var(--text-primary)', outline: 'none', resize: 'vertical',
    minHeight: 60, fontFamily: 'inherit',
  } as CSSProperties,
  storeForm: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
  } as CSSProperties,
  fullSpan: { gridColumn: '1 / -1' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' } as CSSProperties,
  th: {
    textAlign: 'left' as const, padding: '10px 14px', fontSize: 12,
    fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  } as CSSProperties,
  td: {
    padding: '10px 14px', fontSize: 13, color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  tag: {
    display: 'inline-block', fontSize: 11, padding: '2px 8px',
    borderRadius: 'var(--radius)', background: 'var(--bg-hover)',
    color: 'var(--text-muted)', marginRight: 4,
  } as CSSProperties,
  nsTabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 } as CSSProperties,
  nsTab: (active: boolean) => ({
    padding: '5px 12px', fontSize: 12, borderRadius: 'var(--radius)',
    cursor: 'pointer', border: '1px solid var(--border)',
    background: active ? 'var(--accent-blue)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    transition: 'all var(--transition)',
  }) as CSSProperties,
  expandedValue: {
    padding: 14, background: 'var(--bg-primary)', borderRadius: 'var(--radius)',
    fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
    wordBreak: 'break-word', fontFamily: 'monospace', marginTop: 6,
  } as CSSProperties,
  row: { display: 'flex', gap: 10, alignItems: 'center' } as CSSProperties,
  collapsible: {
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12,
  } as CSSProperties,
  actions: { display: 'flex', gap: 6, alignItems: 'center' } as CSSProperties,
  overlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  } as CSSProperties,
  dialog: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: 24, minWidth: 340, maxWidth: 480,
  } as CSSProperties,
  dialogTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 } as CSSProperties,
  empty: { textAlign: 'center' as const, color: 'var(--text-muted)', padding: 40, fontSize: 14 } as CSSProperties,
  resultItem: {
    padding: '10px 14px', borderBottom: '1px solid var(--border)',
    cursor: 'pointer', transition: 'background var(--transition)',
  } as CSSProperties,
  resultKey: { fontSize: 13, fontWeight: 600, color: 'var(--accent-cyan)' } as CSSProperties,
  resultVal: {
    fontSize: 12, color: 'var(--text-muted)', marginTop: 4,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  } as CSSProperties,
}

function truncate(str: string, len = 80): string {
  return str.length > len ? str.slice(0, len) + '...' : str
}

export default function MemoryPanel() {
  const { memoryEntries, memoryStats, setMemoryEntries, setMemoryStats } = useStore()

  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchNs, setSearchNs] = useState('')
  const [searchLimit, setSearchLimit] = useState(20)
  const [searchResults, setSearchResults] = useState<MemoryEntry[] | null>(null)
  const [searching, setSearching] = useState(false)

  const [showStore, setShowStore] = useState(false)
  const [storeKey, setStoreKey] = useState('')
  const [storeValue, setStoreValue] = useState('')
  const [storeNs, setStoreNs] = useState('')
  const [storeTags, setStoreTags] = useState('')
  const [storeTtl, setStoreTtl] = useState('')
  const [storing, setStoring] = useState(false)

  const [filterNs, setFilterNs] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, entriesRes] = await Promise.all([
        api.memory.stats(),
        api.memory.list(),
      ])
      setMemoryStats(statsRes as MemoryStats)
      const eData = entriesRes as { entries?: MemoryEntry[] } | MemoryEntry[]
      setMemoryEntries(Array.isArray(eData) ? eData : (eData.entries ?? []))
    } catch (e) {
      console.error('Failed to fetch memory data', e)
    } finally {
      setLoading(false)
    }
  }, [setMemoryStats, setMemoryEntries])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await api.memory.search(searchQuery, searchNs || undefined, searchLimit) as MemoryEntry[]
      setSearchResults(Array.isArray(res) ? res : [])
    } catch (e) {
      console.error('Search failed', e)
    } finally {
      setSearching(false)
    }
  }

  const handleStore = async () => {
    if (!storeKey.trim() || !storeValue.trim()) return
    setStoring(true)
    try {
      await api.memory.store({
        key: storeKey,
        value: storeValue,
        namespace: storeNs || undefined,
        tags: storeTags ? storeTags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        ttl: storeTtl ? Number(storeTtl) : undefined,
      })
      setStoreKey(''); setStoreValue(''); setStoreNs(''); setStoreTags(''); setStoreTtl('')
      setShowStore(false)
      fetchAll()
    } catch (e) {
      console.error('Store failed', e)
    } finally {
      setStoring(false)
    }
  }

  const handleDelete = async (key: string) => {
    try {
      await api.memory.delete(key, filterNs || undefined)
      setDeleteConfirm(null)
      fetchAll()
    } catch (e) {
      console.error('Delete failed', e)
    }
  }

  const namespaces = memoryStats?.namespaces ?? []
  const filtered = filterNs
    ? memoryEntries.filter((e) => e.namespace === filterNs)
    : memoryEntries

  return (
    <div style={s.page}>
      {/* Stats Banner */}
      <div style={s.statsRow}>
        <div style={s.statCard}>
          <div style={s.statLabel}>Total Entries</div>
          <div style={s.statValue}>{memoryStats?.totalEntries ?? '--'}</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statLabel}>Namespaces</div>
          <div style={s.statValue}>{namespaces.length}</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statLabel}>Storage Size</div>
          <div style={s.statValue}>{memoryStats?.storageSize ?? '--'}</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statLabel}>Indexed Vectors</div>
          <div style={s.statValue}>{memoryStats?.indexedVectors ?? '--'}</div>
          <div style={s.hnswBadge(memoryStats?.hnswEnabled ?? false)}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: memoryStats?.hnswEnabled ? 'var(--accent-green)' : 'var(--accent-red)',
            }} />
            HNSW {memoryStats?.hnswEnabled ? 'Active' : 'Inactive'}
          </div>
        </div>
      </div>

      {/* Search */}
      <Card title="Search Memory" actions={
        <Button variant="ghost" size="sm" onClick={fetchAll} loading={loading}>
          <RefreshCw size={14} /> Refresh
        </Button>
      }>
        <div style={s.searchRow}>
          <div style={{ ...s.field, flex: 2 }}>
            <span style={s.label}>Query</span>
            <input
              style={{ ...s.input, width: '100%' }}
              placeholder="Search memory entries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div style={s.field}>
            <span style={s.label}>Namespace</span>
            <select
              style={{ ...s.input, minWidth: 140 }}
              value={searchNs}
              onChange={(e) => setSearchNs(e.target.value)}
            >
              <option value="">All</option>
              {namespaces.map((ns) => <option key={ns} value={ns}>{ns}</option>)}
            </select>
          </div>
          <div style={s.field}>
            <span style={s.label}>Limit</span>
            <input
              style={{ ...s.input, width: 70 }}
              type="number"
              min={1}
              max={100}
              value={searchLimit}
              onChange={(e) => setSearchLimit(Number(e.target.value))}
            />
          </div>
          <Button onClick={handleSearch} loading={searching} size="md">
            <Search size={14} /> Search
          </Button>
        </div>

        {searchResults !== null && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </div>
            {searchResults.length === 0 ? (
              <div style={s.empty}>No results found</div>
            ) : (
              searchResults.map((entry) => (
                <div
                  key={entry.key}
                  style={s.resultItem}
                  onClick={() => setExpandedKey(expandedKey === entry.key ? null : entry.key)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
                >
                  <div style={s.resultKey}>{entry.key}</div>
                  <div style={s.resultVal}>{truncate(entry.value)}</div>
                  {entry.tags?.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {entry.tags.map((t) => <span key={t} style={s.tag}>{t}</span>)}
                    </div>
                  )}
                  {expandedKey === entry.key && (
                    <div style={s.expandedValue}>{entry.value}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      {/* Store New Entry */}
      <Card title="Store New Entry" actions={
        <Button variant="ghost" size="sm" onClick={() => setShowStore(!showStore)}>
          <Plus size={14} /> {showStore ? 'Collapse' : 'Expand'}
        </Button>
      }>
        {showStore && (
          <div style={s.storeForm}>
            <div style={s.field}>
              <span style={s.label}>Key *</span>
              <input style={s.input} placeholder="entry-key" value={storeKey}
                onChange={(e) => setStoreKey(e.target.value)} />
            </div>
            <div style={s.field}>
              <span style={s.label}>Namespace</span>
              <input style={s.input} placeholder="default" value={storeNs}
                onChange={(e) => setStoreNs(e.target.value)} />
            </div>
            <div style={{ ...s.field, ...s.fullSpan }}>
              <span style={s.label}>Value *</span>
              <textarea style={s.textarea as CSSProperties} placeholder="Entry value..."
                value={storeValue} onChange={(e) => setStoreValue(e.target.value)} />
            </div>
            <div style={s.field}>
              <span style={s.label}>Tags (comma separated)</span>
              <input style={s.input} placeholder="tag1, tag2" value={storeTags}
                onChange={(e) => setStoreTags(e.target.value)} />
            </div>
            <div style={s.field}>
              <span style={s.label}>TTL (seconds, optional)</span>
              <input style={s.input} type="number" placeholder="3600" value={storeTtl}
                onChange={(e) => setStoreTtl(e.target.value)} />
            </div>
            <div style={{ ...s.fullSpan, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => setShowStore(false)}>Cancel</Button>
              <Button size="sm" onClick={handleStore} loading={storing}
                disabled={!storeKey.trim() || !storeValue.trim()}>
                <Database size={14} /> Store Entry
              </Button>
            </div>
          </div>
        )}
        {!showStore && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Click "Expand" to add a new memory entry.
          </div>
        )}
      </Card>

      {/* Memory Entries */}
      <Card title={`Memory Entries (${filtered.length})`} actions={
        <div style={s.row}>
          <StatusBadge status={loading ? 'running' : 'idle'} size="sm" />
        </div>
      }>
        {/* Namespace filter tabs */}
        <div style={s.nsTabs}>
          <span
            style={s.nsTab(filterNs === null)}
            onClick={() => setFilterNs(null)}
          >All ({memoryEntries.length})</span>
          {namespaces.map((ns) => {
            const count = memoryEntries.filter((e) => e.namespace === ns).length
            return (
              <span key={ns} style={s.nsTab(filterNs === ns)}
                onClick={() => setFilterNs(filterNs === ns ? null : ns)}>
                {ns} ({count})
              </span>
            )
          })}
        </div>

        {filtered.length === 0 ? (
          <div style={s.empty}>No memory entries{filterNs ? ` in "${filterNs}"` : ''}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Key</th>
                  <th style={s.th}>Value</th>
                  <th style={s.th}>Namespace</th>
                  <th style={s.th}>Tags</th>
                  <th style={s.th}>Created</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.key}>
                    <td style={{ ...s.td, fontWeight: 600, color: 'var(--accent-cyan)' }}>
                      {entry.key}
                    </td>
                    <td style={{ ...s.td, maxWidth: 260, cursor: 'pointer' }}
                      onClick={() => setExpandedKey(expandedKey === entry.key ? null : entry.key)}>
                      {expandedKey === entry.key ? (
                        <div style={s.expandedValue}>{entry.value}</div>
                      ) : truncate(entry.value)}
                    </td>
                    <td style={s.td}>{entry.namespace}</td>
                    <td style={s.td}>
                      {entry.tags?.map((t) => <span key={t} style={s.tag}>{t}</span>)}
                    </td>
                    <td style={{ ...s.td, whiteSpace: 'nowrap', fontSize: 12 }}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td style={s.td}>
                      <div style={s.actions}>
                        <Button variant="danger" size="sm"
                          onClick={() => setDeleteConfirm(entry.key)}>
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div style={s.overlay} onClick={() => setDeleteConfirm(null)}>
          <div style={s.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={s.dialogTitle}>Confirm Delete</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Are you sure you want to delete memory entry "<strong>{deleteConfirm}</strong>"?
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
