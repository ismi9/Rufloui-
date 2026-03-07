import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  title?: string
  children: ReactNode
  className?: string
  actions?: ReactNode
}

const styles = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  } as CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,

  title: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
  } as CSSProperties,

  body: {
    padding: 20,
  } as CSSProperties,
}

export function Card({ title, children, actions }: CardProps) {
  const hasHeader = title || actions

  return (
    <div style={styles.card}>
      {hasHeader && (
        <div style={styles.header}>
          {title && <span style={styles.title}>{title}</span>}
          {actions && <div>{actions}</div>}
        </div>
      )}
      <div style={styles.body}>{children}</div>
    </div>
  )
}
