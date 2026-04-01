"""
inject_analytics.py
Injects analytics.js reference into all HTML files and strips any inline
Umami <script> blocks (the website ID now lives in analytics.js, not HTML).
Run from repo root: python inject_analytics.py
"""

import os
import re

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


def strip_umami_block(content):
    """Remove inline Umami <script> block — ID now lives in analytics.js."""
    return re.sub(
        r'[ \t]*<!-- Umami Analytics.*?></script>[ \t]*\n?',
        '',
        content,
        flags=re.DOTALL
    )


def should_skip(filepath):
    return os.path.basename(filepath) in SKIP_FILES


def inject_file(filepath):
    if should_skip(filepath):
        print(f'SKIP: {filepath}')
        return

    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    analytics_path = get_relative_analytics_path(filepath)
    analytics_js_tag = f'    <script src="{analytics_path}"></script>'

    original = content

    # Strip any existing inline Umami block
    content = strip_umami_block(content)

    if 'analytics.js' in content:
        # Update path in case directory depth changed; normalize indentation
        content = re.sub(
            r'[ \t]*<script src="[^"]*analytics\.js"></script>',
            analytics_js_tag,
            content
        )
        if content == original:
            return  # nothing changed, skip write
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'UPDATED: {filepath}')
        return

    if '</body>' in content:
        content = content.replace('</body>', f'{analytics_js_tag}\n  </body>', 1)
    elif '</head>' in content:
        content = content.replace('</head>', f'{analytics_js_tag}\n  </head>', 1)
    else:
        print(f'WARNING: No </body> or </head> found in {filepath}, skipping')
        return

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
