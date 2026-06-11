# Lenga Maps — Executive Agent Team

Production-grade operating manuals / system prompts for the four AI agents that function as
Lenga Maps' senior leadership and technical team, supporting Mulenga Chilufya
(Founder, CEO & CTO). The agents increase leverage and decision quality; they do not
replace the Founder.

## The team

| # | Agent | File | Domain |
|---|-------|------|--------|
| — | Shared Operating Framework | [00-shared-operating-framework.md](00-shared-operating-framework.md) | Company context, Founder Challenge Protocol, Leverage Rule, epistemic standards, escalation levels, inter-agent collaboration — **binding for all agents** |
| 1 | CEO Senior Advisor (**ADVISOR**) | [01-ceo-senior-advisor.md](01-ceo-senior-advisor.md) | Strategy, market & competitive intelligence, pricing, opportunity/risk assessment, fundraising readiness, founder focus |
| 2 | CMO & Client Acquisition Director (**CMO**) | [02-cmo-client-acquisition-director.md](02-cmo-client-acquisition-director.md) | Brand, growth, LinkedIn/X/Reddit playbooks, content multiplication engine, community, B2B pipeline |
| 3 | Senior GIS Dataset Developer (**GIS-QA**) | [03-senior-gis-dataset-developer.md](03-senior-gis-dataset-developer.md) | Dataset QA/QC with rejection authority — raster/vector/cartographic gates, metadata standard, coverage audits |
| 4 | Senior Software Engineer (**ENGINEER**) | [04-senior-software-engineer.md](04-senior-software-engineer.md) | Architecture, code quality, security (RLS, webhooks, presigned URLs), reliability, testing, tech-debt management |
| — | Executive Meeting Protocol | [05-executive-meeting-protocol.md](05-executive-meeting-protocol.md) | Group meetings of all four agents: chaired flow, conflict rounds, minutes, decision log (`meetings/decision-log.md`). Run with `/exec-meeting <agenda>` in Claude Code |

## How to deploy a manual as a live agent

Each manual is a self-contained system prompt. The shared framework must accompany it.

**Claude / claude.ai Projects:** create one Project per agent; paste
`00-shared-operating-framework.md` followed by the agent's manual into the Project
instructions. Chat with that Project for that role's work.

**Claude Code (this repo):** subagent definitions live in `.claude/agents/`
(`advisor`, `cmo`, `gis-qa`, `engineer`). Each loads its manual from this directory at
start. Invoke by asking Claude Code to use the agent, e.g. *"Have the gis-qa agent
review the new hydrology outputs."*

**API / custom apps:** concatenate `00-shared-operating-framework.md` + the agent
manual as the `system` parameter.

## How the team works together

- The **Founder is the routing layer** — agents collaborate through him and through
  artifacts in this repo, using the Inter-Agent Brief format (framework §7).
- Standing flows: ADVISOR sets priorities/ICP/pricing → all; GIS-QA ships datasets →
  content briefs to CMO + data contract to ENGINEER; ENGINEER reports costs/debt →
  ADVISOR; CMO returns market signals → ADVISOR.
- Conflicts between agents are framed by the ADVISOR and decided by the Founder
  (framework §7, conflict rule).
- All agents follow the **Founder Challenge Protocol** (framework §3): they are
  required to disagree, with evidence, when the evidence warrants it.

## Maintaining the manuals

These are living documents. When a manual gives bad guidance in practice, fix the
manual in the same commit as the lesson learned. Keep company facts (pricing, stack,
datasets) current in `00-shared-operating-framework.md` §1 only — the manuals
reference it rather than duplicating it, so facts are updated in one place.
