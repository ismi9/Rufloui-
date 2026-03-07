import type { CSSProperties } from 'react'

interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
}

const colorMap: Record<string, string> = {
  active: 'var(--accent-green)',
  running: 'var(--accent-green)',
  healthy: 'var(--accent-green)',
  idle: 'var(--accent-blue)',
  pending: 'var(--accent-blue)',
  saved: 'var(--accent-blue)',
  error: 'var(--accent-red)',
  failed: 'var(--accent-red)',
  unhealthy: 'var(--accent-red)',
  completed: 'var(--accent-cyan)',
  paused: 'var(--accent-yellow)',
  draft: 'var(--accent-yellow)',
}

function getColor(status: string): string {
  return colorMap[(status || '').toLowerCase()] || 'var(--text-muted)'
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const safeStatus = status || 'unknown'
  const color = getColor(safeStatus)
  const dotSize = size === 'sm' ? 6 : 8
  const fontSize = size === 'sm' ? 12 : 13

  const containerStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: size === 'sm' ? 5 : 6,
  }

  const dotStyle: CSSProperties = {
    width: dotSize,
    height: dotSize,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }

  const labelStyle: CSSProperties = {
    fontSize,
    color: 'var(--text-secondary)',
    textTransform: 'capitalize',
    lineHeight: 1,
  }

  return (
    <span style={containerStyle}>
      <span style={dotStyle} />
      <span style={labelStyle}>{safeStatus}</span>
    </span>
  )
}
