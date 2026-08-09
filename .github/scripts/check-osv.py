#!/usr/bin/env python3
"""Fail only on vulnerabilities that are new since the last accepted set.

The point is to catch what a change *introduces*. Ninety-six findings are known
and currently unfixable — some need a semver range moved and reviewed on its own
merits, and several have no released fix at all (lodash's advisory names 4.18.0,
which does not exist). A check that fails on those would be red forever, and a
check that is always red is not a check.

So the accepted set lives in `.github/osv-known.txt`, one `package GHSA-id` per
line. Anything outside it fails the build. Anything in it that no longer appears
is reported as resolved, so the file can be trimmed rather than growing silently
into a rug to sweep things under.

Usage: check-osv.py <osv.json> <known.txt>
"""
import json
import sys


def load_findings(path):
    with open(path) as handle:
        report = json.load(handle)

    findings = set()
    for result in report.get('results', []):
        for package in result.get('packages', []):
            name = package['package']['name']
            for vuln in package.get('vulnerabilities', []):
                findings.add(f"{name} {vuln['id']}")
    return findings


def load_known(path):
    known = set()
    try:
        with open(path) as handle:
            for line in handle:
                line = line.split('#', 1)[0].strip()
                if line:
                    known.add(line)
    except FileNotFoundError:
        pass
    return known


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    found = load_findings(sys.argv[1])
    known = load_known(sys.argv[2])

    new = sorted(found - known)
    gone = sorted(known - found)

    print(f"{len(found)} findings, {len(known)} accepted")

    if gone:
        print(f"\n{len(gone)} accepted findings no longer present — "
              f"remove them from {sys.argv[2]}:")
        for item in gone:
            print(f"  {item}")

    if new:
        print(f"\n{len(new)} NEW finding(s):")
        for item in new:
            print(f"  {item}")
        print("\nFix them, or add them to the accepted set with a reason.")
        return 1

    print("\nNo new vulnerabilities.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
