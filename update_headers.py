#!/usr/bin/env python3
import re
from pathlib import Path

def get_relative_path(from_rel, to_rel):
    from_parts = Path(from_rel).parent.parts
    to_parts = Path(to_rel).parts
    i = 0
    while i < len(from_parts) and i < len(to_parts) and from_parts[i] == to_parts[i]:
        i += 1
    up = len(from_parts) - i
    down = to_parts[i:]
    return '../' * up + '/'.join(down)

def update_html_file(file_path, root):
    rel_path = str(Path(file_path).relative_to(root))
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace header
    header_pattern = r'<header>.*?</header>'
    new_header = '<header id="site-header"></header>'
    content = re.sub(header_pattern, new_header, content, flags=re.DOTALL)

    # Add script before </body>
    script_path = get_relative_path(rel_path, 'Javascript/header.js')
    script_tag = f'<script src="{script_path}"></script>\n</body>'
    content = content.replace('</body>', script_tag)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

def main():
    root = Path('/Users/ashwin/Documents/GitHub/CyberMinds')
    for html_file in root.rglob('*.html'):
        if 'terminal' in str(html_file) or 'CTF' in str(html_file) or 'ctf' in str(html_file):
            continue  # Skip terminal and CTF for now
        print(f'Updating {html_file}')
        update_html_file(str(html_file), root)

if __name__ == '__main__':
    main()