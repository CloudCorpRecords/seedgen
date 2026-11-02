# seedgen

Test fixtures and database seed rows have a habit of being
either hand-typed (small, stale, and quietly unrepresentative)
or randomly generated (different on every run, so a failing
test can never be reproduced). seedgen takes the second path
without the drawback: you declare the shape of a record —
field names and types, bounds, lengths, choices, date
ranges — plus one numeric seed, and it produces exactly the
records that seed implies. Run it again next week, on
another machine, in CI: the output is identical, because the
generator is a pinned PRNG (mulberry32) whose draws are
consumed in a pinned order — record by record, field by
field in the order you declared them.

Seven field types cover the usual fixture needs:

- **integer** — whole numbers between `min` and `max`, both
  bounds included (defaults 0 and 100)
- **number** — decimals between `min` and `max` (defaults 0
  and 1), rounded to 4 decimal places
- **boolean** — true or false
- **string** — lowercase letters, `length` characters
  (default 8, at most 64)
- **enum** — one of the `values` you supply
- **email** — an 8-letter local part at `@example.com`
- **date** — a real calendar date from `from` to `to`
  inclusive (defaults cover 2020), computed in UTC and
  formatted `YYYY-MM-DD`

Properties a field's type does not use are ignored rather
than rejected — a stray `min` on a boolean field changes
nothing. Genuinely malformed input is a validation error
naming the offending path (for example
`fields[1].values must be a non-empty array`): a seed
outside the unsigned 32-bit range, a count outside 1..1000,
a duplicate field name, an integer bound that is not an
integer, an inverted range, a made-up calendar date such as
2021-02-29. On any error, nothing is generated — there are
no partial record sets. The computation is pure and local:
no network, no configuration, no files read beyond the
input you pass in.

## CLI

```bash
npx @reneturcios/seedgen generate --input args.json
npx @reneturcios/seedgen --version
```

`args.json` contains the full arguments object:

```json
{
  "seed": 42,
  "count": 3,
  "fields": [
    { "name": "id", "type": "integer", "min": 1, "max": 10 },
    { "name": "code", "type": "string", "length": 4 },
    { "name": "active", "type": "boolean" }
  ]
}
```

The generated set is printed as JSON — `{seed, count,
records}`, each record holding the declared fields in
declaration order:

```json
{
  "seed": 42,
  "count": 3,
  "records": [
    { "id": 7, "code": "lwre", "active": false },
    { "id": 3, "code": "qwmg", "active": false },
    { "id": 8, "code": "hfnr", "active": false }
  ]
}
```

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/seedgen mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "seedgen": {
      "command": "npx",
      "args": ["-y", "@reneturcios/seedgen", "mcp"]
    }
  }
}
```

### Tools

- `generate_seed_data` — Generate deterministic seed
  records from field specs and a numeric seed.
  - `seed` (integer, required) — unsigned 32-bit seed for
    the pinned PRNG
  - `count` (integer, required) — number of records to
    generate (1..1000)
  - `fields` (array, required, at least one) — field specs
    as `{name, type, ...}` objects; `name` is unique across
    the specs, `type` is one of integer, number, boolean,
    string, enum, email, date, and the remaining properties
    (`min`, `max`, `length`, `values`, `from`, `to`) tune
    the type that uses them

  Returns `{seed, count, records}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/seedgen
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/seedgen generate --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
