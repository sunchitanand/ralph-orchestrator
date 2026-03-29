# Ralph Wiggum Technique — Research Notes

> Last updated: 2026-03-28

## What is it?

A pattern for running AI coding agents in a loop until a task is done. The agent gets fresh context each iteration, reads specs/plan/code from disk, does work, and loops. Backpressure gates (tests, lint, typecheck) reject bad work. The filesystem is the state machine — no in-memory coordination needed.

Core principles:
- Fresh context each iteration (prevents context rot)
- Backpressure over prescription (gates reject bad work, don't prescribe how)
- Disk is state, git is memory
- The plan is disposable (regeneration is cheap)

## Timeline

| When | What |
|------|------|
| May 2025 | Geoffrey Huntley describes the technique on his blog (from a goat farm in Australia) |
| Nov-Dec 2025 | Goes viral. Ryan Carson's implementation and Twitter threads spread it |
| Jan 2026 | "Biggest name in AI." Anthropic ships official Claude Code plugin. YouTube tutorials flood in. A memecoin ($RALPH) launches on Solana |
| Jan-Mar 2026 | Ecosystem explodes — dozens of implementations, awesome-ralph list, ralph-orchestrator hits 800+ stars |

## Implementations (sorted by GitHub stars)

| Stars | Project | What it is |
|-------|---------|------------|
| ~7.8k | [frankbria/ralph-claude-code](https://github.com/frankbria/ralph-claude-code) | Claude Code-specific with intelligent exit detection |
| ~1.2k | [Th0rgal/open-ralph-wiggum](https://github.com/Th0rgal/open-ralph-wiggum) | Minimal — supports OpenCode, Claude, Codex, Copilot |
| ~809 | [mikeyobrien/ralph-orchestrator](https://github.com/mikeyobrien/ralph-orchestrator) | Most feature-rich. Rust, hat system, waves, parallel loops, TUI, web dashboard, 7 backends |
| — | [snarktank/ralph](https://github.com/snarktank/ralph) | Ryan Carson's OG bash script for Amp |
| — | [michaelshimeles/ralphy](https://github.com/michaelshimeles/ralphy) | Multi-backend bash script (Claude, Codex, OpenCode, Cursor, Qwen, Droid) |
| — | [ghuntley/how-to-ralph-wiggum](https://github.com/ghuntley/how-to-ralph-wiggum) | Geoffrey Huntley's original methodology writeup (not code) |
| — | [harrymunro/ralph-wiggum](https://github.com/harrymunro/ralph-wiggum) | Claude Code-specific |
| — | [JH427/ralph-codex](https://github.com/JH427/ralph-codex) | Spec-driven with git-enforced safety, append-only learnings |
| — | [iannuttall/ralph](https://github.com/iannuttall/ralph) | Minimal, file-based agent loop |
| — | [tzachbon/smart-ralph](https://github.com/tzachbon/smart-ralph) | Claude Code plugin combining Ralph loop with structured spec workflow |
| — | [vercel-labs/ralph-loop-agent](https://github.com/vercel-labs/ralph-loop-agent) | Vercel's take using the AI SDK |

Also: **Anthropic ships a built-in Ralph Wiggum plugin** in Claude Code itself (`claude-code/plugins/ralph-wiggum/`).

Curated list: [snwfdhmp/awesome-ralph](https://github.com/snwfdhmp/awesome-ralph)

## The spectrum

```
Simple ◄──────────────────────────────────────────────► Complex

bash while loop          multi-backend scripts          ralph-orchestrator
(snarktank/ralph)        (ralphy, open-ralph-wiggum)    (hats, waves, parallel
                                                         loops, TUI, web, merge
                                                         queue, memories, tasks)
```

Most people start with a simple bash loop and graduate to ralph-orchestrator when they need multi-agent coordination or parallelism.

## Similar techniques / related patterns

### Sisyphus Loop
Multi-agent variant. Instead of one agent looping, multiple specialized agents (planner, coder, reviewer) pass work between each other. More structured than Ralph but heavier overhead.
- [Comparison: Ralph vs Sisyphus](https://sonim1.com/en/blog/ai-agent-loops-ralph-sisyphus)

### Strands Agents SOP
AWS's agent SOP framework. Structured operating procedures for agents with defined roles. Ralph-orchestrator's hat system was partly inspired by this.
- [GitHub](https://github.com/strands-agents/agent-sop)

### ReAct (Reason + Act)
The academic predecessor. Agent reasons → acts → observes → repeats. Ralph is ReAct applied to coding with fresh context each iteration.

### Agentic Loop / Plan-Act-Observe
The general pattern Ralph popularized for coding. Now described by Oracle, Anthropic, and others as the foundational architecture for autonomous AI.

### Self-improving agents
Agents that learn from mistakes across iterations. Ralph's memory system (`memories.md`) is an implementation of this — persistent learning across sessions.
- [Addy Osmani's writeup](https://addyosmani.com/blog/self-improving-agents/)

## What makes Ralph different from generic agent loops

Earlier agent loops tried to maintain context across iterations → context rot. Ralph's key insight:

1. **Fresh context each iteration** — wipe and re-read everything
2. **Backpressure gates** — tests/lint must pass (don't prescribe how, just reject bad work)
3. **Disk as state** — filesystem is the handoff mechanism, not in-memory state
4. **The plan is disposable** — regeneration costs one planning loop

## Ralph-orchestrator specifics (what we use)

We use [our fork](https://github.com/sunchitanand/ralph-orchestrator) of ralph-orchestrator.

### Backends supported
Claude Code, Kiro, Gemini CLI, Codex, Amp, Copilot CLI, OpenCode. Can mix per-hat.

### Key features we should explore
- **Parallel loops** — multiple agents in git worktrees, auto-merge on completion
- **Waves** — intra-loop parallelism (scatter-gather), e.g. multi-perspective code review
- **PDD planning** — `ralph plan` generates specs/design/implementation plan interactively
- **RObot** — Telegram integration for human-in-the-loop steering mid-run
- **Web dashboard** — alpha, requires source tree (we fixed this with RALPH_SOURCE_ROOT)

### Our modifications
1. `fix(web): separate source root from workspace root` — allows running `ralph web` from any project with `RALPH_SOURCE_ROOT` env var
2. `feat(web): show workspace directory path in sidebar` — workspace indicator in the dashboard UI

## References

- [Original blog post — ghuntley.com/ralph](https://ghuntley.com/ralph/)
- [A Brief History of Ralph — humanlayer.dev](https://www.humanlayer.dev/blog/brief-history-of-ralph)
- [Ralph Wiggum Loop from First Principles — dreamhost.com](https://www.dreamhost.com/blog/ralph-wiggum/)
- [Inventing the Ralph Wiggum Loop — podcast with Geoffrey Huntley](https://devinterrupted.substack.com/p/inventing-the-ralph-wiggum-loop-creator)
- [Driving Ralph by Hand — what Huntley really meant](https://bryanwhiting.com/ai/driving-ralph-by-hand-what-geoff-huntley-really-sa/)
- [The Architecture of Scaled AI Coding](https://rvasa.substack.com/p/your-coding-agent-is-a-pipe-it-should)
