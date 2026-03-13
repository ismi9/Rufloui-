# Changelog

All notable changes to RuFloUI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.3.45] - 2026-03-13

### Added

- **Hive Mind Shared Memory Integration** — Multi-agent pipeline now reads/writes shared knowledge via hive-mind memory namespace
  - Phase 1 (Planning): Coordinator loads previous task results as context for better planning
  - Phase 2 (Execution): Each subtask result stored to hive-mind namespace automatically
  - Phase 3 (Completion): Final task result persisted for future task context
  - Shared Memory UI shows all entries with auto-refresh and loading spinner
- **Setup Wizard Auto-fix** — One-click button to install missing dependencies (claude-flow CLI, etc.)
- **Local CLI execution** — claude-flow CLI invoked via local `node_modules` binary instead of `npx` (~50x faster, ~2.5s vs 23-90s per call)

### Fixed

- **Hive Mind memory storage** — Fixed shell argument parsing that caused values to be truncated or stored in wrong namespace; now uses `execFileAsync` without shell for reliable storage
- **Pipeline memory writes** — Added `await` to all `storeHiveMindMemory()` calls to prevent fire-and-forget race conditions
- **Shared Memory UI** — Fixed key truncation in table format by switching to JSON-based key listing; entries now display with full content
- **Windows Stop hook** — Fixed `cmd /c` path parsing issue that broke the auto-memory sync hook
- **Tic Tac Toe cleanup** — Removed accidentally-added game files and nav entry

### Changed

- **Hive Mind Shared Memory panel** — Auto-refreshes on page load, Refresh button shows loading spinner, values truncated to 200 chars with vertical key-value layout
- **Preflight checks** — Now distinguishes local vs npx CLI installation with appropriate warnings

## [0.3.2] - 2026-03-12

### Changed

- **Port configuration** — Backend moved from 3001 to **28580**, frontend from 5173 to **28588**, daemon from 3002 to **28581**
- Avoids conflicts with reserved port ranges on Windows (Hyper-V, Docker, antivirus)
- All documentation, CORS config, WebSocket connections, and Vite proxy updated accordingly

### Fixed

- **Workflow cancel** — Now properly updates local store, kills running processes, and cancels linked tasks
- **Task cancel** — Now kills running `claude -p` processes and cancels linked workflows
- **Workflow delete** — Removes from local store even when CLI fails

## [0.3.1] - 2026-03-11

### Added

- **GitHub Webhook Integration** — Receive GitHub issue events and auto-create swarm tasks
  - Webhook endpoint `POST /api/webhooks/github` with HMAC-SHA256 signature validation
  - Dashboard UI (Webhooks page) with config editor, webhook URL, and event history
  - Auto-creates high-priority tasks from new/reopened issues
  - Auto-assigns to active swarm pipeline (researcher, coder, tester, reviewer)
  - Configurable task instruction templates with `{{title}}`, `{{body}}`, `{{url}}`, `{{author}}`, `{{labels}}`, `{{repo}}`, `{{number}}` placeholders
  - Body deduplication: when template includes `{{body}}`, body is not repeated in the header
  - Event status tracking (received, processing, completed, failed) with real-time WebSocket updates
  - "Send Test" button to simulate webhook events from the dashboard
  - Config persisted to `.ruflo/github-webhook.json`
  - Fallback to environment variables when no dashboard config
  - 56 unit tests covering all webhook features

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
