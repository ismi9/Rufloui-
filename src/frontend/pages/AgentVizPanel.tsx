import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '@/api'
import { useStore } from '@/store'
import type { VizNode, VizSession } from '@/types'

interface LogEntry {
  timestamp: string
  type: string
  tool?: string
  content: string
}

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--accent-green)',
  idle: 'var(--accent-blue)',
  done: 'var(--accent-cyan)',
  error: 'var(--accent-red)',
}

const LOG_TYPE_COLORS: Record<string, string> = {
  tool_use: 'var(--accent-cyan)',
  text: 'var(--text-secondary)',
  result: 'var(--accent-green)',
}

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || 'var(--text-muted)'
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: color, flexShrink: 0,
      boxShadow: status === 'active' ? `0 0 8px ${color}` : 'none',
      animation: status === 'active' ? 'pulse-glow 2s ease-in-out infinite' : 'none',
    }} />
  )
}

function truncatePath(p: string, maxLen = 50): string {
  if (!p || p.length <= maxLen) return p || ''
  return '...' + p.slice(p.length - maxLen + 3)
}

function TreeNode({ node, depth, selectedId, onSelect }: {
  node: VizNode; depth: number; selectedId: string | null; onSelect: (id: string) => void
}) {
  const isSelected = selectedId === node.id
  const label = node.slug || node.agentId || node.sessionId?.slice(0, 8) || 'root'
  const agentType = node.agentType || (node.agentId ? 'subagent' : 'main')

  return (
    <div style={{ marginLeft: depth > 0 ? 24 : 0 }}>
      {depth > 0 && (
        <div style={{ borderLeft: '2px solid var(--border)', height: 12, marginLeft: 5, marginBottom: -4 }} />
      )}
      <div
        onClick={() => onSelect(node.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
          borderRadius: 'var(--radius)', cursor: 'pointer', marginBottom: 2,
          background: isSelected ? 'var(--bg-hover)' : 'transparent',
          border: isSelected ? '1px solid var(--accent-blue)' : '1px solid transparent',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
      >
        <StatusDot status={node.status} />
        <span style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
          color: 'var(--accent-purple)', background: 'rgba(139, 92, 246, 0.1)',
          padding: '1px 6px', borderRadius: 3,
        }}>{agentType}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        {node.currentTool && (
          <span style={{
            fontSize: 11, fontFamily: 'monospace', color: 'var(--accent-cyan)',
            background: 'rgba(6, 182, 212, 0.1)', padding: '1px 6px', borderRadius: 3,
          }}>{node.currentTool}</span>
        )}
        {node.currentFile && (
          <span style={{
            fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200,
          }}>{truncatePath(node.currentFile)}</span>
        )}
      </div>
      {node.children.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  )
}

function findNode(tree: VizNode, id: string): VizNode | null {
  if (tree.id === id) return tree
  for (const child of tree.children) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

function countNodes(node: VizNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0)
}
function countActiveNodes(node: VizNode): number {
  return (node.status === 'active' ? 1 : 0) + node.children.reduce((sum, c) => sum + countActiveNodes(c), 0)
}
function countDoneNodes(node: VizNode): number {
  return (node.status === 'done' ? 1 : 0) + node.children.reduce((sum, c) => sum + countDoneNodes(c), 0)
}

function LogViewer({ sessionId, nodeId, nodeLabel }: { sessionId: string; nodeId: string; nodeLabel: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.viz.nodeLogs(sessionId, nodeId, 200) as LogEntry[]
      setLogs(data)
    } catch { /* may not have logs yet */ }
    finally { setLoading(false) }
  }, [sessionId, nodeId])

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 2000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-primary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            JSONL Log
          </span>
          <span style={{ fontSize: 12, color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>
            {nodeLabel}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            ({logs.length} entries)
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            style={{
              fontSize: 11, padding: '2px 8px', cursor: 'pointer',
              background: autoScroll ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              color: autoScroll ? 'var(--accent-blue)' : 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 3,
            }}
          >
            Auto-scroll {autoScroll ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            style={{
              fontSize: 11, padding: '2px 8px', cursor: 'pointer',
              background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 3,
              opacity: loading ? 0.5 : 1,
            }}
          >
            Refresh
          </button>
        </div>
      </div>
      <div ref={logRef} style={{
        flex: 1, overflowY: 'auto', padding: 8,
        fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6,
      }}>
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
            {loading ? 'Loading logs...' : 'No log entries yet'}
          </div>
        ) : logs.map((entry, i) => (
          <div key={i} style={{
            display: 'flex', gap: 8, padding: '2px 4px',
            borderRadius: 2, alignItems: 'flex-start',
          }}>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 11, minWidth: 70 }}>
              {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}
            </span>
            {entry.type === 'tool_use' ? (
              <>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, flexShrink: 0, minWidth: 120 }}>
                  {entry.tool}
                </span>
                <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                  {entry.content}
                </span>
              </>
            ) : (
              <span style={{ color: LOG_TYPE_COLORS[entry.type] || 'var(--text-muted)', wordBreak: 'break-word' }}>
                {entry.type === 'result' ? '[DONE] ' : ''}{entry.content}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function NodeDetail({ node }: { node: VizNode }) {
  const rows: [string, string][] = [
    ['ID', node.id],
    ['Session', node.sessionId],
    ['Status', node.status],
  ]
  if (node.agentId) rows.push(['Agent ID', node.agentId])
  if (node.slug) rows.push(['Slug', node.slug])
  if (node.agentType) rows.push(['Type', node.agentType])
  if (node.currentTool) rows.push(['Current Tool', node.currentTool])
  if (node.currentFile) rows.push(['Current File', node.currentFile])
  if (node.lastActivity) rows.push(['Last Activity', new Date(node.lastActivity).toLocaleTimeString()])
  if (node.taskId) rows.push(['Task ID', node.taskId])
  rows.push(['Children', String(node.children.length)])

  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)',
      }}>
        <StatusDot status={node.status} />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {node.slug || node.agentId || 'Root Session'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)', minWidth: 90, flexShrink: 0 }}>{label}</span>
            <span style={{
              color: 'var(--text-secondary)', wordBreak: 'break-all',
              fontFamily: label === 'Current Tool' || label === 'Current File' ? 'monospace' : 'inherit',
            }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AgentVizPanel() {
  const vizSessions = useStore(s => s.vizSessions)
  const selectedVizNode = useStore(s => s.selectedVizNode)
  const setSelectedVizNode = useStore(s => s.setSelectedVizNode)
  const setVizSessions = useStore(s => s.setVizSessions)
  const [loading, setLoading] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.viz.sessions() as VizSession[]
      setVizSessions(data)
      if (data.length > 0 && !activeSessionId) {
        setActiveSessionId(data[0].sessionId)
      }
    } catch { /* */ }
    finally { setLoading(false) }
  }, [activeSessionId, setVizSessions])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 5000)
    return () => clearInterval(interval)
  }, [fetchSessions])

  const activeSession = vizSessions.find(s => s.sessionId === activeSessionId)
  const selectedNode = activeSession?.tree
    ? findNode(activeSession.tree, selectedVizNode || '')
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Agent Visualization
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Real-time agent hierarchy and JSONL session logs
          </p>
        </div>
        <button
          onClick={fetchSessions} disabled={loading}
          style={{
            padding: '6px 14px', fontSize: 13, background: 'var(--accent-blue)',
            color: 'white', border: 'none', borderRadius: 'var(--radius)',
            cursor: 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >{loading ? 'Loading...' : 'Refresh'}</button>
      </div>

      {/* Session Bar */}
      {vizSessions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {vizSessions.map(session => {
            const isActive = session.sessionId === activeSessionId
            const nodeCount = countNodes(session.tree)
            const activeNodes = countActiveNodes(session.tree)
            return (
              <button key={session.sessionId} onClick={() => setActiveSessionId(session.sessionId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                  background: isActive ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                  border: isActive ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius)', cursor: 'pointer', whiteSpace: 'nowrap',
                  color: 'var(--text-primary)', fontSize: 12,
                }}>
                <StatusDot status={activeNodes > 0 ? 'active' : 'done'} />
                <span style={{ fontWeight: 500 }}>{session.sessionId.slice(0, 8)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{nodeCount} agents</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Main Content */}
      {vizSessions.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: 60, color: 'var(--text-muted)', gap: 12,
        }}>
          <div style={{ fontSize: 48, opacity: 0.3 }}>&#x1F333;</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>No Active Sessions</div>
          <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 400 }}>
            When you create and assign a task, the agent hierarchy will appear here in real-time.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12 }}>
          {/* Top row: Tree + Details */}
          <div style={{ display: 'flex', gap: 12, flex: '0 0 auto', maxHeight: selectedNode ? '40%' : '100%', minHeight: 180 }}>
            {/* Tree View */}
            <div style={{
              flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: 12, overflowY: 'auto',
            }}>
              <div style={{
                fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8,
              }}>Agent Tree</div>
              {activeSession?.tree ? (
                <TreeNode node={activeSession.tree} depth={0} selectedId={selectedVizNode} onSelect={setSelectedVizNode} />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 12 }}>Select a session</div>
              )}
            </div>

            {/* Detail + Summary sidebar */}
            <div style={{ width: 280, minWidth: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedNode ? (
                <NodeDetail node={selectedNode} />
              ) : (
                <div style={{
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: 16, color: 'var(--text-muted)',
                  fontSize: 13, textAlign: 'center',
                }}>Click a node to view details & logs</div>
              )}
              {activeSession && (
                <div style={{
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: 12,
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Total</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{countNodes(activeSession.tree)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Active</span>
                      <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>{countActiveNodes(activeSession.tree)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Done</span>
                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{countDoneNodes(activeSession.tree)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom row: Log Viewer (shows when a node is selected) */}
          {selectedNode && activeSessionId && (
            <div style={{ flex: 1, minHeight: 200 }}>
              <LogViewer
                sessionId={activeSessionId}
                nodeId={selectedNode.id}
                nodeLabel={selectedNode.slug || selectedNode.agentId || selectedNode.sessionId?.slice(0, 8) || 'root'}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
