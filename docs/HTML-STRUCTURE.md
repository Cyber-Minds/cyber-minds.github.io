# Structural HTML Validation

`scripts/html-structure.js` checks that learner-facing pages are structurally
sound before GitHub Pages serves them. It runs in CI on changed `.html` files
and can be run locally over the whole repository.

```bash
npm run qa:structure                                  # whole repo, first issue per file
node scripts/html-structure.js --all                  # every issue
node scripts/html-structure.js --changed-from main    # only changed pages
```

Exit code is `0` when clean, `1` when a violation or an invalid exception entry
is found.

## Why this exists

`qa-static.js` validates links, titles, and alt text with regexes over
individual attributes. A page can pass all of those and still contain markup
that changes how the browser builds the DOM:

- a second `<body>` halfway down a lesson,
- an `<a>` nested inside another `<a>`,
- a stray `</head>` in content pasted from another page,
- `footer.js` pulled in twice.

None of these produce a broken local URL, so nothing caught them. All of them
affect navigation or assistive-technology traversal once the page is live.

## Rules

| Rule id | What it catches |
|---|---|
| `duplicate-document-root` | A second `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>` |
| `misplaced-document-tag` | One of those tags nested inside page content |
| `stray-document-end-tag` | `</body>`, `</head>`, or `</html>` closing nothing |
| `nested-anchor` | `<a>` opened while another `<a>` is still open |
| `duplicate-script` | The same script `src` included more than once |

Diagnostics are `file:line [rule] message`, and the message names the line of
the *first* occurrence so both ends of the problem are visible:

```
HTML/Courses and Activities/Course 1/CIAtriadcourse1.html:173 [duplicate-script] script "javascript/footer.js" already included on line 170
```

By default only the **first violation per file** is printed — one stray
document tag can cascade into many downstream reports, and the first one is
the repair site. Pass `--all` to see the rest. CI uses `--all` so a reviewer
gets the full picture in one run.

## What it is not

The checker walks repository bytes with a tokenizer. It does **not**:

- fetch any URL or perform a live crawl,
- execute or evaluate page `<script>` contents,
- read anything outside the repository root.

Diagnostics quote only tag names, rule ids, and line numbers — never page
text, attribute values, or query strings — so a CI log cannot leak learner
content or a token embedded in a URL.

## Supported legacy markup patterns

These pages were written over several years and a lot of the markup predates
any linting. The checker tolerates the following on purpose, because browsers
handle them identically and flagging them would produce hundreds of
unactionable reports:

**Omitted optional end tags.** `<li>`, `<p>`, `<td>`, `<th>`, `<tr>`,
`<dt>`, `<dd>`, `<option>`, `<optgroup>`, `<thead>`, `<tbody>`, `<tfoot>`,
`<rt>`, and `<rp>` are closed implicitly when the next sibling or an
enclosing block starts. This parses cleanly:

```html
<ul>
  <li>First
  <li>Second
</ul>
<table>
  <tr><td>a<td>b
  <tr><td>c<td>d
</table>
```

**Unclosed `<p>` before a block element.** A `<p>` is closed implicitly by
any of `div`, `section`, `table`, `ul`, `ol`, `h1`–`h6`, `header`, `footer`,
`main`, `nav`, `figure`, and friends.

**Stray end tags.** A `</div>` or `</span>` with no matching open element is
ignored rather than reported. Browsers drop them without reparenting, and
legacy lesson pages contain a fair number.

A stray `</body>`, `</head>`, or `</html>` is *not* tolerated — see
`stray-document-end-tag`. Those close the document rather than an element, so
everything after one is markup the author believes is inside a region that has
already ended.

**Self-closing and void elements.** `<img>`, `<br>`, `<link>`, `<meta>`,
`<input>`, and XHTML-style `<div />` are all handled without needing an end
tag.

**Markup inside raw-text elements.** Tags appearing inside `<script>`,
`<style>`, `<textarea>`, or `<title>` bodies are text, not structure:

```html
<script>
  var markup = '<a href="#"><a href="#">';  // not a nested anchor
</script>
<style>a > a { color: red; }</style>         <!-- not a tag -->
```

**Markup inside comments and CDATA.** Commented-out blocks are inert, so a
`<script src>` inside a comment does not count toward duplicate detection.

**`>` inside quoted attribute values.** `<div data-tip="use a > b">` does not
end the tag early.

**Same filename in different directories.** `/Javascript/footer.js` and
`/Javascript/terminal/footer.js` are distinct scripts. Paths are resolved
before comparison, so `../Javascript/footer.js` and `/Javascript/footer.js`
*are* recognised as the same file, and a cache-busted `app.js?v=2` is still a
duplicate of `app.js`.

## Repair workflow

When CI reports a violation:

1. **Reproduce locally.** `node scripts/html-structure.js --all` and find your
   file, or run it scoped: `node scripts/html-structure.js --changed-from main --all`.
2. **Open the file at the reported line.** The message names the first
   occurrence too, which is usually the one to keep.
3. **Apply the repair for that rule:**

   - `duplicate-script` — delete the later `<script>` tag. Keep the first.
     Check whether the two copies sit in `<head>` and before `</body>`; the
     one in `<head>` is usually the accidental one for `footer.js`/`header.js`,
     which expect to run after the markup they modify.
   - `duplicate-document-root` — the page has two `<head>`/`<body>`/`<html>`
     openings. Usually content was pasted in with its wrapper attached. Delete
     the inner wrapper tags and keep the content.
   - `misplaced-document-tag` — same cause, but the stray tag is the only one
     of its kind. Move its contents to the real `<head>`/`<body>` and delete
     the tag.
   - `stray-document-end-tag` — the page closes `<body>`/`<head>`/`<html>`
     more than once. The reported line is the *last* one; the repair site is
     usually the **earlier** one, which closed the document before the lesson
     content started. Delete the premature closing tag and keep the one at the
     end of the file. Browsers ignore the early close and keep parsing, which
     is why such a page still renders — removing it changes nothing visually
     and makes the DOM match the source.
   - `nested-anchor` — decide which link should win. Either close the outer
     `<a>` before the inner one opens, or convert the inner element to a
     `<span>`/`<button>`. Nested anchors are invalid HTML and screen readers
     announce them unpredictably.
4. **Re-run the check**, then `npm run test:qa` to confirm nothing else moved.

### Bulk repairs

If a rule fires across many files from one copy-paste lineage, fix them in a
single commit so the diff reads as one mechanical change. The 31
`duplicate-script` violations found when this checker was introduced were
repaired that way: pure deletions, no reordering, keeping the first inclusion
in every file.

## Exceptions

`scripts/html-structure-exceptions.json` holds waivers. It is currently empty
and should stay that way if possible — **repairing the page is almost always
cheaper than owning a waiver forever.**

```json
{
  "exceptions": [
    {
      "file": "HTML/Example.html",
      "rule": "nested-anchor",
      "owner": "@github-handle",
      "reason": "Third-party embed ships nested anchors; upstream issue #123"
    }
  ]
}
```

Every entry must name a `file`, a valid `rule`, an `owner`, and a `reason`.
An entry missing any of them **fails the check** rather than silently
waiving — an exception nobody owns is how a permanent blind spot gets created.
A waiver suppresses one rule for one file; it does not disable the rule
elsewhere or hide other rules in the same file.

Run with `--all` to see what is currently being waived:

```
Waived by scripts/html-structure-exceptions.json (1):
  HTML/Example.html:42 [nested-anchor] <a> opened inside the <a> still open from line 41
```

## Relationship to the other QA checks

| Script | Scope |
|---|---|
| `qa-static.js` | Titles, alt text, link/asset resolution, external-origin allowlist, footer year |
| `html-structure.js` | Document structure: roots, misplaced tags, nested anchors, duplicate scripts |
| `link-audit.js` | Link and asset inventory against a baseline |
| `content-freshness.js` | Content staleness against the manifest |

The external-origin allowlist lives in `scripts/qa-allowlist.json` and is
enforced by `qa-static.js`; this checker does not touch it. Adding a new
external origin still follows `docs/ORIGINS.md`.
