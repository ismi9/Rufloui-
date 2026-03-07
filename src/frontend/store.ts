import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  Agent, SwarmState, Task, MemoryEntry, MemoryStats,
  Session, HiveMindState, SystemHealth, NeuralStatus,
  PerformanceMetrics, HookConfig, WorkflowDef, CoordinationMetrics,
  VizSession, SwarmMonitorState
} from './types'

interface AppState {
  // System
  systemHealth: SystemHealth | null
  connected: boolean
  wsStatus: 'connected' | 'reconnecting' | 'disconnected'
  backendReachable: boolean  // true if HTTP health check passes

  // Swarm
  swarm: SwarmState | null
  agents: Agent[]

  // Tasks
  tasks: Task[]

  // Memory
  memoryEntries: MemoryEntry[]
  memoryStats: MemoryStats | null

  // Sessions
  sessions: Session[]
  activeSession: Session | null

  // Hive Mind
  hiveMind: HiveMindState | null

  // Neural
  neural: NeuralStatus | null

  // Performance
  performance: PerformanceMetrics | null

  // Hooks
  hooks: HookConfig[]

  // Workflows
  workflows: WorkflowDef[]

  // Coordination
  coordination: CoordinationMetrics | null

  // Viz
  vizSessions: VizSession[]
  selectedVizNode: string | null

  // Swarm Monitor
  swarmMonitor: SwarmMonitorState | null

  // Logs
  logs: Array<{ id: string; timestamp: string; level: string; message: string; source: string }>

  // Data loaded flag — prevents redundant fetches
  _initialLoaded: boolean

  // Actions
  setSystemHealth: (h: SystemHealth) => void
  setConnected: (c: boolean) => void
  setWsStatus: (s: 'connected' | 'reconnecting' | 'disconnected') => void
  setBackendReachable: (r: boolean) => void
  setSwarm: (s: SwarmState | null) => void
  setAgents: (a: Agent[]) => void
  addAgent: (a: Agent) => void
  updateAgent: (id: string, updates: Partial<Agent>) => void
  removeAgent: (id: string) => void
  setTasks: (t: Task[]) => void
  addTask: (t: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  setMemoryEntries: (m: MemoryEntry[]) => void
  setMemoryStats: (s: MemoryStats) => void
  setSessions: (s: Session[]) => void
  setActiveSession: (s: Session | null) => void
  setHiveMind: (h: HiveMindState) => void
  setNeural: (n: NeuralStatus) => void
  setPerformance: (p: PerformanceMetrics) => void
  setHooks: (h: HookConfig[]) => void
  setWorkflows: (w: WorkflowDef[]) => void
  setCoordination: (c: CoordinationMetrics) => void
  setVizSessions: (v: VizSession[]) => void
  updateVizSession: (sessionId: string, tree: VizSession['tree']) => void
  setSelectedVizNode: (id: string | null) => void
  setSwarmMonitor: (s: SwarmMonitorState | null) => void
  addLog: (log: { level: string; message: string; source: string }) => void
  setInitialLoaded: () => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      systemHealth: null,
      connected: false,
      wsStatus: 'disconnected' as const,
      backendReachable: false,
      swarm: null,
      agents: [],
      tasks: [],
      memoryEntries: [],
      memoryStats: null,
      sessions: [],
      activeSession: null,
      hiveMind: null,
      neural: null,
      performance: null,
      hooks: [],
      workflows: [],
      coordination: null,
      vizSessions: [],
      selectedVizNode: null,
      swarmMonitor: null,
      logs: [],
      _initialLoaded: false,

      setSystemHealth: (h) => set({ systemHealth: h }),
      setConnected: (c) => set({ connected: c }),
      setWsStatus: (s) => set({ wsStatus: s }),
      setBackendReachable: (r) => set({ backendReachable: r }),
      setSwarm: (s) => set({ swarm: s }),
      setAgents: (a) => set({ agents: a }),
      addAgent: (a) => set((s) => ({ agents: [...s.agents, a] })),
      updateAgent: (id, updates) => set((s) => ({
        agents: s.agents.map((a) => a.id === id ? { ...a, ...updates } : a)
      })),
      removeAgent: (id) => set((s) => ({ agents: s.agents.filter((a) => a.id !== id) })),
      setTasks: (t) => set({ tasks: t }),
      addTask: (t) => set((s) => ({ tasks: [...s.tasks, t] })),
      updateTask: (id, updates) => set((s) => ({
        tasks: s.tasks.map((t) => t.id === id ? { ...t, ...updates } : t)
      })),
      setMemoryEntries: (m) => set({ memoryEntries: m }),
      setMemoryStats: (s) => set({ memoryStats: s }),
      setSessions: (s) => set({ sessions: s }),
      setActiveSession: (s) => set({ activeSession: s }),
      setHiveMind: (h) => set({ hiveMind: h }),
      setNeural: (n) => set({ neural: n }),
      setPerformance: (p) => set({ performance: p }),
      setHooks: (h) => set({ hooks: h }),
      setWorkflows: (w) => set({ workflows: w }),
      setCoordination: (c) => set({ coordination: c }),
      setVizSessions: (v) => set({ vizSessions: v }),
      updateVizSession: (sessionId, tree) => set((s) => ({
        vizSessions: s.vizSessions.some(v => v.sessionId === sessionId)
          ? s.vizSessions.map(v => v.sessionId === sessionId ? { ...v, tree } : v)
          : [...s.vizSessions, { sessionId, taskId: tree.taskId || '', tree, startedAt: new Date().toISOString() }]
      })),
      setSelectedVizNode: (id) => set({ selectedVizNode: id }),
      setSwarmMonitor: (s) => set({ swarmMonitor: s }),
      addLog: (log) => set((s) => ({
        logs: [{ ...log, id: crypto.randomUUID(), timestamp: new Date().toISOString() }, ...s.logs].slice(0, 500)
      })),
      setInitialLoaded: () => set({ _initialLoaded: true }),
    }),
    {
      name: 'ruflo-store',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist data state, not transient flags or functions
      partialize: (state) => ({
        systemHealth: state.systemHealth,
        swarm: state.swarm,
        agents: state.agents,
        tasks: state.tasks,
        memoryEntries: state.memoryEntries,
        memoryStats: state.memoryStats,
        sessions: state.sessions,
        activeSession: state.activeSession,
        hiveMind: state.hiveMind,
        neural: state.neural,
        performance: state.performance,
        hooks: state.hooks,
        workflows: state.workflows,
        coordination: state.coordination,
        vizSessions: state.vizSessions,
        swarmMonitor: state.swarmMonitor,
        logs: state.logs.slice(0, 100), // Keep last 100 logs only in storage
        _initialLoaded: state._initialLoaded,
      }),
    }
  )
)
