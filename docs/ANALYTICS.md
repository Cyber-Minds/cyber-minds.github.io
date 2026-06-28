# Analytics Decision Record

## What we picked and why

We went with **Umami** (cloud.umami.is) for analytics. It's open source, cookieless, and GDPR compliant out of the box. For a cybersecurity education platform, using something like Google Analytics that harvests user data would be contradictory to what CyberMinds teaches. Umami collects only what we explicitly tell it to and nothing else. It's also free on the cloud tier which fits our budget.

Dashboard lives at: https://cloud.umami.is
Dashboard owner: project lead (Ege)

## Setup steps

1. Create an account at cloud.umami.is
2. Add CyberMinds as a website and copy the Website ID
3. Create a `.env` file in the repo root (copy from `.env.example`) and set:
```
   UMAMI_WEBSITE_ID=your-id-here
   UMAMI_DOMAINS=cyber-minds.github.io
```
4. Run `python inject_analytics.py` from the repo root — this automatically injects
   the Umami script tag and analytics.js reference into all HTML files
5. Commit the updated HTML files and deploy
6. Confirm events are appearing in the dashboard at cloud.umami.is

## Events we track

| Event | When it fires | Data sent | What it answers |
|---|---|---|---|
| `page_view` | Every page load | `category` (home/ctf/course/chatbox/mission/general) | Which sections get the most traffic |
| `ctf_entry_click` | User clicks any CTF nav link | `source` (current page path) | Which pages drive CTF entry |
| `course_entry_click` | User clicks any course link | `source` (current page path) | Which pages drive course entry |
| `get_started_click` | User clicks Get Started | `source` (current page path) | Home-page conversion rate |
| `course_progress` | Student visits a course or quiz page | `page_id` (stable content ID), `page_type` (course-page or quiz) | Where students are in the course funnel; which pages they reach or skip |
| `quiz_start` | Quiz engine initialises on a quiz page | `quiz` (quiz ID), `total_questions` (count) | How many students open a quiz vs. complete it |
| `quiz_complete` | Student submits a quiz | `quiz` (quiz ID), `score` (number), `total_questions` (count) | Quiz completion rate and score distribution by quiz |
| `live_help_opened` | Student loads the Live Help page | _(no payload)_ | How often students seek help; correlate with challenge or quiz drop-off |
| `challenge_start` | A CTF challenge loads in the terminal | `challenge` (challenge ID) | How many students attempt each challenge |
| `challenge_complete` | A CTF challenge passes the checker | `challenge` (challenge ID) | Challenge completion rate per challenge |

Challenge answers, terminal input, quiz answers, session credentials, and free-form text are never sent to analytics under any circumstances.

## Forbidden payload fields

Each analytics event now has a small allowlist of expected keys. If a field is not explicitly allowed for that event, `trackEvent()` drops it silently before sending.

The following keys are **never allowed** in any analytics event payload, even if someone tries to add them to an event schema. `trackEvent()` strips them silently before sending — no exception is thrown.

| Blocked key pattern | Why |
|---|---|
| `token` | Auth tokens, CSRF tokens |
| `session_id` / `sessionid` | Session identifiers |
| `user_id` / `userid` | User identifiers |
| `email` | Email addresses |
| `password` | Passwords or passphrases |
| `key` | API keys, encryption keys |
| `secret` | Secrets of any kind |
| `auth` | Auth headers or values |

In addition, `trackEvent()` rejects any value that is not a primitive (`string`, `number`, or `boolean`). Objects, arrays, and `null` are silently dropped. This prevents nested PII from leaking through.

**Fields that must never appear in any new event**, even if they pass the blocked-key check:

- Student names or display names
- Quiz answers or selected options
- Terminal input or command text
- Chat prompts or responses
- URL query strings (stripped automatically by the `data-exclude-search` attribute)
- Draft file content
- Any free-form text the student typed

## Privacy guardrails

**No PII.** Every custom event goes through `trackEvent()` in `analytics.js` before being sent. That function only forwards event-specific allowlisted keys and also strips any field whose key contains: token, session_id, user_id, email, password, key, secret, or auth. If someone accidentally passes a sensitive or unknown field it gets silently dropped.

**No query strings.** The Umami script tag includes `data-exclude-search="true"` which means URL parameters like session tokens or challenge IDs in the address bar are never forwarded to Umami.

**DNT respected.** Umami honors the browser Do Not Track header by default. No extra configuration needed on our end.

**Script failures are safe.** The script tag has an `onerror` handler so if Umami fails to load for any reason, the rest of the page is completely unaffected. Event functions (e.g. `trackEvent`) are wrapped in try/catch and queue events until Umami is ready.

**No secrets in client code.** The only thing exposed in the frontend is the public Website ID. No API keys or private credentials are used on the client side.

**Data retention.** Umami Cloud keeps data for 24 months by default. We only store aggregated event counts, not raw logs or individual user sessions.

## What the dashboard can answer

**Course funnel drop-off**
Filter by `course_progress`, group by `page_id`. Pages with low counts compared to earlier pages in the same course reveal where students stop progressing. Compare `quiz_start` counts against `quiz_complete` counts per quiz ID to see quiz abandonment.

**CTF challenge funnel**
Compare `challenge_start` vs `challenge_complete` counts for each `challenge` ID. The challenges with the largest start-to-complete gap are where students get stuck.

**Live Help correlation**
Check `live_help_opened` spikes against `course_progress` or `challenge_start` activity on the same day. A spike in Live Help after a specific course page suggests that content is confusing.

**Quiz engagement**
`quiz_start` vs `quiz_complete` by `quiz` ID reveals quizzes that students open but abandon. Average `score / total_questions` shows whether a quiz is too hard.

**Entry funnels**
Filter by `ctf_entry_click` or `course_entry_click`, group by `source`, to see which pages are driving students into each section.

## Weekly reporting checklist

Run through these steps each week during team meetings:

### Course funnel
- [ ] Open the Umami dashboard and filter last 7 days
- [ ] Check `course_progress` by `page_id` — identify pages with the lowest counts in each course
- [ ] Compare `quiz_start` vs `quiz_complete` per `quiz` ID — note any quiz with >20% abandonment
- [ ] Check `quiz_complete` score averages — flag any quiz where median score is below 50%

### CTF funnel
- [ ] Compare `challenge_start` vs `challenge_complete` counts per `challenge` ID
- [ ] Flag challenges where fewer than 50% of starters complete
- [ ] Check if any new challenge has zero `challenge_start` events (content may not be linked)

### Live Help
- [ ] Check `live_help_opened` count for the week
- [ ] Cross-reference day-of-week spikes with `course_progress` and `challenge_start` to find correlated content
- [ ] If Live Help is consistently high after a specific course page, flag that page for content review

### Entry & conversion
- [ ] Check `get_started_click` volume from the home page
- [ ] Check `ctf_entry_click` and `course_entry_click` by `source` to see which pages drive the most entry
- [ ] Note any page that drives clicks but does not appear in `course_progress` (possible navigation dead-end)

### Privacy spot-check (monthly)
- [ ] Confirm no `email`, `name`, `answer`, `input`, or `text` keys appear in the Umami event log
- [ ] Review any new events added since the last check against the forbidden payload fields list above
- [ ] Confirm `tests/analytics.spec.js` still passes in CI (payload validation is automated)
