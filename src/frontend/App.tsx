import React, { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { createWebSocket, api } from '@/api'
import { useStore } from '@/store'
import type { SwarmAgent } from '@/types'
import SetupWizard from './pages/SetupWizard'
import { TourProvider } from './tour/TourContext'

const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const SwarmPanel = React.lazy(() => import('./pages/SwarmPanel'))
const AgentsPanel = React.lazy(() => import('./pages/AgentsPanel'))
const TasksPanel = React.lazy(() => import('./pages/TasksPanel'))
const MemoryPanel = React.lazy(() => import('./pages/MemoryPanel'))
const SessionsPanel = React.lazy(() => import('./pages/SessionsPanel'))
const HiveMindPanel = React.lazy(() => import('./pages/HiveMindPanel'))
const NeuralPanel = React.lazy(() => import('./pages/NeuralPanel'))
const PerformancePanel = React.lazy(() => import('./pages/PerformancePanel'))
const HooksPanel = React.lazy(() => import('./pages/HooksPanel'))
const WorkflowsPanel = React.lazy(() => import('./pages/WorkflowsPanel'))
const ConfigPanel = React.lazy(() => import('./pages/ConfigPanel'))
const LogsPanel = React.lazy(() => import('./pages/LogsPanel'))
const AgentVizPanel = React.lazy(() => import('./pages/AgentVizPanel'))
const SwarmMonitorPanel = React.lazy(() => import('./pages/SwarmMonitorPanel'))

function LoadingSpinner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: '3px solid var(--border)',
          borderTopColor: 'var(--accent-blue)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
    </div>
  )
}

export function App() {
  const wsRef = useRef<WebSocket | null>(null)
  const store = useStore()

  // Preflight wizard — skip if already passed this session
  const [preflightPassed, setPreflightPassed] = useState(() => {
    return sessionStorage.getItem('ruflo-preflight-passed') === 'true'
  })

  const handlePreflightContinue = useCallback(() => {
    sessionStorage.setItem('ruflo-preflight-passed', 'true')
    setPreflightPassed(true)
  }, [])

  useEffect(() => {
    // Auto-check preflight on first load — if all OK, skip wizard
    if (preflightPassed) return
    api.system.preflight()
      .then(result => {
        if (result.status === 'ok') {
          handlePreflightContinue()
        }
      })
      .catch(() => { /* backend not ready, show wizard */ })
  }, [preflightPassed, handlePreflightContinue])

  // Shared function to fetch core data — used on startup and after WS reconnection
  const refreshCoreData = useCallback(async () => {
    const s = useStore.getState()
    try {
      const [health, tasks, agents, workflows, sessions] = await Promise.allSettled([
        api.system.health(),
        api.tasks.list(),
        api.agents.list(),
        api.workflows.list(),
        api.sessions.list(),
      ])
      if (health.status === 'fulfilled') s.setSystemHealth(health.value as Parameters<typeof s.setSystemHealth>[0])
      if (tasks.status === 'fulfilled') {
        const tv = tasks.value as unknown
        const tArr = Array.isArray(tv) ? tv : ((tv as Record<string, unknown>)?.tasks ?? [])
        s.setTasks(tArr as Parameters<typeof s.setTasks>[0])
      }
      if (agents.status === 'fulfilled') {
        const av = agents.value as unknown
        const aArr = Array.isArray(av) ? av : ((av as Record<string, unknown>)?.agents ?? [])
        s.setAgents(aArr as Parameters<typeof s.setAgents>[0])
      }
      if (workflows.status === 'fulfilled') {
        const wv = workflows.value as unknown
        const wArr = Array.isArray(wv) ? wv : ((wv as Record<string, unknown>)?.workflows ?? [])
        s.setWorkflows(wArr as Parameters<typeof s.setWorkflows>[0])
      }
      if (sessions.status === 'fulfilled') {
        const sv = sessions.value as unknown
        const sArr = Array.isArray(sv) ? sv : ((sv as Record<string, unknown>)?.sessions ?? [])
        s.setSessions(sArr as Parameters<typeof s.setSessions>[0])
      }
      s.setInitialLoaded()
      s.setBackendReachable(true)
    } catch { /* backend not ready yet */ }
  }, [])

  // WebSocket with automatic reconnection (exponential backoff)
  useEffect(() => {
    if (!preflightPassed) return

    let retryCount = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let intentionalClose = false
    const MAX_RETRIES = 50
    const BASE_DELAY = 1000
    const MAX_DELAY = 30000

    function handleMessage(msg: { type: string; payload: unknown }) {
      const { type, payload } = msg
      const s = useStore.getState()

      switch (type) {
        case 'system:health':
          s.setSystemHealth(payload as Parameters<typeof s.setSystemHealth>[0])
          break
        case 'swarm:status':
          s.setSwarm(payload as Parameters<typeof s.setSwarm>[0])
          break
        case 'agent:list':
          s.setAgents(payload as Parameters<typeof s.setAgents>[0])
          break
        case 'agent:added':
          s.addAgent(payload as Parameters<typeof s.addAgent>[0])
          break
        case 'agent:updated': {
          const agentUpdate = payload as { id: string } & Record<string, unknown>
          s.updateAgent(agentUpdate.id, agentUpdate)
          break
        }
        case 'agent:removed':
          s.removeAgent((payload as { id: string }).id)
          break
        case 'task:list':
          s.setTasks(payload as Parameters<typeof s.setTasks>[0])
          break
        case 'task:added':
          s.addTask(payload as Parameters<typeof s.addTask>[0])
          break
        case 'task:updated': {
          const taskUpdate = payload as { id: string } & Record<string, unknown>
          s.updateTask(taskUpdate.id, taskUpdate)
          break
        }
        case 'memory:entries':
          s.setMemoryEntries(payload as Parameters<typeof s.setMemoryEntries>[0])
          break
        case 'memory:stats':
          s.setMemoryStats(payload as Parameters<typeof s.setMemoryStats>[0])
          break
        case 'session:list':
          s.setSessions(payload as Parameters<typeof s.setSessions>[0])
          break
        case 'session:active':
          s.setActiveSession(payload as Parameters<typeof s.setActiveSession>[0])
          break
        case 'hivemind:status':
          s.setHiveMind(payload as Parameters<typeof s.setHiveMind>[0])
          break
        case 'neural:status':
          s.setNeural(payload as Parameters<typeof s.setNeural>[0])
          break
        case 'performance:metrics':
          s.setPerformance(payload as Parameters<typeof s.setPerformance>[0])
          break
        case 'hooks:list':
          s.setHooks(payload as Parameters<typeof s.setHooks>[0])
          break
        case 'workflow:list':
          s.setWorkflows(payload as Parameters<typeof s.setWorkflows>[0])
          break
        case 'coordination:metrics':
          s.setCoordination(payload as Parameters<typeof s.setCoordination>[0])
          break
        case 'viz:update': {
          const vizPayload = payload as { sessionId: string; tree: Parameters<typeof s.updateVizSession>[1] }
          s.updateVizSession(vizPayload.sessionId, vizPayload.tree)
          break
        }
        case 'swarm-monitor:update':
          s.setSwarmMonitor(payload as Parameters<typeof s.setSwarmMonitor>[0])
          break
        case 'agent:activity':
          if (s.swarmMonitor) {
            const act = payload as { agentId: string; status: string; currentTask?: string; currentAction?: string }
            const updatedAgents = s.swarmMonitor.agents.map(a =>
              a.id === act.agentId
                ? { ...a, status: act.status as SwarmAgent['status'], currentTask: act.currentTask, currentAction: act.currentAction }
                : a
            )
            s.setSwarmMonitor({ ...s.swarmMonitor, agents: updatedAgents })
          }
          break
        case 'log':
          s.addLog(payload as Parameters<typeof s.addLog>[0])
          break
        default:
          console.warn('Unknown WS message type:', type)
      }
    }

    function connect() {
      const ws = createWebSocket(handleMessage)

      ws.onopen = () => {
        const s = useStore.getState()
        s.setConnected(true)
        s.setWsStatus('connected')
        if (retryCount > 0) {
          s.addLog({ level: 'info', message: `WebSocket reconnected after ${retryCount} attempt(s)`, source: 'system' })
          // Re-fetch data after reconnection to sync state
          refreshCoreData()
        } else {
          s.addLog({ level: 'info', message: 'WebSocket connected to backend', source: 'system' })
        }
        retryCount = 0
      }

      ws.onclose = () => {
        const s = useStore.getState()
        s.setConnected(false)
        wsRef.current = null

        if (intentionalClose) return

        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY)
          retryCount++
          s.setWsStatus('reconnecting')
          s.addLog({
            level: 'warn',
            message: `WebSocket disconnected. Reconnecting in ${(delay / 1000).toFixed(0)}s (attempt ${retryCount}/${MAX_RETRIES})...`,
            source: 'system',
          })
          retryTimer = setTimeout(connect, delay)
        } else {
          s.setWsStatus('disconnected')
          s.addLog({ level: 'error', message: 'WebSocket connection lost. Reload the page to retry.', source: 'system' })
        }
      }

      ws.onerror = () => {
        // onclose will fire after this, so just let it handle reconnection
      }

      wsRef.current = ws
    }

    connect()

    return () => {
      intentionalClose = true
      if (retryTimer) clearTimeout(retryTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [preflightPassed, refreshCoreData])

  // Fetch core data on startup
  useEffect(() => {
    if (!preflightPassed) return
    refreshCoreData()
  }, [preflightPassed, refreshCoreData])

  // Health polling — every 30s, ping backend to detect silent disconnects
  useEffect(() => {
    if (!preflightPassed) return

    let failCount = 0
    const HEALTH_INTERVAL = 30_000
    const FAIL_THRESHOLD = 3

    const checkHealth = async () => {
      try {
        await api.system.health()
        failCount = 0
        const s = useStore.getState()
        if (!s.backendReachable) {
          s.setBackendReachable(true)
          s.addLog({ level: 'info', message: 'Backend is reachable again', source: 'health' })
        }
      } catch {
        failCount++
        if (failCount >= FAIL_THRESHOLD) {
          const s = useStore.getState()
          if (s.backendReachable) {
            s.setBackendReachable(false)
            s.addLog({ level: 'error', message: `Backend unreachable (${failCount} consecutive failures)`, source: 'health' })
          }
        }
      }
    }

    // Initial check
    checkHealth()
    const interval = setInterval(checkHealth, HEALTH_INTERVAL)
    return () => clearInterval(interval)
  }, [preflightPassed])

  if (!preflightPassed) {
    return <SetupWizard onContinue={handlePreflightContinue} />
  }

  return (
    <TourProvider>
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route
          path="swarm"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <SwarmPanel />
            </Suspense>
          }
        />
        <Route
          path="agents"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AgentsPanel />
            </Suspense>
          }
        />
        <Route
          path="tasks"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <TasksPanel />
            </Suspense>
          }
        />
        <Route
          path="memory"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <MemoryPanel />
            </Suspense>
          }
        />
        <Route
          path="sessions"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <SessionsPanel />
            </Suspense>
          }
        />
        <Route
          path="hive-mind"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <HiveMindPanel />
            </Suspense>
          }
        />
        <Route
          path="neural"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <NeuralPanel />
            </Suspense>
          }
        />
        <Route
          path="performance"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <PerformancePanel />
            </Suspense>
          }
        />
        <Route
          path="hooks"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <HooksPanel />
            </Suspense>
          }
        />
        <Route
          path="workflows"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <WorkflowsPanel />
            </Suspense>
          }
        />
        <Route
          path="config"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <ConfigPanel />
            </Suspense>
          }
        />
        <Route
          path="agent-viz"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AgentVizPanel />
            </Suspense>
          }
        />
        <Route
          path="swarm-monitor"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <SwarmMonitorPanel />
            </Suspense>
          }
        />
        <Route
          path="logs"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <LogsPanel />
            </Suspense>
          }
        />
      </Route>
    </Routes>
    </TourProvider>
  )
}
