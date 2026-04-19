#!/usr/bin/env python3
import re
from pathlib import Path

def update_html_file(file_path):
    """Add header.js script and site-header element if missing."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Check if header.js is already included
    if 'header.js' in content:
        return False
    
    # Ensure there's a header element or create one
    if '<header' not in content:
        # Find body tag and insert header after it
        body_match = re.search(r'<body[^>]*>', content)
        if body_match:
            insert_pos = body_match.end()
            content = content[:insert_pos] + '\n    <header id="site-header"></header>' + content[insert_pos:]
    
    # Ensure header has id="site-header"
    content = re.sub(r'<header(?!.*id=)([^>]*)>', r'<header id="site-header"\1>', content)
    
    # Find relative path for header.js from this file
    file_rel_path = file_path.relative_to(Path('/Users/ashwin/Documents/GitHub/CyberMinds'))
    depth = len(file_rel_path.parts) - 1
    script_path = '../' * depth + 'Javascript/header.js'
    
    # Add script tag before </body>
    script_tag = f'\n  <script src="{script_path}"></script>'
    if '</body>' in content:
        content = content.replace('</body>', script_tag + '\n</body>')
    elif '</html>' in content:
        content = content.replace('</html>', script_tag + '\n</html>')
    
    # Write back only if changed
    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    root = Path('/Users/ashwin/Documents/GitHub/CyberMinds')
    updated_count = 0
    
    for html_file in sorted(root.rglob('*.html')):
        if 'terminal' in str(html_file):
            continue
        if update_html_file(html_file):
            print(f'Updated: {html_file.relative_to(root)}')
            updated_count += 1
    
    print(f'\nTotal files updated: {updated_count}')

if __name__ == '__main__':
    main()
