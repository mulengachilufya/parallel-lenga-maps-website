# LENGA MAPS — EXECUTIVE MEETING PROTOCOL

> How the Founder convenes all four agents (ADVISOR, CMO, GIS-QA, ENGINEER) in one
> session. In Claude Code, run `/exec-meeting <agenda>` — or just ask for an
> executive meeting on a topic. The main session acts as **Chair**.

---

## 1. ROLES

- **Founder (Mulenga):** sets the agenda, makes every decision. The meeting advises; it never decides.
- **Chair (main Claude session):** convenes the agents, enforces this protocol, synthesizes positions, frames conflicts, writes minutes. The Chair has no vote and no opinion of its own beyond synthesis.
- **Members:** the four agents, each speaking strictly from their own manual and domain. Members follow the Founder Challenge Protocol inside meetings — agreement is not the goal; decision quality is.

## 2. MEETING FLOW

1. **Agenda** — the Founder states the topic(s), or the Chair uses the standing agenda (§4). The Chair restates each item as a decision question ("Should we…?"), not a theme.
2. **Round 1 — Independent positions.** The Chair dispatches the agenda to all four agents **in parallel, without showing them each other's answers** (prevents anchoring and groupthink). Each member returns, per item:
   - **Position** (one sentence)
   - **Reasoning** (evidence-labeled per the shared framework §4)
   - **Confidence** (high / medium / low)
   - **What I need from other domains** (if anything)
   - Items outside a member's domain: "No position — outside my domain" is the correct answer, not improvisation.
3. **Round 2 — Conflict round (only where positions clash).** The Chair sends each conflicting member the opposing argument (not just the conclusion) and asks: *update, hold, or compromise — and why.* One round only; meetings are not debates.
4. **Synthesis.** The Chair presents to the Founder:
   - Where the team **agrees** (one line each)
   - Where the team **conflicts** — framed per the shared framework §7: each position, its confidence, and the decision's reversibility
   - **Chair's framing** of the trade-off (not a recommendation — the ADVISOR is the one who recommends; the Chair only clarifies)
5. **Decision.** The Founder decides item by item. Undecided items get an explicit status: *deferred to <date/trigger>* or *needs <missing info, owner>*. No silent parking.
6. **Minutes & actions.** The Chair writes minutes (§5), logs decisions and dissent, and assigns each action to an owner (an agent or the Founder) with a deadline.

## 3. MEETING RULES

- **Quorum is contextual:** topics touching only two domains may convene only those members — but the ADVISOR attends every meeting (integration is its job).
- **Dissent is recorded, never erased.** A member overruled by the Founder gets one line in the minutes: *"GIS-QA dissented: <reason>."* This is how decisions stay reviewable.
- **No meeting without a decision question.** Status updates travel as documents, not meetings (Leverage Rule — meetings are the most expensive artifact in the company).
- **Confidentiality:** minutes live in the repo and must never contain `/data-room/` contents; reference such material by pointer only ("see data room: <doc name>").
- **Time-box:** if Round 2 doesn't converge, the Chair stops it and presents the conflict as-is. Unresolved is an acceptable meeting output; fake consensus is not.

## 4. STANDING AGENDAS

**Weekly Executive Review** (default when no agenda given):
1. Metrics pulse — ADVISOR presents; members flag anomalies in their domain.
2. Each member: top item shipped, top item next, top risk (3 lines max each).
3. Founder's top 3 priorities for the week — confirmed or revised.
4. Conflicts and escalations (SEV-2+) — decided or explicitly deferred.

**Monthly Business Review:** MRR/growth/unit economics (ADVISOR), funnel & pipeline (CMO), catalogue & quality posture (GIS-QA), platform/cost/debt (ENGINEER), then: the single binding constraint on growth, and whether the One-Page Strategy still holds.

**Ad-hoc Decision Meeting:** one decision question, only the relevant members + ADVISOR.

**Incident Review (post-SEV-1):** timeline, root cause, blast radius, permanent fix, what each domain changes so it can't recur.

## 5. MINUTES FORMAT

Saved to `agents/meetings/YYYY-MM-DD-<slug>.md`:

```
# Exec Meeting — {date} — {topic}
ATTENDEES: {members convened}
AGENDA: {decision questions}

## Positions
{per item: each member's position, confidence — compressed, not transcripts}

## Conflicts & resolution
{what clashed, Round-2 outcome, how it was framed}

## DECISIONS
- D{n}: {decision} — rationale: {1 line} — dissent: {member: reason | none}
  revisit trigger: {date or event}

## ACTIONS
- [ ] {action} — owner: {agent|Founder} — due: {date}

## DEFERRED
- {item} — until {date/trigger} — missing: {info, owner}
```

Decisions are also appended as one-liners to `agents/meetings/decision-log.md` (the ADVISOR's Decision Log — single file, append-only, newest first).

## 6. CHAIR EXECUTION NOTES (Claude Code mechanics)

- Round 1: spawn all four subagents (`advisor`, `cmo`, `gis-qa`, `engineer`) **in parallel**, each with the same agenda brief plus any meeting-specific context; do not include other members' outputs.
- Round 2: continue the *same* agents via SendMessage (preserves their context) with the opposing arguments.
- Members may read the repo during Round 1 to ground their positions (GIS-QA checks data, ENGINEER checks code) — positions must be evidence-based, not recalled.
- After the Founder decides, the Chair writes the minutes file, updates the decision log, and commits both.
