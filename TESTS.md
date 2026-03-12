# RuFloUI Test Suite

## Quick Start

```bash
npm test              # Run all tests once
npx vitest            # Run in watch mode
npx vitest --coverage # Run with coverage report
npx vitest run src/backend   # Run only backend tests
npx vitest run src/frontend  # Run only frontend tests
```

## Test Runner

- **Vitest 2.x** with two environment modes:
  - `jsdom` (default) — for React component and browser API tests
  - `node` — for backend tests (opted-in per file via `// @vitest-environment node`)

Configuration: `vitest.config.ts`
Setup file: `src/frontend/test-setup.ts` (loads `@testing-library/jest-dom` matchers)

## Test Structure

```
src/
├── backend/__tests__/
│   ├── server-utils.test.ts         # Unit: parseCliTable, parseCliOutput, sanitizeShellArg
│   ├── server-integration.test.ts   # Integration: persistence layer, health check parsing,
│   │                                 #   time matching, env var cleanup, WebSocket broadcast logic
│   ├── e2e-workflows.test.ts        # E2E: task lifecycle, agent lifecycle, swarm lifecycle,
│   │                                 #   session lifecycle, workflow lifecycle
│   ├── webhook-github.test.ts       # Unit+Integration: GitHub webhook signature verification,
│   │                                 #   route handlers, config, auto-assign, templates
│   └── webhook-gitlab.test.ts       # Unit+Integration: GitLab webhook token validation,
│                                     #   route handlers, config, auto-assign, edge cases
└── frontend/__tests__/
    ├── store.test.ts                # Unit: Zustand store actions and selectors (agents, tasks,
    │                                 #   logs, viz sessions, swarm monitor, all setters)
    ├── api.test.ts                  # Unit: API client (all endpoint namespaces, error handling,
    │                                 #   timeout behavior)
    └── components.test.tsx          # Unit: UI components (Button, Card, StatusBadge) with
                                      #   variants, sizes, hover, disabled/loading states
```

## What Each File Covers

### Backend

| File | Level | Coverage |
|------|-------|----------|
| `server-utils.test.ts` | Unit | `parseCliTable` (8 cases: empty, headers, multi-col, ellipsis, separators, CRLF, missing cells), `parseCliOutput` (4 cases), `sanitizeShellArg` (6 cases: injection vectors) |
| `server-integration.test.ts` | Integration | Persistence save/load (6 cases: tasks, agents, workflows, .tmp recovery, atomic write, corruption), health check parsing (5 cases: pass/warn/fail/Windows), time matching (3 cases), env var cleanup (3 cases), WebSocket broadcast event classification (3 cases), sanitizeShellArg injection prevention (5 cases), parseCliTable with real CLI output patterns (3 cases) |
| `e2e-workflows.test.ts` | E2E | Task lifecycle: create-assign-complete-cancel (8 cases), Agent lifecycle: spawn-list-terminate (5 cases), Swarm lifecycle: init-status-shutdown-reinit (5 cases), Session lifecycle: save-list-restore-delete (6 cases), Workflow lifecycle: create-execute-complete (4 cases) |
| `webhook-github.test.ts` | Unit+Integration | Signature verification (9 cases), webhook receiver (4 cases), event storage/ordering (3 cases), invalid payloads (8 cases), config GET/PUT (10 cases), HMAC integration (2 cases), test endpoint (5 cases), task templates (5 cases), auto-assign failures (2 cases), event status updates (3 cases) |
| `webhook-gitlab.test.ts` | Unit+Integration | GitLab issue hooks (3 cases), disabled state (1 case), token validation (4 cases), event/repo filtering (5 cases), auto-assign (3 cases), config GET/PUT (3 cases), test endpoint (5 cases), event updates (2 cases), edge cases (4 cases) |

### Frontend

| File | Level | Coverage |
|------|-------|----------|
| `store.test.ts` | Unit | Simple setters (6 cases), agent CRUD (6 cases), task CRUD (4 cases), log management (3 cases: prepend, cap), collection setters (4 cases), viz session actions (4 cases), swarm monitor (1 case), additional setters (5 cases: memory stats, active session, hive mind, neural, performance, coordination) |
| `api.test.ts` | Unit | System endpoints (2 cases), agent endpoints (5 cases), task endpoints (8 cases), memory endpoints (2 cases), swarm endpoints (3 cases), session endpoints (4 cases), webhook endpoints (6 cases), workflow endpoints (5 cases), config endpoints (3 cases), performance endpoints (2 cases), error handling (3 cases: non-OK, JSON parse fail, timeout) |
| `components.test.tsx` | Unit | Button: render, click, disabled, loading, variants, sizes, hover behavior, custom style (12 cases). Card: children, title, actions, header presence, complex children (7 cases). StatusBadge: render, statuses, empty/null, dot element, sizes, all color mappings (8 cases) |

## Coverage Strategy

### Unit Tests
Test individual functions and components in isolation. Mock external dependencies (fetch, store, CLI). Fast and deterministic.

### Integration Tests
Test interaction between components: persistence layer (file I/O), health check parsing (regex matching on CLI output), WebSocket message format and event classification. Use real file system (temp dirs) where needed.

### E2E Tests
Simulate full user workflows through the in-memory store layer: creating a task and moving it through its lifecycle, spawning agents and managing them, initializing and shutting down swarms. These verify the logical flow without requiring the actual Express server or CLI.

## Test Dependencies

- `vitest` — test runner
- `jsdom` — browser environment for React tests
- `@testing-library/react` — React component rendering
- `@testing-library/jest-dom` — DOM assertion matchers
- `@testing-library/user-event` — user interaction simulation

All dependencies are in `devDependencies` in `package.json`.

## Adding New Tests

1. **Backend**: Add to `src/backend/__tests__/`. Use `// @vitest-environment node` at the top.
2. **Frontend**: Add to `src/frontend/__tests__/`. Default jsdom environment applies.
3. **Naming**: Use `*.test.ts` for pure logic, `*.test.tsx` for React components.
4. **Pattern**: Server utility functions are copied into test files (since importing `server.ts` starts the server). Webhook modules export testable functions directly.
