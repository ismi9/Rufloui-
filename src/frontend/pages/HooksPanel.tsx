import { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { api } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { HookConfig } from '@/types'

interface HookMetrics {
  totalHooks: number
  totalRuns: number
  errorCount: number
  hooks?: Array<{ name: string; runCount: number }>
}

export default function HooksPanel() {
  const { hooks, setHooks, addLog } = useStore()
  const [metrics, setMetrics] = useState<HookMetrics | null>(null)
  const [explainResult, setExplainResult] = useState<{ name: string; explanation: unknown } | null>(null)
  const [loadingExplain, setLoadingExplain] = useState('')
  const [initLoading, setInitLoading] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [hookRes, metricsRes] = await Promise.all([
        api.hooks.list(),
        api.hooks.metrics(),
      ])
      const hData = hookRes as { hooks?: HookConfig[] } | HookConfig[]
      setHooks(Array.isArray(hData) ? hData : (hData.hooks ?? []))
      setMetrics(metricsRes as HookMetrics)
    } catch (err) {
      addLog({ level: 'error', message: `Hooks fetch failed: ${(err as Error).message}`, source: 'hooks' })
    }
  }, [setHooks, addLog])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleInit = async () => {
    setInitLoading(true)
    try {
      await api.hooks.init()
      addLog({ level: 'info', message: 'Hooks initialized', source: 'hooks' })
      await fetchData()
    } catch (err) {
      addLog({ level: 'error', message: `Hooks init failed: ${(err as Error).message}`, source: 'hooks' })
    } finally {
      setInitLoading(false)
    }
  }

  const handleExplain = async (hookName: string) => {
    setLoadingExplain(hookName)
    try {
      const result = await api.hooks.explain(hookName)
      setExplainResult({ name: hookName, explanation: result })
    } catch (err) {
      addLog({ level: 'error', message: `Explain failed for ${hookName}: ${(err as Error).message}`, source: 'hooks' })
    } finally {
      setLoadingExplain('')
    }
  }

  const barData = hooks.map((h) => ({ name: h.name, runCount: h.runCount }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header with Init */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Hooks Configuration</div>
        <Button loading={initLoading} onClick={handleInit}>Initialize Hooks</Button>
      </div>

      {/* Metrics Overview */}
      {metrics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Card>
            <div style={{ padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{metrics.totalHooks}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Total Hooks</div>
            </div>
          </Card>
          <Card>
            <div style={{ padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{metrics.totalRuns}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Total Runs</div>
            </div>
          </Card>
          <Card>
            <div style={{ padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-red)' }}>{metrics.errorCount}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Errors</div>
            </div>
          </Card>
        </div>
      )}

      {/* Hook List Table */}
      <Card>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Hook List</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Type', 'Trigger', 'Enabled', 'Run Count', 'Last Run', 'Actions'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        color: 'var(--text-muted)',
                        fontWeight: 500,
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hooks.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                      No hooks configured
                    </td>
                  </tr>
                ) : (
                  hooks.map((hook) => (
                    <tr key={hook.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>{hook.name}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{hook.type}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{hook.trigger}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <StatusBadge status={hook.enabled ? 'active' : 'idle'} size="sm" />
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {hook.runCount}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'monospace' }}>
                        {hook.lastRun ? new Date(hook.lastRun).toLocaleString() : '--'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={loadingExplain === hook.name}
                          onClick={() => handleExplain(hook.name)}
                        >
                          Explain
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Explain Result */}
      {explainResult && (
        <Card>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                Explain: {explainResult.name}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setExplainResult(null)}>Close</Button>
            </div>
            <pre
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: 16,
                fontSize: 12,
                color: 'var(--text-secondary)',
                overflow: 'auto',
                maxHeight: 300,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(explainResult.explanation, null, 2)}
            </pre>
          </div>
        </Card>
      )}

      {/* Bar Chart of Run Counts */}
      {barData.length > 0 && (
        <Card>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
              Hook Run Counts
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="runCount" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  )
}
