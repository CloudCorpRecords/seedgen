# seedgen — Build Report

MCP Rebuild 1000, Batch 15. Original program build from the
packages-100 plan (cluster H #100), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch15/seedgen.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `seedgen`, npm `@reneturcios/seedgen`,
MCP name `io.github.CloudCorpRecords/seedgen`, version
`0.1.0`, bin `seedgen` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Generate
  deterministic, repeatable seed and fixture data from
  field specs and a numeric seed.", 93 chars ≤100 — see
  the honest note below on the spec's character count;
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/seedgen:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/seedgen"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`generate --input
  <args.json>` where the file holds the full arguments
  object, `mcp`, `--version`; exit 2 usage / 1 runtime
  error, argument validation before any file read),
  `src/mcp.ts`, `src/types.ts`, `src/seedgen.ts` (core,
  `VERSION = "0.1.0"`)
- `test/seedgen.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/seedgen`,
  smoke-test server-name assertion `seedgen`)

## Tools implemented (1)

- `generate_seed_data` — arguments: `seed` (integer,
  required, 0..4294967295), `count` (integer, required,
  1..1000), `fields` (array, required, minItems 1) of
  `{name (string, required, non-empty, unique), type
  (string, required, one of integer/number/boolean/
  string/enum/email/date), min, max, length, values,
  from, to}`.

  Returns `{seed, count, records}`: exactly `count`
  records, each holding the declared fields in declaration
  order. Generation is driven by the pinned mulberry32
  PRNG exactly as the spec pins it (state advanced by
  0x6D2B79F5 as a signed 32-bit integer, Math.imul mixing,
  draws in [0, 1)), consumed record by record, field by
  field in declaration order: a string field consumes one
  draw per character, an email field consumes 8, every
  other type consumes exactly 1. Per type: integer is
  `min + floor(r * (max - min + 1))` (defaults 0..100,
  both bounds reachable); number is
  `round((min + r * (max - min)) * 10000) / 10000`
  (defaults 0..1); boolean is `r < 0.5`; string draws
  each character from exactly
  `"abcdefghijklmnopqrstuvwxyz"` (length default 8,
  1..64); enum picks `values[floor(r * values.length)]`;
  email is an 8-character local part drawn like a string
  plus `"@example.com"`; date is `from + floor(r * (D + 1))`
  days where D is the whole-day span from `from` to `to`
  (defaults 2020-01-01..2020-12-31), computed in UTC and
  formatted YYYY-MM-DD.

  The fixture literal
  (`harness/fixtures/seedgen-tools-original.json`) and the
  `src/mcp.ts` literal are identical, with no `$schema`
  and no `additionalProperties`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the
  fixture, per the standing fleet rule (no McpServer/zod
  schema conversion). Every `tools/call` is validated by
  the core itself, so the MCP and CLI paths share one
  validation implementation.
- Validation is path-naming and total: every field spec
  is validated before any record is generated, so
  malformed input throws an Error naming the offending
  path (e.g. `fields[0].values must be a non-empty
  array`, `fields[2].name duplicates fields[0].name "a"`)
  and produces no partial result (MCP: `isError`; CLI:
  exit 1). Covered paths: seed missing/non-integer/out
  of range; count likewise; fields missing/empty/not an
  array; a field entry not an object; name
  missing/empty/non-string/duplicated; type missing or
  not one of the seven; integer min/max present but not
  integers, or min > max; number min/max present but not
  finite, or min > max; length present but not an
  integer in 1..64; enum values missing/not an
  array/empty/holding an empty or non-string entry; date
  from/to present but not a string in YYYY-MM-DD form
  naming a real calendar date (2021-02-29 and 1900-02-29
  rejected, 2000-02-29 and 2024-02-29 accepted), or
  from > to.
- Properties a field's type does not use are ignored and
  not validated, per the spec's pinned choice — see the
  judgement call below for how far that scoping goes.
- Date arithmetic uses civil day-number conversion
  (Howard Hinnant's days-from-civil / civil-from-days),
  which is pure UTC arithmetic: it avoids `Date.UTC`'s
  silent remapping of years 0..99 onto 1900..1999, so
  every four-digit year the format allows behaves
  correctly. Leap years follow the Gregorian rule
  (divisible by 4, except centuries not divisible by
  400).

## Verification (foreground, this session)

- `npm install --ignore-scripts --offline` green;
  `npm run build` (`tsc`) exit 0 (`dist/cli.js` built)
- `npm test` (`tsx --test test/*.test.ts`): **44 tests,
  44 pass, 0 fail** — golden records verified two
  independent ways (hardcoded constants derived from the
  canonical published mulberry32 snippet, plus an
  in-test reimplementation of the PRNG in the snippet's
  compact form that rebuilds the expected records draw
  by draw; the first raw draws for seeds 42, 0, and
  4294967295 also pinned as literals); repeatability
  (same input twice → deep-equal); boundary seeds 0 and
  4294967295; output shape and declaration-order keys;
  draw-order sensitivity (reordering fields changes the
  output); draw consumption (a longer string shifts the
  following field exactly one draw — pinned values 45
  vs 86 for seed 42; an email field is interchangeable
  with an 8-char string upstream of another field);
  per-type generation (integer bounds inclusive and both
  reached, min == max constant, integer/number/string/
  date defaults, numbers within range and rounded to
  4dp, booleans both appearing, string alphabet and
  lengths 1/8/64, enum membership and single-choice
  constancy, email shape `^[a-z]{8}@example.com$`, dates
  within range formatted YYYY-MM-DD, from == to constant
  on a leap day, month/year boundary crossing); the
  ignored-properties behaviour; and every validation
  path listed above
- `dist/cli.js --version` → `0.1.0`; unknown command
  exits 2 with usage; `generate` with no `--input` exits
  2; `generate --input <missing file>` exits 1;
  `generate --input <valid file>` exits 0 and prints the
  seed-42 golden set (`{id 7, code "lwre", active
  false}` first); `generate --input <invalid file>`
  (a 2021-02-29 date bound) exits 1 with
  `fields[0].from must be a real calendar date in
  YYYY-MM-DD form`
- Live MCP check over stdio against the built server:
  `initialize` returns serverInfo `{name: "seedgen",
  version: "0.1.0"}`; a `tools/call` for seed 7 returns
  the expected first enum record; a call with seed
  4294967296 returns `isError` naming the seed range
- Parity: `harness/parity.py` vs
  `harness/fixtures/seedgen-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with
  the rebuild path as an absolute path; report in
  `parity-out/` written by the harness itself)

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp
copy without `node_modules`/`dist`/`package-lock.json`,
offline `npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/seedgen`, **128 package entries** (sdk
1.32.2 tree; `qs` 6.17.0). Local `node_modules` was
installed via `npm install --ignore-scripts --offline`
for build/test; gitignored.

## Gaps / honest notes

- **Pinned judgement call — scoping of per-type
  validation.** The spec says properties a field's type
  does not use "are ignored, not validated" (example:
  `min` on a boolean), and its validation list scopes
  each check by type ("For integer fields…", "For number
  fields…", "enum fields…", "date fields…"). The
  `length` bullet is not explicitly scoped, so the
  consistent reading was pinned: `length` is validated
  only on string fields (an email field's length is
  ignored — its local part is always 8 — and a boolean
  field carrying `length: 999`, `min: "junk"`, or
  `from: "not-a-date"` is valid). Dedicated tests pin
  this behaviour.
- **Spec character count.** The spec quotes the
  server.json description as "(94 chars)", but the
  quoted string itself — "Generate deterministic,
  repeatable seed and fixture data from field specs and
  a numeric seed." — measures 93 characters. The string
  was used verbatim (it is ≤100 either way).
- **Error wording** for the min > max, from > to, and
  duplicate-name cases is not fixed by the spec (only
  that the error names the offending path); the messages
  used follow the fleet pattern (e.g. `fields[0].min
  must be <= fields[0].max`).
- **Build environment note.** This VM's exec write
  guard (the intermittent EPERM/truncation documented
  in AGENTS.md) blocked exec-side file emission —
  `tsc`, `npm`, and the parity harness's own report
  writes — for most of this session, and at one point a
  retry driver's `tsc` run zeroed a hand-placed `dist/`.
  The final state is entirely genuine: once the guard
  opened, the Route 3 lockfile generation, the harness's
  own parity run, `npm install --offline`, `npm run
  build` (real `tsc`, replacing the interim dist), and
  `npm test` all ran through the standard tools and are
  reported from those runs above.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build
  only.
