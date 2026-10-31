# Terminal Hosting: Requirements, Cost, and Funding

**Status: the hosted backend is offline and unfunded. The CTF track is running
on an in-browser stopgap and is fully usable.** This document records what the
backend actually needs, what it would cost, what must be fixed before it is
exposed again, and how it gets funded.

- **Operational owner:** Cyber-Minds backend on-call (see
  `docs/runbook-terminal-outage.md`)
- **Last reviewed:** 2026-10-31

---

## 1. Current state

The terminal page defaults to a browser simulation. No backend, no container,
no cost.

**Verified, not assumed:** `tests/ctf-browser-restore.spec.js` seeds a correct
solution for each of the 8 registered challenges, runs the checker, and asserts
completion. All 8 pass with no backend. It also asserts that checking a
solution sends no request to the offline backend origin, that progress survives
a reload, and that a wrong answer is still rejected.

What learners keep: all 12 courses, 85 lesson pages, and all 8 CTF challenges
end to end.

What learners lose:

| Capability | Impact |
|---|---|
| A real Linux shell | Commands are simulated. The simulation covers what the challenges need, not arbitrary commands. |
| Real tool output | `curl`, `ss`, `grep` and friends return fixture data, not live results. |
| Server-side validation | Challenge checking runs in the browser. |
| Enforced progression | Previously the server refused out-of-order completion. Progress is now localStorage only, so a determined learner can edit it. |

The last row is worth being clear about: nothing is gated behind this, there is
no certificate or credential, and the cost of someone skipping ahead is that
they skipped ahead. It is an acceptable trade for a free stopgap, but it is a
real change from the server-enforced behaviour and should not be described as
equivalent.

---

## 2. What the backend actually requires

Read from the code, not estimated. All values are in
`terminal/backend/constants.go` and `terminal/backend/session.go`.

**Per learner session:** one Docker container, `512 MB` memory
(`containerMemoryLimit`), `1` vCPU (`containerCPULimit`), up to `30` minutes
(`maxSessionTimeout`).

**Service-wide defaults:** `MAX_ACTIVE_SESSIONS=30`,
`SESSION_CREATE_RATE_LIMIT_PER_MINUTE=12` per client IP.

**Host needs:** Linux with a Docker daemon, the `terminal-base` image built
locally, one Go process, and a TLS-terminating entry point. No database, no
persistent volumes, no object storage. Sessions are ephemeral.

### Sizing — and a trap in the defaults

The ceiling is `MAX_ACTIVE_SESSIONS × 512 MB`. At the default of 30 that is
**15 GB of RAM**, which is far more than any affordable host.

There is no memory-aware admission control: `isSessionCapacityReached()` counts
sessions, it does not look at free memory. So **`MAX_ACTIVE_SESSIONS` must be
lowered to match the host, or the box will accept sessions until it OOMs.**
This is the single most important configuration step when deploying anywhere.

| Host size | Usable after OS + Docker + Go (~1 GB) | Safe `MAX_ACTIVE_SESSIONS` |
|---|---|---|
| 2 vCPU / 4 GB | ~3 GB | 5 |
| 2 vCPU / 8 GB | ~7 GB | 12 |
| 4 vCPU / 12 GB | ~11 GB | 20 |
| 4 vCPU / 24 GB | ~23 GB | 30 (the default) |

CPU oversubscribes gracefully; memory does not. Size on memory.

For a project at this stage, **2 vCPU / 4-8 GB is the realistic target.** Five
concurrent 30-minute sessions is a meaningful amount of simultaneous hands-on
use for a learner base this size, and it can be raised later.

---

## 3. Blocking: harden the sandbox before re-exposing it

**Do not restore the backend to a public address as it stands.** This is not a
hypothetical concern, and now — with nothing running — is the cheapest possible
time to fix it.

`NetworkMode: "bridge"` is the only security-relevant flag set on session
containers. There is no `CapDrop`, no `no-new-privileges`, no `PidsLimit`, no
read-only root filesystem, and the shell runs as root inside the container.
Bridge networking means **every session gets outbound internet access from the
host's IP.**

That combination on an anonymous public shell invites exactly the abuse that
gets an account terminated: outbound scanning, spam, or mining traffic
attributed to the host. On sponsor-provided infrastructure that risks the
sponsorship itself, not just the box.

The repository already demonstrates the stricter posture it should use. The
challenge test harness (`scripts/ctf-challenge-tests.sh`) runs its containers
with `--network none --memory 192m --cpus 0.5 --security-opt no-new-privileges`.
Production sessions should be at least that strict:

| Control | Now | Should be |
|---|---|---|
| Network | `bridge` (full egress) | `none`, or an egress-filtered network |
| Capabilities | default set | `CapDrop: ["ALL"]`, add back only what is needed |
| Privilege escalation | allowed | `SecurityOpt: ["no-new-privileges"]` |
| Process count | unlimited | `PidsLimit` (fork-bomb protection) |
| Filesystem | writable root | read-only root + a writable `/workspace` |
| User | root | unprivileged user |

Worth checking during that work: no challenge currently needs outbound
internet. `web-recon` targets an nginx running *inside* the session container,
so `--network none` is likely to work unchanged — but verify per challenge
rather than assuming.

Treat this as a prerequisite for restoration, not a follow-up.

---

## 4. Hosting options

Vendor terms in this space move quickly, and two assumptions I started with
turned out to be stale within the last few months. **Verify current terms on
the vendor's own page before committing — do not trust the figures below, or
any blog post, including recent ones.**

### Free, sustainable

**Oracle Cloud Always Free (Ampere A1 ARM)** — the strongest $0 candidate.
Historically 4 OCPU / 24 GB; multiple sources report this was **halved to 2
OCPU / 12 GB around 15 June 2026**, apparently via a documentation change
rather than an announcement, with current figures given as 1,500 OCPU-hours and
9,000 GB-hours per month. Even halved, 2 OCPU / 12 GB comfortably exceeds the
2 vCPU / 4-8 GB target.

Caveats that matter: ARM64, so the `terminal-base` image must build for
`arm64`; free capacity is region-dependent and instances are not always
creatable; and accounts that exceed the allowance risk instance deletion.
Confirm against Oracle's own Always Free page before planning around it.

**GitHub Codespaces / self-hosted on an existing machine** — viable if the org
already has a machine with spare capacity and a stable address. Zero marginal
cost, but it moves the availability risk onto someone's hardware.

### Paid, low cost

**Hetzner Cloud** is the usual price leader; a 2 vCPU / 4 GB shared instance
has been in the €4-5/month range. Pricing changed on 15 June 2026 and the CX
line was reshuffled (reports of `CX22` being replaced by `CX23`, and `CPX11`
withdrawn in Europe), and the trackers disagree with each other. Check
hetzner.com/cloud directly.

At roughly €4-6/month, the annual cost is on the order of **€50-70**. That is
the number to put in front of a sponsor — small enough that a single modest
sponsor or a handful of recurring donors covers it.

### Credits (time-limited — bridges, not solutions)

These end, so treat them as runway while a sustainable source is arranged, and
diary the expiry.

- **Azure for Students** — $100 credit, no credit card required for verified
  students 18+. The most dependable student option currently.
- **AWS** — Activate is startup-oriented; there is a nonprofit credit program
  and open-source credits for project hosting, but eligibility and amounts were
  not verifiable in this research. Approach directly.
- **DigitalOcean** — previously $200 via the GitHub Student Developer Pack.
  Multiple sources report DigitalOcean **left the pack, ending 31 July 2026**.
  Older pages advertising it are stale.

**GitHub Student Developer Pack** remains the best single place to check what
is currently on offer, since its contents change: education.github.com/pack.

### Recommendation

1. **Now:** stay on the browser stopgap. It is verified, it costs nothing, and
   it delivers the full CTF track.
2. **Next:** harden the sandbox (§3). This is required regardless of host and
   can proceed without any funding decision.
3. **Then:** attempt Oracle Always Free. If an instance is obtainable, it meets
   the requirement at $0 and no sponsor is needed for compute.
4. **If that fails:** seek sponsorship for a ~€5/month Hetzner instance, using
   `docs/SPONSORSHIP-REQUEST.md`.
5. **Only then:** provision. Per the project constraint, do not commit to paid
   infrastructure before a funding source is confirmed.

---

## 5. Restoration checklist

Nothing here should be marked done from a dashboard. Each line is observable.

1. Sandbox hardening (§3) merged and the challenge suite passing against it.
2. Host provisioned; `terminal-base` builds on that architecture.
3. `MAX_ACTIVE_SESSIONS` set from the table in §2 for the chosen host size.
4. `ALLOWED_ORIGINS` set to the GitHub Pages origin; confirm a request from an
   unapproved origin is refused.
5. TLS terminating in front of the backend; confirm no plaintext listener is
   reachable.
6. `TERMINAL_HEALTH_URL` repository variable set, and `health-probe.yml`
   reporting `ok` three consecutive times (`docs/runbook-terminal-outage.md` §5).
7. Point the terminal page back at the live backend, then run the full CTF
   workflow against it — all 8 challenges, not a spot check.
8. Keep the browser simulation as the automatic fallback. It is now a tested
   degradation path and should not be deleted when the backend returns.

## 6. Recovery plan

**If the backend goes down again:** the page falls back to the browser
simulation, which is a usable product rather than an error page. There is no
longer an emergency. Follow `docs/runbook-terminal-outage.md` for triage.

**If funding lapses:** decommission the host and stay on the simulation. Do not
let an unpaid invoice decide the shutdown date. The simulation is the steady
state the project can always afford, and everything above it is an upgrade.
