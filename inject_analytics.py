"""
inject_analytics.py
Injects Umami analytics script tag into all HTML files.
Run once from the repo root: python inject_analytics.py
"""

import os
import re

# ─────────────────────────────────────────────
# Umami script tag — cookieless, privacy-safe
# Website ID is set via environment or placeholder
# No secret keys are exposed here — only the public website ID
# ─────────────────────────────────────────────
UMAMI_SCRIPT = '''    <!-- Umami Analytics: privacy-safe, cookieless, no PII -->
    <!-- Query params with tokens/IDs are excluded via data-exclude-search -->
    <script
      defer
      src="https://cloud.umami.is/script.js"
      data-website-id="UMAMI_WEBSITE_ID_PLACEHOLDER"
      data-exclude-search="true"
      data-domains="cyberminds.co"
      onerror="console.warn('Analytics failed to load — page rendering unaffected')"
    ></script>'''

# Analytics event tracking script link
ANALYTICS_JS = '    <script src="/Javascript/analytics.js"></script>'

# Folders to scan
HTML_DIRS = ['HTML', '.']
HTML_EXTENSIONS = ['.html']

# Pages to skip
SKIP_FILES = {'SignIn&LogIn.html'}


def should_skip(filepath):
    filename = os.path.basename(filepath)
    return filename in SKIP_FILES


def already_injected(content):
    return 'umami' in content.lower() or 'UMAMI_WEBSITE_ID_PLACEHOLDER' in content


def inject_file(filepath):
    if should_skip(filepath):
        print(f'SKIP: {filepath}')
        return

    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    if already_injected(content):
        print(f'ALREADY DONE: {filepath}')
        return

    # Inject Umami script before </head>
    if '</head>' in content:
        content = content.replace('</head>', f'{UMAMI_SCRIPT}\n  </head>', 1)
    else:
        print(f'WARNING: No </head> found in {filepath}, skipping')
        return

    # Inject analytics.js before </body>
    if '</body>' in content:
        content = content.replace('</body>', f'{ANALYTICS_JS}\n  </body>', 1)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f'INJECTED: {filepath}')


def main():
    count = 0
    for folder in HTML_DIRS:
        for root, dirs, files in os.walk(folder):
            # Skip node_modules or hidden folders
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for filename in files:
                if any(filename.endswith(ext) for ext in HTML_EXTENSIONS):
                    filepath = os.path.join(root, filename)
                    inject_file(filepath)
                    count += 1

    print(f'\nDone. Processed {count} HTML files.')
    print('Remember to replace UMAMI_WEBSITE_ID_PLACEHOLDER with your real Umami website ID.')


if __name__ == '__main__':
    main()