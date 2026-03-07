import fs from 'fs'
import path from 'path'
import os from 'os'

export interface SessionNode {
  id: string
  sessionId: string
  agentId?: string
  slug?: string
  agentType?: string
  status: 'active' | 'idle' | 'done' | 'error'
  currentTool?: string
  currentFile?: string
  lastActivity?: string
  taskId?: string
  children: SessionNode[]
}

export interface MonitoredSession {
  sessionId: string
  taskId: string
  tree: SessionNode
  startedAt: string
}

interface FileState {
  path: string
  bytesRead: number
  watcher: fs.StatWatcher | null
}

interface Monitor {
  sessionId: string
  taskId: string
  tree: SessionNode
  files: Map<string, FileState>
  subagentDir: string
  subagentDirWatcher: fs.StatWatcher | null
  broadcastFn: (type: string, payload: unknown) => void
  startedAt: string
}

const monitors = new Map<string, Monitor>()

function getProjectSlug(): string {
  const cwd = process.cwd()
  // On Windows: C:\GitHub\rufloui → C--GitHub-rufloui
  // On Unix: /home/user/project → -home-user-project
  const normalized = cwd.replace(/\\/g, '/')
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/)
  if (match) {
    const drive = match[1]
    const rest = match[2].replace(/\//g, '-')
    return `${drive}--${rest}`
  }
  return normalized.replace(/\//g, '-').replace(/^-/, '')
}

function getSessionDir(): string {
  const homeDir = os.homedir()
  const slug = getProjectSlug()
  return path.join(homeDir, '.claude', 'projects', slug)
}

function parseNewLines(buffer: string): object[] {
  const lines = buffer.split('\n').filter(Boolean)
  const parsed: object[] = []
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line))
    } catch { /* skip malformed lines */ }
  }
  return parsed
}

function extractFileFromInput(input: Record<string, unknown>): string | undefined {
  if (typeof input.file_path === 'string') return input.file_path
  if (typeof input.path === 'string') return input.path
  if (typeof input.command === 'string') {
    // Try to extract file path from command
    const m = (input.command as string).match(/["']?([A-Za-z]:\\[^\s"']+|\/[^\s"']+\.\w+)["']?/)
    if (m) return m[1]
  }
  if (typeof input.pattern === 'string') return input.pattern
  return undefined
}

function processEvents(events: object[], node: SessionNode): string[] {
  const newAgentIds: string[] = []

  for (const evt of events) {
    const e = evt as Record<string, unknown>
    const timestamp = (e.timestamp as string) || new Date().toISOString()

    // Extract slug if present
    if (e.slug && typeof e.slug === 'string') {
      node.slug = e.slug
    }

    if (e.type === 'assistant') {
      const msg = e.message as Record<string, unknown> | undefined
      if (!msg?.content) continue
      const content = msg.content as Array<Record<string, unknown>>
      for (const block of content) {
        if (block.type === 'tool_use') {
          node.status = 'active'
          node.currentTool = block.name as string
          node.lastActivity = timestamp
          if (block.input && typeof block.input === 'object') {
            const file = extractFileFromInput(block.input as Record<string, unknown>)
            if (file) node.currentFile = file
          }
          // Detect Agent subagent spawn
          if (block.name === 'Agent') {
            const input = block.input as Record<string, unknown>
            if (input.subagent_type) {
              node.currentTool = `Agent(${input.subagent_type})`
            }
          }
        } else if (block.type === 'text') {
          node.status = 'active'
          node.lastActivity = timestamp
        }
      }
      // Check stop_reason
      const stopReason = (msg.stop_reason as string) || ''
      if (stopReason === 'end_turn') {
        node.status = 'idle'
      }
    } else if (e.type === 'user') {
      const msg = e.message as Record<string, unknown> | undefined
      if (!msg?.content) continue
      const content = msg.content as Array<Record<string, unknown>>
      for (const block of content) {
        if (block.type === 'tool_result') {
          node.lastActivity = timestamp
        }
      }
    } else if (e.type === 'result') {
      node.status = 'done'
      node.currentTool = undefined
      node.currentFile = undefined
      node.lastActivity = timestamp
    }

    // Check for toolUseResult with agentId (subagent completed)
    if (e.toolUseResult && typeof e.toolUseResult === 'object') {
      const tur = e.toolUseResult as Record<string, unknown>
      if (tur.agentId && typeof tur.agentId === 'string') {
        newAgentIds.push(tur.agentId)
      }
    }
  }

  return newAgentIds
}

function tailRead(fileState: FileState): string {
  try {
    const stat = fs.statSync(fileState.path)
    if (stat.size <= fileState.bytesRead) return ''
    const fd = fs.openSync(fileState.path, 'r')
    const len = stat.size - fileState.bytesRead
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, fileState.bytesRead)
    fs.closeSync(fd)
    fileState.bytesRead = stat.size
    return buf.toString('utf-8')
  } catch {
    return ''
  }
}

function startFileWatch(monitor: Monitor, filePath: string, node: SessionNode) {
  if (monitor.files.has(filePath)) return
  if (!fs.existsSync(filePath)) return

  const fileState: FileState = { path: filePath, bytesRead: 0, watcher: null }
  monitor.files.set(filePath, fileState)

  // Initial read
  const initial = tailRead(fileState)
  if (initial) {
    const events = parseNewLines(initial)
    const newAgentIds = processEvents(events, node)
    for (const agentId of newAgentIds) {
      addSubagent(monitor, node, agentId)
    }
    monitor.broadcastFn('viz:update', { sessionId: monitor.sessionId, tree: monitor.tree })
  }

  // Poll with fs.watchFile (reliable on Windows)
  fileState.watcher = fs.watchFile(filePath, { interval: 1000 }, () => {
    const newData = tailRead(fileState)
    if (!newData) return
    const events = parseNewLines(newData)
    const newAgentIds = processEvents(events, node)
    for (const agentId of newAgentIds) {
      addSubagent(monitor, node, agentId)
    }
    monitor.broadcastFn('viz:update', { sessionId: monitor.sessionId, tree: monitor.tree })
  })
}

function addSubagent(monitor: Monitor, parentNode: SessionNode, agentId: string) {
  // Check if already tracked
  if (parentNode.children.some(c => c.agentId === agentId)) return

  // Find subagent JSONL — try various naming patterns
  const patterns = [
    `agent-a${agentId}.jsonl`,
    `agent-${agentId}.jsonl`,
  ]
  let subagentPath: string | undefined
  for (const p of patterns) {
    const candidate = path.join(monitor.subagentDir, p)
    if (fs.existsSync(candidate)) {
      subagentPath = candidate
      break
    }
  }

  const childNode: SessionNode = {
    id: agentId,
    sessionId: monitor.sessionId,
    agentId,
    status: subagentPath ? 'active' : 'idle',
    taskId: monitor.taskId,
    children: [],
  }
  parentNode.children.push(childNode)

  if (subagentPath) {
    startFileWatch(monitor, subagentPath, childNode)
  }
}

function scanSubagentDir(monitor: Monitor) {
  if (!fs.existsSync(monitor.subagentDir)) return
  try {
    const files = fs.readdirSync(monitor.subagentDir)
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      // Extract agentId from filename like agent-a<id>.jsonl or agent-<id>.jsonl
      const m = file.match(/^agent-a?(.+)\.jsonl$/)
      if (!m) continue
      const agentId = m[1]
      // Check if already tracked in tree
      const alreadyTracked = monitor.tree.children.some(c => {
        const cId = c.agentId || ''
        return cId === agentId || cId === `a${agentId}` || `a${cId}` === agentId
      })
      if (!alreadyTracked) {
        const fullAgentId = file.replace('agent-', '').replace('.jsonl', '')
        const childNode: SessionNode = {
          id: fullAgentId,
          sessionId: monitor.sessionId,
          agentId: fullAgentId,
          status: 'active',
          taskId: monitor.taskId,
          children: [],
        }
        monitor.tree.children.push(childNode)
        startFileWatch(monitor, path.join(monitor.subagentDir, file), childNode)
      }
    }
  } catch { /* dir may not exist yet */ }
}

export function startMonitoring(
  sessionId: string,
  taskId: string,
  broadcastFn: (type: string, payload: unknown) => void
): void {
  if (monitors.has(sessionId)) return

  const sessionDir = getSessionDir()
  const jsonlPath = path.join(sessionDir, `${sessionId}.jsonl`)
  const subagentDir = path.join(sessionDir, sessionId, 'subagents')

  const rootNode: SessionNode = {
    id: sessionId,
    sessionId,
    status: 'active',
    taskId,
    children: [],
  }

  const monitor: Monitor = {
    sessionId,
    taskId,
    tree: rootNode,
    files: new Map(),
    subagentDir,
    subagentDirWatcher: null,
    broadcastFn,
    startedAt: new Date().toISOString(),
  }
  monitors.set(sessionId, monitor)

  // Start watching main JSONL (may not exist yet, poll until it does)
  const waitForFile = setInterval(() => {
    if (fs.existsSync(jsonlPath)) {
      clearInterval(waitForFile)
      startFileWatch(monitor, jsonlPath, rootNode)
    }
  }, 1000)

  // Also poll for subagent directory appearance
  const waitForSubagents = setInterval(() => {
    if (!monitors.has(sessionId)) {
      clearInterval(waitForSubagents)
      return
    }
    scanSubagentDir(monitor)
  }, 2000)

  // Store interval refs for cleanup
  ;(monitor as unknown as Record<string, NodeJS.Timeout>)._waitFile = waitForFile
  ;(monitor as unknown as Record<string, NodeJS.Timeout>)._waitSub = waitForSubagents

  broadcastFn('viz:update', { sessionId, tree: rootNode })
}

export function stopMonitoring(sessionId: string): void {
  const monitor = monitors.get(sessionId)
  if (!monitor) return

  // Mark tree as done
  function markDone(node: SessionNode) {
    if (node.status === 'active' || node.status === 'idle') {
      node.status = 'done'
    }
    node.children.forEach(markDone)
  }
  markDone(monitor.tree)
  monitor.broadcastFn('viz:update', { sessionId, tree: monitor.tree })

  // Clean up watchers
  for (const fs_ of monitor.files.values()) {
    if (fs_.watcher) fs.unwatchFile(fs_.path)
  }
  const m = monitor as unknown as Record<string, NodeJS.Timeout>
  if (m._waitFile) clearInterval(m._waitFile)
  if (m._waitSub) clearInterval(m._waitSub)

  monitors.delete(sessionId)
}

export function getSessionTree(sessionId: string): SessionNode | null {
  return monitors.get(sessionId)?.tree ?? null
}

export interface LogEntry {
  timestamp: string
  type: string
  tool?: string
  content: string
}

export function getNodeLogs(sessionId: string, nodeId: string, tail = 100): LogEntry[] {
  const sessionDir = getSessionDir()
  // Determine file path based on nodeId
  let filePath: string
  if (nodeId === sessionId) {
    // Root session
    filePath = path.join(sessionDir, `${sessionId}.jsonl`)
  } else {
    // Subagent — try various naming patterns
    const subDir = path.join(sessionDir, sessionId, 'subagents')
    const candidates = [
      path.join(subDir, `agent-${nodeId}.jsonl`),
      path.join(subDir, `agent-a${nodeId}.jsonl`),
    ]
    filePath = candidates.find(p => fs.existsSync(p)) || candidates[0]
  }
  // Also check active monitors for file paths
  const monitor = monitors.get(sessionId)
  if (monitor) {
    for (const [fPath] of monitor.files) {
      if (fPath.includes(nodeId)) { filePath = fPath; break }
    }
  }
  if (!fs.existsSync(filePath)) return []

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const lines = raw.split('\n').filter(Boolean)
    const entries: LogEntry[] = []
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        const ts = (obj.timestamp as string) || ''
        const type = (obj.type as string) || ''
        if (type === 'assistant') {
          const msg = obj.message as Record<string, unknown> | undefined
          if (!msg?.content) continue
          for (const block of msg.content as Array<Record<string, unknown>>) {
            if (block.type === 'tool_use') {
              const input = block.input as Record<string, unknown> | undefined
              const summary = input?.file_path || input?.command || input?.pattern || input?.query || ''
              entries.push({
                timestamp: ts, type: 'tool_use',
                tool: block.name as string,
                content: String(summary).slice(0, 200),
              })
            } else if (block.type === 'text') {
              const text = (block.text as string || '').slice(0, 300)
              if (text.trim()) {
                entries.push({ timestamp: ts, type: 'text', content: text })
              }
            }
          }
        } else if (type === 'result') {
          entries.push({ timestamp: ts, type: 'result', content: 'Session completed' })
        }
      } catch { /* skip malformed */ }
    }
    return entries.slice(-tail)
  } catch { return [] }
}

export function getAllMonitoredSessions(): MonitoredSession[] {
  return Array.from(monitors.values()).map(m => ({
    sessionId: m.sessionId,
    taskId: m.taskId,
    tree: m.tree,
    startedAt: m.startedAt,
  }))
}
