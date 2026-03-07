import type { CSSProperties, ReactNode, MouseEvent } from 'react'

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  children: ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  loading?: boolean
  style?: CSSProperties
}

const baseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontWeight: 500,
  borderRadius: 'var(--radius)',
  transition: 'all var(--transition)',
  cursor: 'pointer',
  border: 'none',
  whiteSpace: 'nowrap',
  lineHeight: 1,
}

const variantStyles: Record<string, CSSProperties> = {
  primary: {
    background: 'var(--accent-blue)',
    color: '#fff',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
  },
  danger: {
    background: 'var(--accent-red)',
    color: '#fff',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
  },
}

const sizeStyles: Record<string, CSSProperties> = {
  sm: {
    padding: '6px 12px',
    fontSize: 12,
  },
  md: {
    padding: '8px 16px',
    fontSize: 13,
  },
}

const disabledStyle: CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
}

const spinnerStyle: CSSProperties = {
  width: 14,
  height: 14,
  border: '2px solid rgba(255,255,255,0.3)',
  borderTopColor: '#fff',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  disabled = false,
  loading = false,
  style: customStyle,
}: ButtonProps) {
  const isDisabled = disabled || loading

  const style: CSSProperties = {
    ...baseStyle,
    ...variantStyles[variant],
    ...sizeStyles[size],
    ...(isDisabled ? disabledStyle : {}),
    ...customStyle,
  }

  return (
    <button
      style={style}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.opacity = '0.85'
        }
      }}
      onMouseLeave={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.opacity = '1'
        }
      }}
    >
      {loading && <span style={spinnerStyle} />}
      {children}
    </button>
  )
}
