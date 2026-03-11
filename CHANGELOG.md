# Changelog

All notable changes to RuFloUI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-03-11

### Added

- **Telegram Bot Integration** — Remote monitoring and control via Telegram polling bot
  - 10 commands: `/start`, `/status`, `/agents`, `/tasks`, `/task`, `/workflows`, `/swarm`, `/run`, `/cancel`, `/help`
  - Inline keyboard buttons on status (Agents/Tasks/Swarm), task lists (Refresh), and task detail (Cancel)
  - Configurable notifications: task completed/failed, swarm init/shutdown, agent error, task progress
  - Task progress updates throttled to 1 message per 30 seconds per task
  - `/run <description>` creates and auto-assigns tasks to the swarm from Telegram
  - `/cancel <id>` cancels running tasks from Telegram
  - `/start` open to all users for chat ID discovery during setup
  - Chat ID authorization — only the configured chat can execute commands
  - Bot token stored with restricted file permissions (0600)
  - Dashboard UI (Config > Telegram Bot) with enable toggle, token/chatId fields, Save & Connect, and Send Test
  - Notification toggles in the dashboard for per-type control
  - Activity log with incoming/outgoing message history (last 50 entries, polled every 10s)
  - Auto-reconnect with exponential backoff (up to 5 attempts) on polling failures
  - Configuration persisted to `.ruflo/telegram.json` (survives restarts without env vars)
  - Zero overhead when disabled — returns null, no polling, no connections

### Dependencies

- Added `node-telegram-bot-api` (runtime)
- Added `@types/node-telegram-bot-api` (dev)

## [0.2.0] - 2026-03-10

### Added

- **Dashboard** — System health overview with agent counts, task summary, and health checks
- **Swarm Management** — Initialize/shutdown swarms with topology selection (hierarchical, mesh, star, ring)
- **Swarm Monitor** — Real-time agent status cards with status-colored backgrounds, working glow animation, and live output modal
- **Agent Visualization** — Tree view of agent hierarchies from JSONL session logs with real-time updates
- **Agent Management** — Spawn, list, and terminate agents with type selection
- **Task Board** — Kanban-style board (Pending, In Progress, Completed, Failed) with live output streaming
- **Task Continuation** — Follow-up on completed/failed tasks with automatic context injection from previous results
- **Output History** — All task output persisted to `.ruflo/outputs/` and viewable across reloads
- **Multi-Agent Pipeline** — Coordinator plans with `--max-turns 1`, workers execute in dependency waves with role-specific system prompts
- **Hive Mind** — Consensus protocols, broadcast messaging, join/leave, shared memory
- **Workflows** — Create, execute, pause, resume, and cancel multi-step workflows
- **Memory Store** — Key-value storage with namespace support, search, and TTL
- **Neural Network** — Training, optimization, compression, and pattern monitoring
- **Performance** — Benchmarking, metrics, bottleneck analysis, and latency/throughput charts
- **Sessions** — Save and restore orchestration state
- **Hooks** — Hook listing, initialization, and metrics
- **Configuration** — Runtime config with get/set/reset and import/export
- **State Persistence** — Backend state persisted to `.ruflo/state.json` with debounced writes, atomic saves, and crash recovery
- **Frontend Persistence** — Zustand store backed by sessionStorage for instant page reload recovery
- **WebSocket** — Real-time updates with exponential backoff reconnection (up to 50 retries)
- **Health Polling** — Background health checks every 30s with disconnection banners
- **Preflight Wizard** — Startup checks for Node.js, npx, claude-flow CLI, Claude Code CLI, persistence directory, and daemon
- **Zombie Reaper** — Automatic cleanup of stale Claude processes after 5 minutes of inactivity
- **Activity Panel** — Global log panel at the bottom of every page

### Architecture

- React 19 + Vite 6 + TypeScript frontend
- Express + WebSocket backend wrapping claude-flow CLI
- Zustand for state management with persist middleware
- JSONL monitoring for agent visualization
- Dark theme with CSS variables
