# Vendored packages

## nestjs-temporal-core-3.4.0.tgz

The npm package `nestjs-temporal-core` at version 3.4.0, byte for byte as the
registry served it. It is the NestJS wrapper around the Temporal SDK that the
orchestrator's workers and the backend's Temporal client are built on
(`TemporalModule`, `TemporalService`, `@Activity`, `@ActivityMethod`).

- Source: `https://registry.npmjs.org/nestjs-temporal-core/-/nestjs-temporal-core-3.4.0.tgz`
- Integrity (sha512, base64), the same value `pnpm-lock.yaml` held for the
  registry copy:
  `sha512-GLCDofCHXMUkztx2UWF20fj9YkrMOKTb3gqhTGOTCAhjbzec6Ckh2lhHhdD2VIe8NiBHvZVZqDKahuf+WLX2qg==`
- Licence: MIT, copyright Harsh Makwana. The licence text ships inside the
  tarball as `package/LICENSE`.

### Why it is here

Every version of the package on npm is marked deprecated with "Package no
longer supported", a notice npm support sets, and its source repository is
gone. If the registry stops serving the tarball, `pnpm install
--frozen-lockfile` fails in CI and in the Docker image build. Serving the same
file from this repository keeps installs working with no code change: the root
`package.json` points at it with a `file:` spec, so every import still reads
`'nestjs-temporal-core'`.

pnpm checks the file against the integrity in `pnpm-lock.yaml` on every
install, so a changed tarball fails the install instead of being used.

### Changing it

The upstream project this repository is forked from uses the same package
from npm. A bump there (or a fix we need) is applied here, never by pointing
`package.json` back at the registry: put the new tarball in this folder,
check its sha512 against the registry's `dist.integrity` for that version,
read what changed, point `package.json` at the new file, delete the old one,
run `pnpm install`, and update this file. The lockfile diff should touch only
this package's entries. `docs/upstream-sync.md` (Dependency versions) says the
same for upstream picks.
