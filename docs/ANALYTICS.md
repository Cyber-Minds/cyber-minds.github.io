# Analytics - CyberMinds

## Tool
**Umami** (cloud.umami.is) — open source, cookieless, GDPR compliant by default.

## Why Umami
- No cookies — no consent banner required
- No PII collection by default
- Privacy-respecting analytics for a cybersecurity education platform
- Free tier available on Umami Cloud

## Dashboard
Umami Cloud dashboard: https://cloud.umami.is
Owner: assign to team lead (Ege) after account creation.

## Setup
1. Create account at cloud.umami.is
2. Add website → copy the Website ID
3. Replace `UMAMI_WEBSITE_ID_PLACEHOLDER` in all HTML files with the real Website ID
4. Deploy and verify events appear in dashboard

## Event Schema

| Event Name | Trigger | Payload Fields |
|---|---|---|
| `page_view` | Every page load | `category` (home/ctf/course/chatbox/mission/general) |
| `ctf_entry_click` | Click on any CTF link | `source` (current page path) |
| `course_entry_click` | Click on any course link | `source` (current page path) |
| `get_started_click` | Click Get Started button | `source` (current page path) |
| `challenge_start` | Challenge loads in terminal | `challenge` (challenge ID) |
| `challenge_complete` | Challenge passes checker | `challenge` (challenge ID) |

## Privacy & Security

**No PII sent:** All custom event payloads are validated through `trackEvent()` which strips any fields containing: token, session_id, user_id, email, password, key, secret, auth.

**Query parameters:** The Umami script tag uses `data-exclude-search="true"` — URL query params (including session tokens) are never sent to analytics.

**DNT (Do Not Track):** Umami honors the browser DNT header by default. No additional configuration needed.

**Script failure:** The Umami script tag uses `onerror` handler — if the script fails to load for any reason, page rendering is completely unaffected.

**No secret keys in client code:** Only the public Website ID is in client-side code. No API keys or secrets are exposed.

## Dashboard Queries

**Top entry sources:**
- Filter by `ctf_entry_click` → group by `source` → shows which pages drive CTF traffic

**Challenge funnel performance:**
- Compare `challenge_start` vs `challenge_complete` counts per `challenge` ID
- Identifies highest and lowest converting challenge steps

## Weekly Reporting
Assign dashboard ownership and weekly reporting cadence to team lead.