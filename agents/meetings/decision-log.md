# Lenga Maps — Decision Log

Append-only, newest first. One line per decision:
`YYYY-MM-DD | D{n} | {decision} | rationale: {…} | dissent: {member: reason | none} | revisit: {date/trigger}`

---

2026-06-12 | D8 | QA after major commits; non-AI-looking frontend with real photography in Lenga navy/gold; GIS-informed UI elements (CRS badges, duplicate-pull warnings, reprojection tips) | rationale: brand trust with a technical audience | dissent: none | revisit: first paying team's feedback
2026-06-12 | D7 | Org owner (master account) manages members, hard-capped at subscribed seats (DB trigger + API) | rationale: self-serve seat management without billing exposure | dissent: none | revisit: if granular roles requested
2026-06-12 | D6 | Founder's enterprise account (sole subscriber) migrates to team structure, 1 seat | rationale: clean retirement of legacy tier | dissent: none | revisit: n/a
2026-06-12 | D5 | Entitlement via new plan='team' + organizations/members tables; admin org view shows company per member; org-level promo-email opt-in | rationale: visibility + future team marketing | dissent: none | revisit: if multi-org membership needed
2026-06-12 | D4 | Ship sell+deliver phases immediately in sequenced commits, QA after each, no approval gates | rationale: founder time-boxed overnight execution | dissent: ADVISOR had recommended gating workspace on first committed team — overruled by Founder | revisit: if workspace sees no use by first 3 teams
2026-06-12 | D3 | API access becomes team-tier exclusive with rate limiting; REMOVED from individual Max | rationale: API is the team differentiator vs 3×Max arbitrage; 0 keys minted so nobody breaks | dissent: none | revisit: if Max churn cites API loss
2026-06-12 | D2 | Team pricing locked: $45/seat flat; bundles $115/3 seats (instead of $135) and $430/10 seats (instead of $450), $20 discount each; $45/seat shown only on Custom block | rationale: simpler than volume curve, saving visible, custom pays full freight | dissent: none | revisit: after first 5 quotes
2026-06-12 | D1 | Agent deployment: all four agents + meetings live in Claude Code (repo); CMO additionally mirrored as a claude.ai Project for mobile content work; no second "non-tech advisor" | rationale: repo is where all-domain context converges; splitting the Advisor recreates silos | dissent: none | revisit: if a non-repo workstream (e.g. active fundraise) develops its own context base
