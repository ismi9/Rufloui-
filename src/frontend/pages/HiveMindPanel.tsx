import { useState, useEffect, type CSSProperties } from 'react'
import { useStore } from '@/store'
import { api } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Users, Radio } from 'lucide-react'

const COLORS = ['var(--accent-blue)', 'var(--accent-green)', 'var(--accent-yellow)', 'var(--accent-red)', 'var(--accent-cyan)']

const s = {
  page: { display: 'flex', flexDirection: 'column', gap: 20 } as CSSProperties,
  banner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
  } as CSSProperties,
  bannerLeft: { display: 'flex', alignItems: 'center', gap: 16 } as CSSProperties,
  bannerRight: { display: 'flex', gap: 8 } as CSSProperties,
  stat: { fontSize: 13, color: 'var(--text-muted)' } as CSSProperties,
  statValue: { color: 'var(--text-primary)', fontWeight: 600 } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 } as CSSProperties,
  label: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' } as CSSProperties,
  input: {
    width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg-input)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)',
    outline: 'none', boxSizing: 'border-box',
  } as CSSProperties,
  select: {
    width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg-input)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)',
    outline: 'none',
  } as CSSProperties,
  row: { display: 'flex', gap: 8, marginTop: 12 } as CSSProperties,
  memberList: { display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  memberItem: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
  } as CSSProperties,
  memberId: { fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' } as CSSProperties,
  circle: {
    width: 200, height: 200, borderRadius: '50%', border: '2px dashed var(--border)',
    position: 'relative', margin: '16px auto',
  } as CSSProperties,
  optionRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 } as CSSProperties,
  kvRow: {
    display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
    background: 'var(--bg-input)', borderRadius: 'var(--radius)', marginBottom: 6,
    border: '1px solid var(--border)',
  } as CSSProperties,
  kvKey: { fontSize: 13, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' } as CSSProperties,
  kvValue: { fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' } as CSSProperties,
  resultBox: {
    padding: 16, background: 'var(--bg-input)', borderRadius: 'var(--radius)',
    border: '1px solid var(--border)', marginTop: 12,
  } as CSSProperties,
  resultTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 } as CSSProperties,
  resultLine: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 } as CSSProperties,
  success: { fontSize: 13, color: 'var(--accent-green)', marginTop: 8 } as CSSProperties,
  empty: { fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' } as CSSProperties,
}

export default function HiveMindPanel() {
  const { hiveMind, setHiveMind, agents } = useStore()
  const [protocol, setProtocol] = useState('raft')
  const [loading, setLoading] = useState('')
  const [joinAgentId, setJoinAgentId] = useState('')
  const [topic, setTopic] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastSent, setBroadcastSent] = useState(false)
  const [sharedMemory, setSharedMemory] = useState<Record<string, unknown>>({})
  const [lastConsensusResult, setLastConsensusResult] = useState<{
    topic: string; result: string; votes: Record<string, string>
  } | null>(null)

  const isActive = hiveMind?.status === 'active' || hiveMind?.status === 'consensus'

  useEffect(() => {
    api.hiveMind.status().then((data: unknown) => setHiveMind(data as Parameters<typeof setHiveMind>[0])).catch(() => {})
  }, [])

  useEffect(() => {
    if (isActive) {
      api.hiveMind.memory().then((data: unknown) => setSharedMemory((data as Record<string, unknown>) || {})).catch(() => {})
    }
  }, [isActive])

  async function handleInit() {
    setLoading('init')
    try {
      await api.hiveMind.init({ protocol })
      // Give CLI a moment to fully initialize then fetch status
      await new Promise(r => setTimeout(r, 500))
      const data = await api.hiveMind.status()
      setHiveMind(data as Parameters<typeof setHiveMind>[0])
    } catch { /* noop */ }
    setLoading('')
  }

  async function handleShutdown() {
    setLoading('shutdown')
    try {
      await api.hiveMind.shutdown()
      const data = await api.hiveMind.status()
      setHiveMind(data as Parameters<typeof setHiveMind>[0])
    } catch { /* noop */ }
    setLoading('')
  }

  async function handleJoin() {
    if (!joinAgentId) return
    setLoading('join')
    try {
      const data = await api.hiveMind.join(joinAgentId)
      const result = data as { status?: string; members?: string[]; consensusProtocol?: string }
      if (result.status) {
        setHiveMind(result as Parameters<typeof setHiveMind>[0])
      } else {
        const fresh = await api.hiveMind.status()
        setHiveMind(fresh as Parameters<typeof setHiveMind>[0])
      }
      setJoinAgentId('')
    } catch { /* noop */ }
    setLoading('')
  }

  async function handleLeave(agentId: string) {
    setLoading(`leave-${agentId}`)
    try {
      const data = await api.hiveMind.leave(agentId)
      const result = data as { status?: string; members?: string[]; consensusProtocol?: string }
      if (result.status) {
        setHiveMind(result as Parameters<typeof setHiveMind>[0])
      } else {
        const fresh = await api.hiveMind.status()
        setHiveMind(fresh as Parameters<typeof setHiveMind>[0])
      }
    } catch { /* noop */ }
    setLoading('')
  }

  async function handleConsensus() {
    if (!topic || options.filter(Boolean).length < 2) return
    setLoading('consensus')
    try {
      const result = await api.hiveMind.consensus(topic, options.filter(Boolean)) as {
        topic: string; result: string; votes: Record<string, string>
      }
      setLastConsensusResult(result)
      const data = await api.hiveMind.status()
      setHiveMind(data as Parameters<typeof setHiveMind>[0])
    } catch { /* noop */ }
    setLoading('')
  }

  async function handleBroadcast() {
    if (!broadcastMsg) return
    setLoading('broadcast')
    try {
      await api.hiveMind.broadcast(broadcastMsg)
      setBroadcastSent(true)
      setBroadcastMsg('')
      setTimeout(() => setBroadcastSent(false), 3000)
    } catch { /* noop */ }
    setLoading('')
  }

  const status = hiveMind?.status || 'inactive'
  const members = hiveMind?.members || []

  // Build vote chart data from lastConsensusResult or hiveMind.lastConsensus
  const consensus = lastConsensusResult || hiveMind?.lastConsensus
  const voteData = consensus ? Object.entries(
    Object.values(consensus.votes).reduce<Record<string, number>>((acc, vote) => {
      acc[vote] = (acc[vote] || 0) + 1
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value })) : []

  // Circle layout for members
  const memberPositions = members.map((_, i) => {
    const angle = (2 * Math.PI * i) / Math.max(members.length, 1) - Math.PI / 2
    const cx = 90 + 70 * Math.cos(angle)
    const cy = 90 + 70 * Math.sin(angle)
    return { left: cx, top: cy }
  })

  return (
    <div style={s.page}>
      {/* Status Banner */}
      <div style={s.banner}>
        <div style={s.bannerLeft}>
          <Users size={20} color="var(--accent-cyan)" />
          <StatusBadge status={status} />
          <span style={s.stat}>Members: <span style={s.statValue}>{members.length}</span></span>
          <span style={s.stat}>Protocol: <span style={s.statValue}>{hiveMind?.consensusProtocol || 'none'}</span></span>
        </div>
        <div style={s.bannerRight}>
          {!isActive && <Button size="sm" onClick={handleInit} loading={loading === 'init'}>Initialize</Button>}
          {isActive && <Button size="sm" variant="danger" onClick={handleShutdown} loading={loading === 'shutdown'}>Shutdown</Button>}
        </div>
      </div>

      {/* Initialize Section (when inactive) */}
      {!isActive && (
        <Card title="Initialize Hive Mind">
          <label style={s.label}>Consensus Protocol</label>
          <select style={s.select} value={protocol} onChange={(e) => setProtocol(e.target.value)}>
            <option value="raft">Raft</option>
            <option value="pbft">PBFT</option>
            <option value="gossip">Gossip</option>
          </select>
          <div style={s.row}>
            <Button onClick={handleInit} loading={loading === 'init'}>Initialize Hive Mind</Button>
          </div>
        </Card>
      )}

      {isActive && (
        <div style={s.grid}>
          {/* Members Section */}
          <Card title="Members">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select
                style={{ ...s.select, flex: 1 }}
                value={joinAgentId}
                onChange={(e) => setJoinAgentId(e.target.value)}
              >
                <option value="">Select agent to join...</option>
                {agents
                  .filter((a) => !members.includes(a.id))
                  .map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)
                }
              </select>
              <Button size="sm" onClick={handleJoin} loading={loading === 'join'} disabled={!joinAgentId}>Join</Button>
            </div>
            {members.length === 0 && <p style={s.empty}>No members yet</p>}
            <div style={s.memberList}>
              {members.map((id) => (
                <div key={id} style={s.memberItem}>
                  <span style={s.memberId}>{id}</span>
                  <Button size="sm" variant="danger" onClick={() => handleLeave(id)} loading={loading === `leave-${id}`}>Leave</Button>
                </div>
              ))}
            </div>
            {/* Circle layout */}
            {members.length > 0 && (
              <div style={s.circle as CSSProperties}>
                {members.map((id, i) => (
                  <div
                    key={id}
                    title={id}
                    style={{
                      position: 'absolute',
                      left: memberPositions[i].left,
                      top: memberPositions[i].top,
                      width: 20, height: 20, borderRadius: '50%',
                      background: COLORS[i % COLORS.length],
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Consensus Section */}
          <Card title="Consensus">
            <label style={s.label}>Topic</label>
            <input style={s.input} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Enter topic..." />
            <label style={{ ...s.label, marginTop: 12 }}>Options</label>
            {options.map((opt, i) => (
              <div key={i} style={s.optionRow}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  value={opt}
                  onChange={(e) => {
                    const next = [...options]
                    next[i] = e.target.value
                    setOptions(next)
                  }}
                  placeholder={`Option ${i + 1}`}
                />
                {options.length > 2 && (
                  <Button size="sm" variant="ghost" onClick={() => setOptions(options.filter((_, j) => j !== i))}>X</Button>
                )}
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={() => setOptions([...options, ''])}>+ Add Option</Button>
            <div style={s.row}>
              <Button onClick={handleConsensus} loading={loading === 'consensus'} disabled={!topic || options.filter(Boolean).length < 2}>
                Run Consensus
              </Button>
            </div>

            {consensus && (
              <div style={s.resultBox}>
                <div style={s.resultTitle}>Last Consensus Result</div>
                <div style={s.resultLine}>Topic: {consensus.topic}</div>
                <div style={s.resultLine}>Winner: <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>{consensus.result}</span></div>
                {voteData.length > 0 && (
                  <div style={{ height: 180, marginTop: 12 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={voteData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                          {voteData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Broadcast Section */}
          <Card title="Broadcast">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...s.input, flex: 1 }}
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                placeholder="Message to broadcast..."
                onKeyDown={(e) => e.key === 'Enter' && handleBroadcast()}
              />
              <Button onClick={handleBroadcast} loading={loading === 'broadcast'} disabled={!broadcastMsg}>
                <Radio size={14} /> Broadcast
              </Button>
            </div>
            {broadcastSent && <p style={s.success}>Message broadcast successfully</p>}
          </Card>

          {/* Shared Memory */}
          <Card title="Shared Memory" actions={
            <Button size="sm" variant="secondary" onClick={() => {
              api.hiveMind.memory().then((data: unknown) => setSharedMemory((data as Record<string, unknown>) || {})).catch(() => {})
            }}>Refresh</Button>
          }>
            {Object.keys(sharedMemory).length === 0 && <p style={s.empty}>No shared memories</p>}
            {Object.entries(sharedMemory).map(([key, val]) => (
              <div key={key} style={s.kvRow}>
                <span style={s.kvKey}>{key}</span>
                <span style={s.kvValue}>{typeof val === 'string' ? val : JSON.stringify(val)}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  )
}
