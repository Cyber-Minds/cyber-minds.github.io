"""
inject_analytics.py
Injects Umami analytics script tag into all HTML files.
Reads UMAMI_WEBSITE_ID and UMAMI_DOMAINS from .env file.
Run from repo root: python inject_analytics.py
"""

import os
import re


def load_env(env_path='.env'):
    """Read key=value pairs from .env file, falling back to .env.example."""
    env_vars = {}
    if not os.path.exists(env_path):
        env_path = '.env.example'
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
    return env_vars


env = load_env()
WEBSITE_ID = env.get('UMAMI_WEBSITE_ID', '')
UMAMI_DOMAINS = env.get('UMAMI_DOMAINS', 'cyber-minds.github.io')

if not WEBSITE_ID:
    print('ERROR: UMAMI_WEBSITE_ID not found in .env or .env.example')
    print('Create a .env file with: UMAMI_WEBSITE_ID=your-id-here')
    exit(1)

print(f'Using Umami Website ID: {WEBSITE_ID}')
print(f'Using domains: {UMAMI_DOMAINS}')

# Folders to scan — walking '.' covers the full repo tree including HTML/
HTML_DIRS = ['.']
HTML_EXTENSIONS = ['.html']

# Pages to skip
SKIP_FILES = {'SignIn&LogIn.html'}


def get_relative_analytics_path(html_filepath):
    """Compute relative path from an HTML file to Javascript/analytics.js."""
    html_dir = os.path.dirname(os.path.abspath(html_filepath))
    repo_root = os.path.abspath('.')
    rel_dir = os.path.relpath(html_dir, repo_root)
    depth = len(rel_dir.split(os.sep)) if rel_dir != '.' else 0
    prefix = '../' * depth
    return f'{prefix}Javascript/analytics.js'


def get_umami_script(website_id, domains):
    return f'''    <!-- Umami Analytics: privacy-safe, cookieless, no PII -->
    <!-- Query params with tokens/IDs are excluded via data-exclude-search -->
    <script
      defer
      src="https://cloud.umami.is/script.js"
      data-website-id="{website_id}"
      data-exclude-search="true"
      data-domains="{domains}"
      onerror="console.warn('Analytics failed to load - page rendering unaffected')"
    ></script>'''


def should_skip(filepath):
    return os.path.basename(filepath) in SKIP_FILES


def already_injected(content):
    return 'cloud.umami.is' in content


def inject_file(filepath):
    if should_skip(filepath):
        print(f'SKIP: {filepath}')
        return

    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    analytics_path = get_relative_analytics_path(filepath)
    analytics_js_tag = f'    <script src="{analytics_path}"></script>'
    umami_script = get_umami_script(WEBSITE_ID, UMAMI_DOMAINS)

    if already_injected(content):
        # Update existing injection with correct values
        content = re.sub(r'data-website-id="[^"]*"', f'data-website-id="{WEBSITE_ID}"', content)
        content = re.sub(r'data-domains="[^"]*"', f'data-domains="{UMAMI_DOMAINS}"', content)
        # Update analytics.js path to be relative; consume existing leading
        # whitespace so indentation doesn't drift on repeated runs
        content = re.sub(
            r'[ \t]*<script src="[^"]*analytics\.js"></script>',
            analytics_js_tag,
            content
        )
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'UPDATED: {filepath}')
        return

    if '</head>' not in content:
        print(f'WARNING: No </head> found in {filepath}, skipping')
        return

    content = content.replace('</head>', f'{umami_script}\n  </head>', 1)

    if '</body>' in content:
        content = content.replace('</body>', f'{analytics_js_tag}\n  </body>', 1)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'INJECTED: {filepath}')


def main():
    count = 0
    for folder in HTML_DIRS:
        for root, dirs, files in os.walk(folder):
            # Skip node_modules, common build/vendor dirs, and hidden folders
            dirs[:] = [
                d for d in dirs
                if not d.startswith('.')
                and d not in {'node_modules', 'vendor', 'dist', 'build', '__pycache__'}
            ]
            for filename in files:
                if any(filename.endswith(ext) for ext in HTML_EXTENSIONS):
                    inject_file(os.path.join(root, filename))
                    count += 1

    print(f'\nDone. Processed {count} HTML files.')


if __name__ == '__main__':
    main()
