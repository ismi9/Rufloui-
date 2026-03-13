# RuFloUI Roadmap

## Performance

### Import claude-flow as JS library (eliminate CLI overhead)
Currently every backend operation spawns a child process via `node node_modules/@claude-flow/cli/bin/cli.js`. Each call has ~2.5s overhead from Node startup + module loading. Importing `@claude-flow/cli` (or its internal modules) directly as a JS library would eliminate this overhead entirely, bringing CLI-dependent endpoints (agents, swarm status, memory) from ~2.5s to <50ms.

**Impact**: ~50x speedup on all CLI-backed endpoints (agents, swarm, memory, hive-mind, neural, hooks, workflows, config, performance).

**Approach**:
- Identify the internal API surface of `@claude-flow/cli` (likely in `dist/` or `src/`)
- Replace `execCli()` calls with direct function imports where possible
- Keep `execCli()` as fallback for commands that require process isolation (e.g. `claude -p` for agent execution)
