# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `generate_seed_data` MCP tool and
  `generate` CLI command producing deterministic seed /
  fixture records from field specs and a numeric seed.
- Seven field types — integer, number, boolean, string,
  enum, email, and date — drawn from the pinned mulberry32
  PRNG, consumed record by record, field by field in
  declaration order, so the same seed and specs always
  produce exactly the same records.
- Inclusive integer bounds, numbers rounded to 4 decimal
  places, lowercase strings of configurable length, enum
  picks from caller-supplied values, 8-character
  `@example.com` emails, and UTC dates inside a
  caller-supplied calendar range.
- Path-naming validation errors for malformed input (seed
  and count ranges, duplicate field names, per-type bound
  and format checks), with no partial results; properties a
  field's type does not use are ignored, not validated.
