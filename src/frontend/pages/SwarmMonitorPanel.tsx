import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/api'
import { useStore } from '@/store'
import type { SwarmMonitorState, SwarmAgent } from '@/types'

interface AgentActivityEvent {
  agentId: string
  status: 'idle' | 'working' | 'error'
  currentTask?: string
  currentAction?: string
  lastUpdate: string
  tasksCompleted: number
  errors: number
}

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--accent-green)',
  working: '#f59e0b',
  healthy: 'var(--accent-green)',
  idle: 'var(--accent-blue)',
  error: 'var(--accent-red)',
  ready: 'var(--accent-cyan)',
  shutdown: 'var(--text-muted)',
  inactive: 'var(--text-muted)',
}

const STATUS_BG_COLORS: Record<string, string> = {
  active: 'rgba(34, 197, 94, 0.12)',
  working: 'rgba(245, 158, 11, 0.15)',
  healthy: 'rgba(34, 197, 94, 0.10)',
  idle: 'rgba(59, 130, 246, 0.08)',
  error: 'rgba(239, 68, 68, 0.15)',
  ready: 'rgba(6, 182, 212, 0.10)',
  shutdown: 'rgba(100, 116, 139, 0.08)',
  inactive: 'rgba(100, 116, 139, 0.08)',
}

const STATUS_BORDER_COLORS: Record<string, string> = {
  active: 'rgba(34, 197, 94, 0.4)',
  working: 'rgba(245, 158, 11, 0.5)',
  healthy: 'rgba(34, 197, 94, 0.3)',
  idle: 'rgba(59, 130, 246, 0.2)',
  error: 'rgba(239, 68, 68, 0.5)',
  ready: 'rgba(6, 182, 212, 0.3)',
  shutdown: 'var(--border)',
  inactive: 'var(--border)',
}

const TYPE_COLORS: Record<string, string> = {
  coordinator: '#a78bfa',
  coder: '#34d399',
  researcher: '#60a5fa',
  tester: '#fbbf24',
  reviewer: '#f87171',
  architect: '#f472b6',
  analyst: '#38bdf8',
  optimizer: '#c084fc',
}

// ── Agent Output Modal ──────────────────────────────────────────────
function AgentOutputModal({ agent, onClose }: { agent: SwarmAgent; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  // Initial load
  useEffect(() => {
    api.swarmMonitor.agentOutput(agent.id).then(res => {
      setLines(res.lines || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [agent.id])

  // Listen for real-time output via WS
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; payload: { agentId: string; line: string } }
        if (msg.type === 'agent:output' && msg.payload.agentId === agent.id) {
          setLines(prev => [...prev, msg.payload.line])
        }
      } catch { /* ignore */ }
    }
    return () => ws.close()
  }, [agent.id])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40
  }

  const typeColor = TYPE_COLORS[agent.type] || 'var(--accent-cyan)'
  const statusColor = STATUS_COLORS[agent.status] || 'var(--text-muted)'

  function formatLine(line: string, idx: number) {
    let color = 'var(--text-secondary)'
    let prefix = ''
    if (line.startsWith('[Tool]')) { color = 'var(--accent-cyan)'; prefix = 'tool' }
    else if (line.startsWith('[Result]')) { color = 'var(--text-muted)'; prefix = 'result' }
    else if (line.startsWith('[stderr]')) { color = 'var(--accent-red)'; prefix = 'err' }
    else if (line.startsWith('[Done]')) { color = 'var(--accent-green)'; prefix = 'done' }

    return (
      <div key={idx} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, width: 30, textAlign: 'right', flexShrink: 0, fontFamily: 'monospace' }}>
          {idx + 1}
        </span>
        {prefix && (
          <span style={{
            color, fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            width: 44, flexShrink: 0,
          }}>
            {prefix}
          </span>
        )}
        <span style={{ color, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
          {prefix ? line.slice(line.indexOf(']') + 2) : line}
        </span>
      </div>
    )
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '85vw', maxWidth: 960, height: '80vh',
          background: 'var(--bg-primary)', border: '1px solid var(--border)',
          borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%', background: statusColor,
              boxShadow: agent.status === 'working' ? `0 0 8px ${statusColor}` : 'none',
              animation: agent.status === 'working' ? 'pulse-glow 2s ease-in-out infinite' : 'none',
            }} />
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 10,
              background: `${typeColor}22`, color: typeColor, textTransform: 'uppercase',
            }}>
              {agent.type}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Agent Output</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{agent.id}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {(agent.status === 'working' || agent.status === 'active') && (
              <span style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 10,
                background: `${statusColor}22`, color: statusColor, fontWeight: 600,
                animation: 'pulse-glow 2s ease-in-out infinite',
              }}>
                LIVE
              </span>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20,
                cursor: 'pointer', padding: '0 4px', lineHeight: 1,
              }}
            >
              x
            </button>
          </div>
        </div>

        {/* Current action bar */}
        {agent.currentAction && (
          <div style={{
            padding: '8px 20px', background: 'rgba(245, 158, 11, 0.08)',
            borderBottom: '1px solid var(--border)', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>Current:</span>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{agent.currentAction}</span>
          </div>
        )}

        {/* Output body */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            flex: 1, overflow: 'auto', padding: '12px 20px',
            fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6,
          }}
        >
          {loading ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading output...</div>
          ) : lines.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
              No output yet. Output will appear here when the agent starts working on a task.
            </div>
          ) : (
            lines.map((line, i) => formatLine(line, i))
          )}
        </div>

        {/* Footer stats */}
        <div style={{
          display: 'flex', gap: 16, padding: '8px 20px', borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary)', fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span>Lines: {lines.length}</span>
          <span>Tasks completed: {agent.tasks?.completed ?? 0}</span>
          <span>Errors: {agent.tasks?.failed ?? agent.errors?.count ?? 0}</span>
          <span style={{ marginLeft: 'auto' }}>Click outside or press X to close</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Agent Card ──────────────────────────────────────────────────────
function AgentCard({ agent, selected, onClick, onViewOutput }: {
  agent: SwarmAgent; selected: boolean; onClick: () => void; onViewOutput: () => void
}) {
  const color = STATUS_COLORS[agent.status] || 'var(--text-muted)'
  const typeColor = TYPE_COLORS[agent.type] || 'var(--accent-cyan)'
  const memPct = agent.memory ? Math.round((agent.memory.used / agent.memory.limit) * 100) : 0
  const isWorking = agent.status === 'working'

  return (
    <div
      onClick={onClick}
      className={isWorking ? 'agent-working-glow' : undefined}
      style={{
        padding: 14,
        background: selected ? 'var(--bg-hover)' : (STATUS_BG_COLORS[agent.status] || 'var(--bg-secondary)'),
        border: `1px solid ${selected ? 'var(--accent-blue)' : (STATUS_BORDER_COLORS[agent.status] || 'var(--border)')}`,
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        transition: 'all var(--transition)',
        minWidth: 220,
        ...(isWorking ? { boxShadow: '0 0 12px rgba(245, 158, 11, 0.25)' } : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0,
          boxShadow: agent.status === 'active' || agent.status === 'working' ? `0 0 8px ${color}` : 'none',
          animation: agent.status === 'active' || agent.status === 'working' ? 'pulse-glow 2s ease-in-out infinite' : 'none',
        }} />
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
          background: `${typeColor}22`, color: typeColor, textTransform: 'uppercase',
        }}>
          {agent.type}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {agent.status}
        </span>
      </div>
      {/* Current action */}
      {agent.currentAction && (
        <div style={{
          fontSize: 11, color: '#f59e0b', fontFamily: 'monospace', marginBottom: 6,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {agent.currentAction}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {agent.id}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>Tasks: {agent.taskCount}</span>
          <span>CPU: {agent.cpu ?? 0}%</span>
          <span>Mem: {memPct}%</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onViewOutput() }}
          style={{
            fontSize: 10, padding: '2px 8px', background: 'rgba(255,255,255,0.08)',
            border: '1px solid var(--border)', borderRadius: 4, color: 'var(--accent-cyan)',
            cursor: 'pointer',
          }}
        >
          Output
        </button>
      </div>
      {/* Memory bar */}
      <div style={{ marginTop: 6, height: 3, background: 'var(--bg-primary)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${memPct}%`, background: memPct > 80 ? 'var(--accent-red)' : 'var(--accent-blue)', transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

function AgentDetail({ agent, onViewOutput }: { agent: SwarmAgent; onViewOutput: () => void }) {
  const typeColor = TYPE_COLORS[agent.type] || 'var(--accent-cyan)'
  const upHours = agent.uptime ? Math.floor(agent.uptime / 3600000) : 0
  const upMins = agent.uptime ? Math.floor((agent.uptime % 3600000) / 60000) : 0

  return (
    <div style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: STATUS_COLORS[agent.status] || 'var(--text-muted)',
        }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: typeColor }}>{agent.type}</span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>({agent.status})</span>
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>{agent.id}</div>

      {agent.currentAction && (
        <div style={{
          padding: '8px 10px', marginBottom: 12, borderRadius: 'var(--radius)',
          background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
          fontSize: 12, fontFamily: 'monospace', color: '#f59e0b', wordBreak: 'break-word',
        }}>
          {agent.currentAction}
        </div>
      )}

      <button
        onClick={onViewOutput}
        style={{
          width: '100%', padding: '8px 0', marginBottom: 12, fontSize: 13, fontWeight: 600,
          background: 'var(--accent-blue)', color: '#fff', border: 'none',
          borderRadius: 'var(--radius)', cursor: 'pointer',
        }}
      >
        View Live Output
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <StatBox label="Uptime" value={`${upHours}h ${upMins}m`} />
        <StatBox label="Health" value={`${Math.round((agent.health ?? 1) * 100)}%`} color={agent.health >= 0.8 ? 'var(--accent-green)' : 'var(--accent-red)'} />
        <StatBox label="CPU" value={`${agent.cpu ?? 0}%`} />
        <StatBox label="Memory" value={`${agent.memory?.used ?? 0}/${agent.memory?.limit ?? 512} MB`} />
        <StatBox label="Avg Latency" value={`${agent.latency?.avg ?? 0}ms`} />
        <StatBox label="P99 Latency" value={`${agent.latency?.p99 ?? 0}ms`} />
        <StatBox label="Tasks Active" value={String(agent.tasks?.active ?? 0)} />
        <StatBox label="Tasks Completed" value={String(agent.tasks?.completed ?? 0)} />
        <StatBox label="Tasks Failed" value={String(agent.tasks?.failed ?? 0)} color={agent.tasks?.failed ? 'var(--accent-red)' : undefined} />
        <StatBox label="Errors" value={String(agent.errors?.count ?? 0)} color={agent.errors?.count ? 'var(--accent-red)' : undefined} />
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
        Created: {new Date(agent.createdAt).toLocaleString()}
      </div>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: 8, background: 'var(--bg-primary)', borderRadius: 'var(--radius)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || 'var(--text-primary)', fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3, transition: 'width 0.5s',
          width: `${value}%`,
          background: value >= 80 ? 'var(--accent-green)' : value >= 40 ? 'var(--accent-blue)' : 'var(--accent-yellow)',
        }} />
      </div>
    </div>
  )
}

export default function SwarmMonitorPanel() {
  const [data, setData] = useState<SwarmMonitorState | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [outputAgent, setOutputAgent] = useState<SwarmAgent | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [currentOnly, setCurrentOnly] = useState(true)
  const [purging, setPurging] = useState(false)
  const setSwarmMonitor = useStore(s => s.setSwarmMonitor)

  const fetchData = useCallback(async () => {
    try {
      const snapshot = await api.swarmMonitor.snapshot(currentOnly) as SwarmMonitorState
      setData(snapshot)
      setSwarmMonitor(snapshot)
    } catch {
      /* ignore fetch errors during polling */
    } finally {
      setLoading(false)
    }
  }, [setSwarmMonitor, currentOnly])

  const handlePurge = async () => {
    setPurging(true)
    try {
      await api.swarmMonitor.purge()
      await fetchData()
    } catch { /* ignore */ }
    setPurging(false)
  }

  // Listen for real-time agent:activity WebSocket events
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; payload: unknown }
        if (msg.type === 'agent:activity') {
          const activity = msg.payload as AgentActivityEvent
          setData(prev => {
            if (!prev) return prev
            const updated = prev.agents.map(agent => {
              if (agent.id !== activity.agentId) return agent
              return {
                ...agent,
                status: activity.status as SwarmAgent['status'],
                currentTask: activity.currentTask,
                currentAction: activity.currentAction,
                tasks: {
                  ...(agent.tasks || { active: 0, queued: 0, completed: 0, failed: 0 }),
                  completed: activity.tasksCompleted,
                  failed: activity.errors,
                },
              }
            })
            return { ...prev, agents: updated }
          })
          // Update output modal agent if it's the same
          setOutputAgent(prev => {
            if (!prev || prev.id !== activity.agentId) return prev
            return {
              ...prev,
              status: activity.status as SwarmAgent['status'],
              currentAction: activity.currentAction,
              currentTask: activity.currentTask,
            }
          })
        }
      } catch { /* ignore bad messages */ }
    }

    return () => ws.close()
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  const selected = data?.agents.find(a => a.id === selectedAgent) || null

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
      <div style={{
        width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--accent-blue)',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 500 }}>Loading swarm data...</div>
    </div>
  )

  const noSwarm = !data || data.status === 'inactive' || data.status === 'shutdown'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Output modal */}
      {outputAgent && <AgentOutputModal agent={outputAgent} onClose={() => setOutputAgent(null)} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>Swarm Monitor</h2>
          {data && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10,
              background: `${STATUS_COLORS[data.status] || 'var(--text-muted)'}22`,
              color: STATUS_COLORS[data.status] || 'var(--text-muted)',
              textTransform: 'uppercase',
            }}>
              {data.status}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={currentOnly} onChange={() => setCurrentOnly(!currentOnly)} />
            Current swarm only
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={() => setAutoRefresh(!autoRefresh)} />
            Auto-refresh
          </label>
          <button
            onClick={handlePurge}
            disabled={purging}
            style={{
              padding: '6px 14px', fontSize: 12, background: 'var(--accent-red)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius)', cursor: purging ? 'wait' : 'pointer',
              opacity: purging ? 0.6 : 1,
            }}
          >
            {purging ? 'Purging...' : 'Purge All Agents'}
          </button>
          <button
            onClick={fetchData}
            style={{
              padding: '6px 14px', fontSize: 12, background: 'var(--accent-blue)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {noSwarm ? (
        <div style={{
          padding: 40, textAlign: 'center', background: 'var(--bg-secondary)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 8 }}>No Active Swarm</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Initialize a swarm from the Swarm panel to see live agent monitoring here.
          </div>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div data-tour="monitor-status" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Topology</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent-cyan)' }}>{data?.topology}</div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Strategy</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent-purple, #a78bfa)' }}>{data?.strategy}</div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Agents</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                {(data?.agentSummary.total || data?.agents.length) ?? 0}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                  ({data?.agents.filter(a => a.status === 'active' || a.status === 'working').length || 0} active)
                </span>
              </div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Consensus</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent-yellow)' }}>{data?.coordination.consensusRounds ?? 0} rounds</div>
            </div>
          </div>

          {/* Progress */}
          {data && data.progress > 0 && (
            <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <ProgressBar value={data.progress} label={data.objective || 'Swarm Progress'} />
            </div>
          )}

          {/* Main content: agents grid + detail */}
          <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
            {/* Agent grid */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Agents ({data?.agents.length ?? 0})
              </div>
              <div data-tour="monitor-agents" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {data?.agents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    selected={selectedAgent === agent.id}
                    onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                    onViewOutput={() => setOutputAgent(agent)}
                  />
                ))}
              </div>
              {(!data?.agents.length) && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  No agents deployed yet
                </div>
              )}
            </div>

            {/* Detail panel */}
            {selected && (
              <div style={{ width: 320, flexShrink: 0, overflow: 'auto' }}>
                <AgentDetail agent={selected} onViewOutput={() => setOutputAgent(selected)} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
