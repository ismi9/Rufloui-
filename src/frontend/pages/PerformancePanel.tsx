import { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { api } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { PerformanceMetrics } from '@/types'

function StatCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <Card>
      <div style={{ padding: '16px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
          {value}
          {unit && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
      </div>
    </Card>
  )
}

export default function PerformancePanel() {
  const { performance, setPerformance, addLog } = useStore()
  const [actionResult, setActionResult] = useState<unknown>(null)
  const [actionLabel, setActionLabel] = useState('')
  const [loading, setLoading] = useState('')

  const fetchMetrics = useCallback(async () => {
    try {
      const data = (await api.performance.metrics()) as PerformanceMetrics
      setPerformance(data)
    } catch (err) {
      addLog({ level: 'error', message: `Performance metrics failed: ${(err as Error).message}`, source: 'performance' })
    }
  }, [setPerformance, addLog])

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 10000)
    return () => clearInterval(interval)
  }, [fetchMetrics])

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    setLoading(label)
    setActionResult(null)
    setActionLabel(label)
    try {
      const result = await action()
      setActionResult(result)
      addLog({ level: 'info', message: `${label} completed`, source: 'performance' })
      // If result has latency/throughput shape, update performance store
      const r = result as Record<string, unknown>
      if (r?.latency && r?.history) {
        setPerformance(r as unknown as PerformanceMetrics)
      } else {
        // Re-fetch metrics after any action to pick up changes
        await fetchMetrics()
      }
    } catch (err) {
      setActionResult({ error: (err as Error).message })
      addLog({ level: 'error', message: `${label} failed: ${(err as Error).message}`, source: 'performance' })
    } finally {
      setLoading('')
    }
  }

  const chartData = performance?.history ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Metrics Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Avg Latency" value={performance?.latency?.avg?.toFixed(1) ?? '--'} unit="ms" />
        <StatCard label="P95 Latency" value={performance?.latency?.p95?.toFixed(1) ?? '--'} unit="ms" />
        <StatCard label="P99 Latency" value={performance?.latency?.p99?.toFixed(1) ?? '--'} unit="ms" />
        <StatCard label="Throughput" value={performance?.throughput?.toFixed(1) ?? '--'} unit="req/s" />
        <StatCard label="Error Rate" value={performance?.errorRate != null ? (performance.errorRate * 100).toFixed(2) : '--'} unit="%" />
        <StatCard label="Active Requests" value={performance?.activeRequests ?? '--'} />
      </div>

      {/* Performance Chart */}
      <Card>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
            Performance Over Time
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="timestamp"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickFormatter={(v: string) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                />
                <YAxis
                  yAxisId="latency"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 11 } }}
                />
                <YAxis
                  yAxisId="throughput"
                  orientation="right"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  label={{ value: 'Throughput', angle: 90, position: 'insideRight', style: { fill: 'var(--text-muted)', fontSize: 11 } }}
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
                <Line yAxisId="latency" type="monotone" dataKey="latency" stroke="var(--accent-blue)" strokeWidth={2} dot={false} />
                <Line yAxisId="throughput" type="monotone" dataKey="throughput" stroke="var(--accent-cyan)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No performance data available
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span style={{ width: 12, height: 3, background: 'var(--accent-blue)', borderRadius: 2 }} /> Latency (ms)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span style={{ width: 12, height: 3, background: 'var(--accent-cyan)', borderRadius: 2 }} /> Throughput (req/s)
            </span>
          </div>
        </div>
      </Card>

      {/* Actions Row */}
      <Card>
        <div style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Actions</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button loading={loading === 'Benchmark'} onClick={() => runAction('Benchmark', () => api.performance.benchmark())}>
              Run Benchmark
            </Button>
            <Button loading={loading === 'Bottleneck'} onClick={() => runAction('Bottleneck', () => api.performance.bottleneck())}>
              Detect Bottlenecks
            </Button>
            <Button loading={loading === 'Optimize'} onClick={() => runAction('Optimize', () => api.performance.optimize())}>
              Optimize
            </Button>
            <Button loading={loading === 'Profile'} onClick={() => runAction('Profile', () => api.performance.profile())}>
              Generate Profile
            </Button>
            <Button loading={loading === 'Report'} onClick={() => runAction('Report', () => api.performance.report())}>
              Full Report
            </Button>
          </div>
        </div>
      </Card>

      {/* Results Area */}
      {actionResult !== null && (
        <Card>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
              Result: {actionLabel}
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
                maxHeight: 400,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(actionResult, null, 2)}
            </pre>
          </div>
        </Card>
      )}
    </div>
  )
}
