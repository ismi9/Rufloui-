import { useRef, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTour } from '@/tour/TourContext'
import {
  LayoutDashboard,
  Network,
  Bot,
  ListTodo,
  Database,
  Save,
  Brain,
  Cpu,
  Activity,
  Settings,
  Workflow,
  Terminal,
  Gauge,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Radio,
  Webhook,
} from 'lucide-react'
import { useStore } from '@/store'
import type { ComponentType } from 'react'
import { useState } from 'react'

interface NavItem {
  label: string
  to: string
  icon: ComponentType<{ size?: number }>
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Orchestration',
    items: [
      { label: 'Swarm', to: '/swarm', icon: Network },
      { label: 'Agents', to: '/agents', icon: Bot },
      // Agent Viz disabled — only useful for direct claude spawns with session IDs
      // and subagent hierarchies. Revisit once it can integrate with swarm tasks.
      // { label: 'Agent Viz', to: '/agent-viz', icon: GitBranch },
      { label: 'Swarm Monitor', to: '/swarm-monitor', icon: Radio },
      { label: 'Tasks', to: '/tasks', icon: ListTodo },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { label: 'Hive Mind', to: '/hive-mind', icon: Brain },
      { label: 'Neural', to: '/neural', icon: Cpu },
      { label: 'Memory', to: '/memory', icon: Database },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Workflows', to: '/workflows', icon: Workflow },
      { label: 'Hooks', to: '/hooks', icon: Terminal },
      { label: 'Sessions', to: '/sessions', icon: Save },
      { label: 'Webhooks', to: '/webhooks', icon: Webhook },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      { label: 'Performance', to: '/performance', icon: Gauge },
      { label: 'Config', to: '/config', icon: Settings },
      { label: 'Logs', to: '/logs', icon: Activity },
    ],
  },
]

const styles = {
  wrapper: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  } as React.CSSProperties,

  sidebar: {
    width: 'var(--sidebar-width)',
    minWidth: 'var(--sidebar-width)',
    height: '100vh',
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } as React.CSSProperties,

  logo: {
    padding: '20px 24px',
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: 'var(--accent-blue)',
    textShadow: '0 0 20px rgba(59, 130, 246, 0.5), 0 0 40px rgba(59, 130, 246, 0.2)',
    borderBottom: '1px solid var(--border)',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  } as React.CSSProperties,

  nav: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 0',
  } as React.CSSProperties,

  groupTitle: {
    padding: '16px 24px 6px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
  } as React.CSSProperties,

  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '9px 24px',
    color: 'var(--accent-blue)',
    textDecoration: 'none',
    fontSize: 14,
    transition: 'all var(--transition)',
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
  } as React.CSSProperties,

  navLinkActive: {
    color: 'var(--text-primary)',
    background: 'var(--bg-hover)',
    borderLeftColor: 'var(--accent-blue)',
  } as React.CSSProperties,

  navLinkHover: {
    color: 'var(--text-primary)',
    background: 'var(--bg-hover)',
  } as React.CSSProperties,

  rightSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } as React.CSSProperties,

  header: {
    height: 'var(--header-height)',
    minHeight: 'var(--header-height)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  } as React.CSSProperties,

  headerTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text-primary)',
  } as React.CSSProperties,

  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: 'var(--text-secondary)',
  } as React.CSSProperties,

  statusDot: (status: 'connected' | 'reconnecting' | 'disconnected') => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: status === 'connected' ? 'var(--accent-green)'
      : status === 'reconnecting' ? 'var(--accent-yellow)'
      : 'var(--accent-red)',
    boxShadow: status === 'connected' ? 'var(--glow-green)'
      : status === 'reconnecting' ? '0 0 20px rgba(245, 158, 11, 0.3)'
      : 'var(--glow-red)',
    animation: status === 'connected' ? undefined : 'pulse-glow 2s ease-in-out infinite',
  }) as React.CSSProperties,

  main: {
    flex: 1,
    overflow: 'auto',
    padding: 24,
  } as React.CSSProperties,

  activityPanel: {
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: 'height 0.2s ease',
  } as React.CSSProperties,

  activityHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 24px',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  } as React.CSSProperties,

  activityBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 24px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  } as React.CSSProperties,

  logEntry: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 12,
    padding: '4px 8px',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-primary)',
  } as React.CSSProperties,
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  info: 'var(--accent-blue)',
  warn: 'var(--accent-yellow)',
  error: 'var(--accent-red)',
  debug: 'var(--text-muted)',
}

export function Layout() {
  const connected = useStore((s) => s.connected)
  const wsStatus = useStore((s) => s.wsStatus)
  const backendReachable = useStore((s) => s.backendReachable)
  const logs = useStore((s) => s.logs)
  const { startTour } = useTour()
  const [activityOpen, setActivityOpen] = useState(false)
  const activityRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activityRef.current && activityOpen) {
      activityRef.current.scrollTop = 0
    }
  }, [logs, activityOpen])

  const recentLogs = logs.slice(0, 30)

  return (
    <div style={styles.wrapper}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>RuFloUI <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', letterSpacing: 0 }}>v0.3.45</span></div>
        <nav style={styles.nav}>
          {navGroups.map((group) => (
            <div key={group.title}>
              <div style={styles.groupTitle}>{group.title}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  data-tour={`nav-${item.to === '/' ? 'dashboard' : item.to.slice(1)}`}
                  style={({ isActive }) => ({
                    ...styles.navLink,
                    ...(isActive ? styles.navLinkActive : {}),
                  })}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget
                    if (!el.classList.contains('active')) {
                      Object.assign(el.style, { color: 'var(--text-primary)', background: 'var(--bg-hover)' })
                    }
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget
                    if (!el.classList.contains('active')) {
                      Object.assign(el.style, { color: '', background: '' })
                    }
                  }}
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div style={styles.rightSection}>
        <header style={styles.header}>
          <span style={styles.headerTitle}>RuFloUI Dashboard</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              data-tour="header-tour"
              onClick={startTour}
              style={{
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '4px 10px',
                fontSize: 12,
                color: 'var(--accent-blue)',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Tour
            </button>
            <div style={styles.connectionStatus}>
              <div style={styles.statusDot(connected ? 'connected' : wsStatus === 'reconnecting' ? 'reconnecting' : 'disconnected')} />
              {connected ? 'Connected' : wsStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
              {connected && !backendReachable && (
                <span style={{ color: 'var(--accent-yellow)', fontSize: 11, marginLeft: 4 }}>(API slow)</span>
              )}
            </div>
          </div>
        </header>

        {/* Reconnection / disconnection banner */}
        {wsStatus === 'reconnecting' && (
          <div style={{
            padding: '6px 24px', background: 'rgba(245,158,11,0.12)',
            borderBottom: '1px solid rgba(245,158,11,0.3)', display: 'flex',
            alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--accent-yellow)',
          }}>
            <div style={{
              width: 14, height: 14, border: '2px solid var(--accent-yellow)',
              borderTopColor: 'transparent', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', flexShrink: 0,
            }} />
            Backend connection lost. Attempting to reconnect...
          </div>
        )}
        {!backendReachable && connected && (
          <div style={{
            padding: '6px 24px', background: 'rgba(245,158,11,0.08)',
            borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex',
            alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--accent-yellow)',
          }}>
            Backend API is not responding. Some actions may fail.
          </div>
        )}
        {wsStatus === 'disconnected' && !connected && (
          <div style={{
            padding: '6px 24px', background: 'rgba(239,68,68,0.12)',
            borderBottom: '1px solid rgba(239,68,68,0.3)', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: 'var(--accent-red)',
          }}>
            <span>Connection lost. Real-time updates are paused.</span>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '3px 12px', borderRadius: 'var(--radius)', fontSize: 12,
                background: 'var(--accent-red)', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        )}

        <main style={styles.main}>
          <Outlet context={{ backendReachable, connected }} />
        </main>

        {/* Global Activity Panel - visible on all pages */}
        <div style={{ ...styles.activityPanel, height: activityOpen ? 180 : 36 }}>
          <div style={styles.activityHeader} onClick={() => setActivityOpen(!activityOpen)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} color="var(--accent-blue)" />
              <span>Recent Activity</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                ({logs.length} entries)
              </span>
            </div>
            {activityOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>
          {activityOpen && (
            <div ref={activityRef} style={styles.activityBody}>
              {recentLogs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 12 }}>
                  No activity yet
                </div>
              ) : (
                recentLogs.map((log) => (
                  <div key={log.id} style={styles.logEntry}>
                    <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'monospace' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span style={{
                      color: LOG_LEVEL_COLORS[log.level] ?? 'var(--text-muted)',
                      fontWeight: 600, textTransform: 'uppercase', width: 44, flexShrink: 0, fontSize: 11,
                    }}>
                      {log.level}
                    </span>
                    <span style={{ color: 'var(--accent-cyan)', flexShrink: 0 }}>[{log.source}]</span>
                    <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
