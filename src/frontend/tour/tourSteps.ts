import type { DriveStep, Side, Alignment } from 'driver.js'

export interface TourStep extends DriveStep {
  route?: string
}

function step(
  element: string,
  title: string,
  description: string,
  opts?: { side?: Side; align?: Alignment; route?: string },
): TourStep {
  return {
    element,
    route: opts?.route,
    popover: {
      title,
      description,
      side: opts?.side ?? 'bottom',
      align: opts?.align ?? 'start',
    },
  }
}

export function buildTourSteps(): TourStep[] {
  return [
    // Welcome
    {
      popover: {
        title: 'Welcome to RuFloUI!',
        description:
          'This quick tour will show you how to launch your first multi-agent swarm, assign a task, and monitor agents in real time. You can skip at any time.',
        side: 'over' as Side,
        align: 'center',
      },
    },

    // Dashboard overview
    step(
      '[data-tour="stat-agents"]',
      'Dashboard Overview',
      'The dashboard gives you a quick snapshot: active agents, running tasks, memory entries, and system health. Everything updates in real time via WebSocket.',
      { side: 'bottom', route: '/' },
    ),

    // Navigate to Swarm
    step(
      '[data-tour="nav-swarm"]',
      'Swarm Management',
      'This is where it all starts. Click Swarm to initialize your multi-agent swarm.',
      { side: 'right' },
    ),

    // Swarm topology selector
    step(
      '[data-tour="swarm-topology"]',
      'Choose a Topology',
      'Pick how your agents connect to each other:\n\n' +
        '• Hierarchical — tree structure with a coordinator at the top\n' +
        '• Mesh — every agent talks to every other agent\n' +
        '• Star — one central agent, all others connect to it\n' +
        '• Ring — agents pass work in a circle',
      { side: 'right', route: '/swarm' },
    ),

    // Swarm init button
    step(
      '[data-tour="swarm-init"]',
      'Initialize the Swarm',
      'Once you\'ve picked your topology and strategy, click Initialize to spin up the swarm. Agents will be created and connected.',
      { side: 'bottom' },
    ),

    // Topology view
    step(
      '[data-tour="swarm-topology-view"]',
      'Topology View',
      'After initialization you\'ll see the agent hierarchy here, with colored status dots and animated connection lines.',
      { side: 'top' },
    ),

    // Navigate to Agents
    step(
      '[data-tour="nav-agents"]',
      'Spawn Agents',
      'Go to Agents to manually spawn additional agents. Choose from types like coder, researcher, tester, reviewer, architect, and more.',
      { side: 'right' },
    ),

    // Navigate to Tasks
    step(
      '[data-tour="nav-tasks"]',
      'Create Tasks',
      'Now the fun part. Go to Tasks to create work for your swarm.',
      { side: 'right' },
    ),

    // Task create button
    step(
      '[data-tour="task-create"]',
      'Create a Task',
      'Click Create Task, give it a title and description (e.g. "Write a REST API for user management with tests"), then click Create.',
      { side: 'bottom', route: '/tasks' },
    ),

    // Task assign
    step(
      '[data-tour="task-board"]',
      'Assign to Swarm',
      'Once created, your task appears on the Kanban board. Click "Assign to Swarm" on the task card — the multi-agent pipeline kicks in: a coordinator plans subtasks, specialist agents execute them in parallel waves.',
      { side: 'top' },
    ),

    // Navigate to Swarm Monitor
    step(
      '[data-tour="nav-swarm-monitor"]',
      'Watch It Live',
      'Switch to Swarm Monitor to see your agents working in real time. This is where the magic happens.',
      { side: 'right' },
    ),

    // Agent cards
    step(
      '[data-tour="monitor-agents"]',
      'Agent Cards',
      'Each card shows an agent\'s type, status, and task count. Working agents glow orange. Click any card to expand it and see detailed output — what tool it\'s using, what file it\'s editing, its full execution log.',
      { side: 'top', route: '/swarm-monitor' },
    ),

    // Monitor status click
    step(
      '[data-tour="monitor-status"]',
      'Agent Details',
      'Click the status badge on any agent to see its live output stream, current action, and performance metrics. You can track exactly what each agent is doing at any moment.',
      { side: 'bottom' },
    ),

    // Navigate to Workflows
    step(
      '[data-tour="nav-workflows"]',
      'Workflows',
      'For multi-step processes, use Workflows. Create a sequence of steps that agents execute in order — great for CI/CD-like pipelines or complex multi-phase tasks.',
      { side: 'right' },
    ),

    // Navigate to Performance
    step(
      '[data-tour="nav-performance"]',
      'Performance Monitoring',
      'Track benchmarks, latency, throughput, and bottlenecks. Run benchmarks to measure your swarm\'s performance over time.',
      { side: 'right' },
    ),

    // Navigate to Config
    step(
      '[data-tour="nav-config"]',
      'Configuration',
      'Tune your swarm settings here: agent concurrency, topology, memory backend, and more. Export/import configs to share setups.',
      { side: 'right' },
    ),

    // Restart tour hint
    step(
      '[data-tour="header-tour"]',
      'Restart Tour',
      'You can restart this tour at any time by clicking the tour button in the top right.',
      { side: 'bottom', align: 'end' },
    ),

    // Finish
    {
      popover: {
        title: 'You\'re all set!',
        description:
          'You now know the basics: initialize a swarm, spawn agents, create tasks, and monitor everything live. Start building something amazing!',
        side: 'over' as Side,
        align: 'center',
      },
    },
  ]
}
