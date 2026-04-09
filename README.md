# @honza-kubat/oc-dev

OpenCode plugin with custom skills, agents, and commands.

## Install

Add to your `opencode.json`:

```json
{
  "plugin": ["@honza-kubat/oc-dev"]
}
```

Or install manually:

```bash
npm install @honza-kubat/oc-dev
```

## Setup

After installing the plugin, copy the agents, commands, and skills into your project:

```bash
cp -r node_modules/@honza-kubat/oc-dev/agents/* .opencode/agents/
cp -r node_modules/@honza-kubat/oc-dev/commands/* .opencode/commands/
cp -r node_modules/@honza-kubat/oc-dev/skills/* .opencode/skills/
```

## Skills

| Skill | Description |
|-------|-------------|
| `git-workflow` | Conventional commits, branch naming, PR templates |
| `code-review` | Security, performance, maintainability review |
| `project-setup` | Bootstrap projects with consistent tooling |

## Agents

| Agent | Mode | Description |
|-------|------|-------------|
| `reviewer` | subagent | Code review with security and quality checks |
| `debugger` | subagent | Investigates errors and traces root causes |
| `tech-writer` | subagent | Creates and maintains documentation |

## Commands

| Command | Description |
|---------|-------------|
| `/review` | Review current uncommitted changes |
| `/commit [message]` | Create a conventional commit |
| `/debug <issue>` | Analyze and explain a bug |
| `/document <target>` | Generate documentation |

## Development

```bash
bun install
bun run build
bun run typecheck
```

## License

MIT
