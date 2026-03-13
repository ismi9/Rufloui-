import React, { useState, useEffect } from 'react'
import { api } from '@/api'
import type { PreflightResult, PreflightCheck } from '@/api'

const statusIcon: Record<string, string> = { ok: '●', warn: '▲', fail: '✕' }
const statusColor: Record<string, string> = {
  ok: 'var(--accent-green)',
  warn: 'var(--accent-yellow)',
  fail: 'var(--accent-red)',
}

function CheckRow({ check }: { check: PreflightCheck }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px',
      background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
    }}>
      <span style={{ color: statusColor[check.status], fontSize: 18, lineHeight: '24px', flexShrink: 0 }}>
        {statusIcon[check.status]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{check.name}</span>
          <span style={{
            fontSize: 11, padding: '1px 8px', borderRadius: 10,
            background: `${statusColor[check.status]}22`, color: statusColor[check.status],
            textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px',
          }}>
            {check.status}
          </span>
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>{check.detail}</div>
        {check.fix && (
          <div style={{
            marginTop: 6, padding: '6px 10px', background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius)', fontSize: 12, fontFamily: 'monospace',
            color: 'var(--accent-yellow)', borderLeft: '3px solid var(--accent-yellow)',
          }}>
            {check.fix}
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  onContinue: () => void
}

export default function SetupWizard({ onContinue }: Props) {
  const [result, setResult] = useState<PreflightResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [fixing, setFixing] = useState(false)
  const [fixResult, setFixResult] = useState<Array<{ id: string; action: string; success: boolean; detail: string }> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runChecks = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.system.preflight()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot reach backend. Is it running?')
    } finally {
      setLoading(false)
    }
  }

  const runAutoFix = async () => {
    setFixing(true)
    setFixResult(null)
    try {
      const data = await api.system.preflightFix()
      setFixResult(data.results)
      // Re-run checks after fix
      await runChecks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-fix failed')
    } finally {
      setFixing(false)
    }
  }

  useEffect(() => { runChecks() }, [])

  const canContinue = result && result.failed === 0

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        maxWidth: 560, width: '100%', background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '28px 28px 20px', borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(6,182,212,0.05))',
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            RuFloUI Setup
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 6 }}>
            Checking dependencies and environment before starting...
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
              <div style={{
                width: 24, height: 24, border: '3px solid var(--border)',
                borderTopColor: 'var(--accent-blue)', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ color: 'var(--text-secondary)' }}>Running checks...</span>
            </div>
          )}

          {error && (
            <div style={{
              padding: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius)',
              border: '1px solid var(--accent-red)', color: 'var(--accent-red)',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Backend unreachable</div>
              <div style={{ fontSize: 13 }}>{error}</div>
              <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-secondary)' }}>
                Make sure the backend is running: <code style={{ color: 'var(--accent-cyan)' }}>npm run dev:backend</code>
              </div>
            </div>
          )}

          {result && !loading && (
            <>
              {/* Summary bar */}
              <div style={{
                display: 'flex', gap: 16, marginBottom: 16, padding: '10px 16px',
                background: result.status === 'ok' ? 'rgba(16,185,129,0.08)' : result.status === 'warn' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
                borderRadius: 'var(--radius)', border: `1px solid ${statusColor[result.status]}44`,
              }}>
                <span style={{ color: statusColor[result.status], fontWeight: 600 }}>
                  {result.status === 'ok' ? 'All checks passed' : result.status === 'warn' ? `${result.warned} warning(s)` : `${result.failed} check(s) failed`}
                </span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontSize: 13 }}>
                  {result.passed} passed / {result.checks.length} total
                </span>
              </div>

              {/* Check list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.checks.map(c => <CheckRow key={c.id} check={c} />)}
              </div>

              {/* Fix results */}
              {fixResult && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Auto-fix results
                  </div>
                  {fixResult.map(r => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      background: 'var(--bg-secondary)', borderRadius: 'var(--radius)',
                      border: `1px solid ${r.success ? 'var(--accent-green)' : 'var(--accent-red)'}44`,
                    }}>
                      <span style={{ color: r.success ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: 16 }}>
                        {r.success ? '\u25cf' : '\u2715'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{r.action}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{r.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button
            onClick={runChecks}
            disabled={loading || fixing}
            style={{
              padding: '8px 18px', borderRadius: 'var(--radius)', fontSize: 13,
              background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', cursor: loading || fixing ? 'not-allowed' : 'pointer',
              opacity: loading || fixing ? 0.5 : 1,
            }}
          >
            Re-check
          </button>
          {result && (result.failed > 0 || result.warned > 0) && (
            <button
              onClick={runAutoFix}
              disabled={fixing || loading}
              style={{
                padding: '8px 18px', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 600,
                background: fixing ? 'var(--bg-tertiary)' : 'var(--accent-yellow)',
                color: fixing ? 'var(--text-secondary)' : '#000',
                border: 'none',
                cursor: fixing ? 'not-allowed' : 'pointer',
                opacity: fixing ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {fixing && (
                <div style={{
                  width: 14, height: 14, border: '2px solid rgba(0,0,0,0.2)',
                  borderTopColor: '#000', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
              )}
              {fixing ? 'Installing...' : 'Auto-fix'}
            </button>
          )}
          <button
            onClick={onContinue}
            disabled={!canContinue && !result}
            style={{
              padding: '8px 18px', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 600,
              background: canContinue ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
              color: canContinue ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              cursor: canContinue ? 'pointer' : result ? 'pointer' : 'not-allowed',
              opacity: !canContinue && !result ? 0.5 : 1,
            }}
          >
            {canContinue ? 'Continue to Dashboard' : result ? 'Continue Anyway' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
