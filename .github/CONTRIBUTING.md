# Contributing to CyberMinds

Thank you for your interest in contributing to CyberMinds! We welcome contributions from everyone who wants to help make cybersecurity education more accessible.

## How Can I Contribute?

### Reporting Bugs

- Check if the bug has already been reported in [Issues](https://github.com/Cyber-Minds/CyberMinds/issues)
- If not, create a new issue with:
  - A clear, descriptive title
  - Steps to reproduce the bug
  - Expected vs actual behavior
  - Screenshots if applicable
  - Browser/OS information

### Contributing Code

- Fix bugs
- Add new features
- Improve documentation
- Enhance existing courses
- Create new course content

## Development Guidelines

- Follow existing code style and naming conventions
- Keep HTML, CSS, and JavaScript files organized by course
- Use consistent file naming: `[ContentName]course[N].[ext]`
- Test changes across different browsers before submitting

## Quality Gates (Required Before PR Merge)

- Frontend lint gate (Airbnb base):
  - Install deps: `npm ci`
  - Run lint: `npm run lint:frontend`
  - CI enforces this gate on push and pull request events.
  - Owner: Frontend lead (@ADGEEJU) maintains ESLint configuration and triages lint rule exceptions.
- Backend unit test and coverage gate:
  - Run tests: `cd terminal/backend && go test ./...`
  - CI enforces backend coverage of at least `60%`.
  - Owner: Backend lead (@vishaan2010-dotcom) maintains test health, updates fragile tests, and expands coverage for new backend features.

## Runtime Upgrade Policy (Go and Node)

Scope: Runtime versions used in CI and local development for `Go` and `Node.js`.

Cadence:

- Review and decide runtime upgrades once per quarter.
- First scheduled review date: `2026-04-15`.

Owner and backup:

- Primary owner: DevOps lead (@egeuysall)
- Backup owner: Frontend lead (@ADGEEJU)

Quarterly review checklist:

- Check latest stable and security patch releases for Go and Node.
- Check compatibility with current dependencies, CI actions, and deployment environment.
- Validate local developer workflow impact (`npm ci`, `go test ./...`, CI runtime setup).
- Stage upgrades on a branch and run full CI before merge.

Decision log expectations:

- Record each quarterly review result in the related GitHub issue with:
  - Date of review
  - Current runtime versions and proposed target versions
  - Decision (`upgrade now`, `defer`, or `patch only`)
  - Risks, blockers, and owner

Security update handling and exception path:

- Critical/high runtime security updates are out-of-band and do not wait for quarterly review.
- If immediate upgrade is blocked, open an exception issue with:
  - Risk summary and impacted services
  - Temporary mitigations
  - Target remediation date and accountable owner

## Weekly Async Status Cadence

- Source of truth: recurring GitHub issue posted every Friday at `17:00 UTC` by `github-actions[bot]`.
- Required sections in every update:
  - `Blockers`
  - `Completed Work`
  - `Next-Week Priorities`
- Team norm: ad hoc Slack status pings should be replaced by the weekly status issue unless there is an incident.
- Ownership: Maintainers are responsible for ensuring the weekly status issue is posted and updated.

## Pull Request Process

1. Fork the repository and create a new branch for your feature
2. Update documentation if needed
3. Test your changes thoroughly
4. Request review from maintainers
5. Address any feedback promptly

## Questions?

If you have questions, feel free to:

- Open an issue
- Contact the maintainers

Thank you for contributing to CyberMinds!
