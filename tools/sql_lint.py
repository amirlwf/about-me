"""sql_lint.py — catch broken SQL before the owner pastes it.

Two precise checks (no false-positive heuristics):

1. literal balance: a small PostgreSQL lexer (line comments, $tag$ blocks,
   '' escapes, double-quoted identifiers) reporting unterminated
   string/dollar literals — the signature of an unescaped apostrophe.
2. JSON literals: every `'…'::jsonb` value must actually parse as JSON.
   This is what caught `{"hero_lead": "I'm …"}` closing the literal early
   and killing the paste at line 361.

    python tools/sql_lint.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL_DIR = os.path.join(ROOT, "supabase")


def line_no(src, pos):
    return src.count("\n", 0, pos) + 1


def balance(src):
    """[(line, message)] for unterminated constructs."""
    problems = []
    i, n = 0, len(src)
    line = 1
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            i += 1
            continue
        if c == "-" and src.startswith("--", i):          # line comment
            j = src.find("\n", i)
            if j < 0:
                break
            i = j
            continue
        if c == "$":                                       # $tag$ ... $tag$
            m = re.match(r"\$[A-Za-z_]*\$", src[i:])
            if m:
                tag = m.group(0)
                j = src.find(tag, i + len(tag))
                if j < 0:
                    problems.append((line, "unterminated " + tag + " block"))
                    break
                line += src.count("\n", i, j + len(tag))
                i = j + len(tag)
                continue
        if c == '"':                                       # quoted identifier
            start = line
            i += 1
            while i < n:
                if src[i] == '"':
                    if i + 1 < n and src[i + 1] == '"':
                        i += 2
                        continue
                    i += 1
                    break
                if src[i] == "\n":
                    line += 1
                i += 1
            else:
                problems.append((start, 'unterminated " identifier'))
            continue
        if c == "'":                                       # string literal
            start = line
            i += 1
            closed = False
            while i < n:
                if src[i] == "\n":
                    line += 1
                if src[i] == "'":
                    if i + 1 < n and src[i + 1] == "'":
                        i += 2
                        continue
                    i += 1
                    closed = True
                    break
                i += 1
            if not closed:
                problems.append((start, "unterminated ' literal"))
                break
            continue
        i += 1
    return problems


def json_literals(src):
    """Every '…'::jsonb literal holding an object/array must parse as JSON."""
    problems = []
    for m in re.finditer(r"'((?:[^']|'')*?)'\s*::\s*jsonb", src, re.S | re.I):
        body = m.group(1).replace("''", "'")
        stripped = body.lstrip()
        if not (stripped.startswith("{") or stripped.startswith("[")):
            continue
        try:
            json.loads(body)
        except Exception as e:
            problems.append((line_no(src, m.start()),
                             "invalid JSON literal: " + str(e)[:70]))
    return problems


def main():
    files = sorted(f for f in os.listdir(SQL_DIR) if f.endswith(".sql"))
    total = 0
    for f in files:
        src = open(os.path.join(SQL_DIR, f), encoding="utf-8", newline="").read()
        probs = balance(src) + json_literals(src)
        if probs:
            print("FAIL supabase/" + f)
            for ln, msg in probs[:8]:
                print("   line %d: %s" % (ln, msg))
            total += len(probs)
        else:
            print("OK   supabase/" + f)
    print("\n%d problem(s)" % total)
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
