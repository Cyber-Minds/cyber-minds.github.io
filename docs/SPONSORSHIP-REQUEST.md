# Sponsorship Request: Hands-On Lab Infrastructure

A short, reusable brief for cloud providers, education and nonprofit credit
programs, and cybersecurity industry sponsors.

> **Before sending:** this document contains no credentials, no infrastructure
> hostnames, no learner data, and no session contents, and it must stay that
> way. Nothing a sponsor needs requires any of those. Fill in the bracketed
> contact fields, delete this note, and send.

---

## The ask

**Either ~€60/year of compute, or an equivalent credit grant, to run one small
Linux VM.**

One instance, 2 vCPU and 4-8 GB RAM, Docker-capable. No database, no storage
tier, no managed services, no egress of consequence. A single VM is the whole
request.

We are equally glad to receive this as a recurring sponsorship, a one-off
credit grant, or a donated always-free instance.

---

## Who we are

CyberMinds is a free, open-source cybersecurity education project. Everything
we publish is public and stays public: **12 courses, 85 lesson pages, and 8
hands-on Capture-the-Flag challenges.** There is no paywall, no subscription,
and no learner account to sell. The site is static and hosted free on GitHub
Pages.

Repository: https://github.com/Cyber-Minds/cyber-minds.github.io

## What the money is for

Everything we do is free except one thing: the CTF track gives each learner a
real, isolated Linux shell in the browser. That needs a server, and a server is
the only recurring cost the project has.

Each learner session is one sandboxed container — 512 MB of memory, 1 vCPU, and
a 30-minute cap. The instance we are asking for supports several of those at
once, which is sufficient for our current learner base and can scale later if
the project grows.

## Current status, stated plainly

The backend is **offline**, because we could not sustain the hosting cost.

We did not leave learners staring at an error. The terminal now runs a
simulation in the browser, and all 8 challenges remain completable start to
finish — this is verified by an automated test that solves every challenge on
every commit, not by hand-checking. Courses and lessons were never affected.

So this is not an emergency request, and we are not asking anyone to rescue a
broken site. It is a request to restore the part of the experience a simulation
cannot honestly reproduce: a real shell, real tool output, and the experience of
working in an environment that can surprise you.

## Why it matters to learners

Cybersecurity is not a subject you can learn only by reading. The difference
between recognising a brute-force pattern in a slide and finding it yourself in
a log file with `grep` and `awk` is the difference between recall and skill.

Our challenges cover log analysis, privilege-escalation tracing, incident
timeline reconstruction, beaconing detection, phishing header analysis, and AWS
IAM least-privilege review — all framed as defensive triage, all on synthetic
data. For many of our learners this is their first time in a terminal at all,
and the fact that it is free and needs no install is the reason they try it.

## Security and operational controls

We take hosting someone else's compute seriously, and we would rather state our
posture precisely than reassure vaguely.

**In place:**

- Every session runs in an isolated container with hard memory and CPU limits
  and an enforced 30-minute lifetime.
- Session capacity limits and per-IP rate limiting on session creation.
- Origin allowlisting on both HTTP and WebSocket connections.
- Security headers and a Content Security Policy on the terminal page.
- Third-party browser assets pinned by exact version with Subresource Integrity
  hashes, checked on every commit and verified weekly against the CDN.
- No learner accounts, so there are no credentials to breach. Sessions are
  ephemeral and hold no personal data. Terminal input and output are never
  logged.
- All challenge data is synthetic. No real credentials, no customer data, and
  no live targets appear anywhere in the exercises.

**Committed before we accept and use an instance:**

We have an open hardening task, and we will complete it *before* exposing a
sponsored host publicly: dropping container capabilities, disabling privilege
escalation, limiting process counts, a read-only root filesystem, running as an
unprivileged user, and removing outbound network access from session containers
(our exercises do not need it).

We are telling you about this rather than waiting to be asked, because the
realistic risk to a sponsor is not that our site breaks — it is that someone
abuses a free shell to send traffic from your IP space. Removing egress and
dropping privileges is how that is prevented, and it will be done first.

## What a sponsor gets

- Named as an infrastructure sponsor in the repository and on the site, if you
  would like to be. We are just as happy to receive support anonymously.
- A short written update on learner usage whenever you would like one, in
  aggregate numbers only.
- No obligations, no exclusivity, and no commitment beyond the period you
  choose. If you stop, we return to the browser simulation and nothing breaks.

## Contact

[Name] — [role], CyberMinds
[email]
https://github.com/Cyber-Minds/cyber-minds.github.io

---

### Notes for whoever sends this

- Tailor the opening line per recipient; everything else can stay as-is.
- For credit programs, lead with the €60/year figure. It is small enough that
  it often falls inside a standard education or open-source allocation without
  needing a case to be argued.
- For industry sponsors, lead with the learner impact section instead.
- Keep the "current status" section honest. The stopgap working is a point in
  the project's favour, not something to hide.
- Do not attach logs, screenshots of sessions, or infrastructure diagrams with
  real hostnames. Nothing in a sponsorship conversation needs them.
