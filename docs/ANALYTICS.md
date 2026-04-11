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

| Event | When it fires | Data sent |
|---|---|---|
| `page_view` | Every page load | `category` (home/ctf/course/chatbox/mission/general) |
| `ctf_entry_click` | User clicks any CTF link | `source` (current page path) |
| `course_entry_click` | User clicks any course link | `source` (current page path) |
| `get_started_click` | User clicks Get Started | `source` (current page path) |
| `challenge_start` | A challenge loads in the terminal | `challenge` (challenge ID only) |
| `challenge_complete` | A challenge passes the checker | `challenge` (challenge ID only) |

Challenge answers, terminal input, and session credentials are never sent to analytics under any circumstances.

## Privacy guardrails

**No PII.** Every custom event goes through `trackEvent()` in `analytics.js` before being sent. That function strips any field whose key contains: token, session_id, user_id, email, password, key, secret, or auth. If someone accidentally passes a sensitive field it gets silently dropped.

**No query strings.** The Umami script tag includes `data-exclude-search="true"` which means URL parameters like session tokens or challenge IDs in the address bar are never forwarded to Umami.

**DNT respected.** Umami honors the browser Do Not Track header by default. No extra configuration needed on our end.

**Script failures are safe.** The script tag has an `onerror` handler so if Umami fails to load for any reason, the rest of the page is completely unaffected.

**No secrets in client code.** The only thing exposed in the frontend is the public Website ID. No API keys or private credentials are used on the client side.

**Data retention.** Umami Cloud keeps data for 24 months by default. We only store aggregated event counts, not raw logs or individual user sessions.

## What the dashboard can answer

To find top entry sources: filter by `ctf_entry_click`, group by `source`. That shows which pages are actually driving people into the CTF section.

To find the challenge funnel: compare `challenge_start` vs `challenge_complete` counts for each challenge ID. The ones with the biggest drop-off between start and complete are where users are getting stuck.

## Reporting

Dashboard ownership sits with the project lead. Worth checking weekly during team meetings to track whether new CTF challenges are being attempted and completed.
