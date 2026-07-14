#!/usr/bin/env python3
r"""Fail if a workflow has a comment or blank line inside a \-continuation.

A shell line ending in `\` continues onto the next line. If that next line is a
comment (or blank), the continuation ENDS there -- so a backslash-continued
env-assignment prefix silently stops applying to the command it was meant to
prefix. The command then runs with NO environment, and nothing errors.

Not hypothetical: this shipped on 2026-07-14 in saas-ripllo and saas-fulkruma.
A comment was added between the env block and `npx playwright test`, so
FRONTEND_URL never reached Playwright. It fell back to http://localhost:3000 and
every E2E test died with ERR_CONNECTION_REFUSED -- including tests that had
passed for months. The whole suite failing at once is the tell: that is the
environment, not the assertions.

Put explanatory comments ABOVE the env block, never between it and its command.
"""
import glob
import sys

bad = []
for path in sorted(glob.glob(".github/workflows/*.yml") + glob.glob(".github/workflows/*.yaml")):
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    for i, line in enumerate(lines[:-1]):
        if not line.rstrip().endswith("\\"):
            continue
        nxt = lines[i + 1].strip()
        if nxt.startswith("#"):
            bad.append((path, i + 2, "comment", nxt[:60]))
        elif nxt == "":
            bad.append((path, i + 2, "blank line", ""))

if bad:
    print("Broken shell line-continuation -- the env assignment above it is silently lost:\n")
    for path, lineno, kind, text in bad:
        print(f"  {path}:{lineno}: {kind} directly after a line ending in '\\'  {text}")
    print("\nMove the comment ABOVE the env block. See the header of this script.")
    sys.exit(1)

print("workflow shell continuations OK")
