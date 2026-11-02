import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSeedData } from "../src/seedgen.js";

/**
 * All tests are pure local computation over inline inputs: no
 * filesystem, no network. The golden records are checked two
 * independent ways: against hardcoded constants derived from
 * the canonical published mulberry32 snippet, and against an
 * in-test reimplementation of the PRNG (written in the
 * snippet's compact form, separately from the implementation
 * in src/seedgen.ts) that rebuilds the expected records draw
 * by draw. The first raw draws are also pinned as literals.
 */

// Independent reimplementation of the pinned PRNG, in the
// canonical mulberry32 snippet form.
function referenceDraws(seed: number, n: number): number[] {
  let a = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    out.push(((t ^ (t >>> 14)) >>> 0) / 4294967296);
  }
  return out;
}

const F = {
  id: { name: "id", type: "integer", min: 1, max: 10 },
  code4: { name: "code", type: "string", length: 4 },
  active: { name: "active", type: "boolean" },
} as const;

describe("generateSeedData — PRNG pinning and golden records", () => {
  it("pins the first raw draws of the reference PRNG as literals", () => {
    assert.deepEqual(referenceDraws(42, 5), [
      0.6011037519201636,
      0.44829055899754167,
      0.8524657934904099,
      0.6697340414393693,
      0.17481389874592423,
    ]);
    assert.deepEqual(referenceDraws(0, 3), [
      0.26642920868471265,
      0.0003297457005828619,
      0.2232720274478197,
    ]);
    assert.deepEqual(referenceDraws(4294967295, 2), [
      0.8964226141106337,
      0.189478256739676,
    ]);
  });

  it("matches the hardcoded golden records for seed 42 (integer/string/boolean)", () => {
    const out = generateSeedData({
      seed: 42,
      count: 3,
      fields: [F.id, F.code4, F.active],
    });
    assert.deepEqual(out, {
      seed: 42,
      count: 3,
      records: [
        { id: 7, code: "lwre", active: false },
        { id: 3, code: "qwmg", active: false },
        { id: 8, code: "hfnr", active: false },
      ],
    });
  });

  it("matches golden records rebuilt draw-by-draw from the in-test PRNG", () => {
    // Each record consumes 1 (integer) + 4 (string) + 1
    // (boolean) = 6 draws, record by record.
    const draws = referenceDraws(42, 18);
    const alpha = "abcdefghijklmnopqrstuvwxyz";
    const expected = [];
    for (let rec = 0; rec < 3; rec++) {
      const base = rec * 6;
      const id = 1 + Math.floor(draws[base] * 10);
      let code = "";
      for (let j = 0; j < 4; j++) code += alpha[Math.floor(draws[base + 1 + j] * 26)];
      expected.push({ id, code, active: draws[base + 5] < 0.5 });
    }
    const out = generateSeedData({
      seed: 42,
      count: 3,
      fields: [F.id, F.code4, F.active],
    });
    assert.deepEqual(out.records, expected);
  });

  it("matches the hardcoded golden records for seed 7 (number/enum/email/date)", () => {
    const out = generateSeedData({
      seed: 7,
      count: 2,
      fields: [
        { name: "price", type: "number", min: 0, max: 10 },
        { name: "kind", type: "enum", values: ["red", "green", "blue"] },
        { name: "contact", type: "email" },
        { name: "day", type: "date", from: "2024-01-01", to: "2024-01-31" },
      ],
    });
    assert.deepEqual(out.records, [
      { price: 0.117, kind: "red", contact: "zsnkmgos@example.com", day: "2024-01-08" },
      { price: 1.5595, kind: "blue", contact: "nfjhnhzg@example.com", day: "2024-01-28" },
    ]);
  });

  it("is repeatable: the same input twice produces deep-equal output", () => {
    const input = {
      seed: 123456789,
      count: 25,
      fields: [
        { name: "n", type: "integer" },
        { name: "s", type: "string" },
        { name: "e", type: "email" },
        { name: "d", type: "date" },
        { name: "k", type: "enum", values: ["a", "b"] },
        { name: "b", type: "boolean" },
        { name: "x", type: "number" },
      ],
    };
    assert.deepEqual(generateSeedData(input), generateSeedData(input));
  });

  it("produces different records for a different seed", () => {
    const fields = [{ name: "s", type: "string", length: 16 }];
    const a = generateSeedData({ seed: 1, count: 4, fields });
    const b = generateSeedData({ seed: 2, count: 4, fields });
    assert.notDeepEqual(a.records, b.records);
  });

  it("accepts the boundary seeds 0 and 4294967295", () => {
    const fields = [{ name: "v", type: "integer", min: 0, max: 1000000 }];
    const zero = generateSeedData({ seed: 0, count: 1, fields });
    // First draw for seed 0 is 0.26642920868471265.
    assert.equal(zero.records[0].v, Math.floor(0.26642920868471265 * 1000001));
    const max = generateSeedData({ seed: 4294967295, count: 1, fields });
    assert.equal(max.records[0].v, Math.floor(0.8964226141106337 * 1000001));
  });
});

describe("generateSeedData — output shape and draw order", () => {
  it("echoes seed and count and produces exactly count records", () => {
    const out = generateSeedData({
      seed: 9,
      count: 17,
      fields: [{ name: "v", type: "boolean" }],
    });
    assert.equal(out.seed, 9);
    assert.equal(out.count, 17);
    assert.equal(out.records.length, 17);
  });

  it("holds the declared fields in declaration order in every record", () => {
    const out = generateSeedData({
      seed: 5,
      count: 3,
      fields: [
        { name: "zeta", type: "boolean" },
        { name: "alpha", type: "integer" },
        { name: "mid", type: "string", length: 2 },
      ],
    });
    for (const record of out.records) {
      assert.deepEqual(Object.keys(record), ["zeta", "alpha", "mid"]);
    }
  });

  it("is sensitive to field order: reordering fields changes the output", () => {
    const forward = generateSeedData({
      seed: 42,
      count: 3,
      fields: [
        { name: "n", type: "integer", min: 0, max: 1000000 },
        { name: "s", type: "string", length: 6 },
      ],
    });
    const reversed = generateSeedData({
      seed: 42,
      count: 3,
      fields: [
        { name: "s", type: "string", length: 6 },
        { name: "n", type: "integer", min: 0, max: 1000000 },
      ],
    });
    assert.notDeepEqual(forward.records, reversed.records);
  });

  it("consumes one draw per string character: a longer string shifts later fields", () => {
    const short = generateSeedData({
      seed: 42,
      count: 1,
      fields: [
        { name: "s", type: "string", length: 1 },
        { name: "n", type: "integer", min: 0, max: 100 },
      ],
    });
    const long = generateSeedData({
      seed: 42,
      count: 1,
      fields: [
        { name: "s", type: "string", length: 2 },
        { name: "n", type: "integer", min: 0, max: 100 },
      ],
    });
    // Short: n uses draw 2 (0.44829055899754167) -> 45.
    // Long: n uses draw 3 (0.8524657934904099) -> 86.
    assert.equal(short.records[0].n, 45);
    assert.equal(long.records[0].n, 86);
  });

  it("consumes exactly 8 draws for email: interchangeable with an 8-char string upstream", () => {
    const viaEmail = generateSeedData({
      seed: 99,
      count: 5,
      fields: [
        { name: "e", type: "email" },
        { name: "n", type: "integer", min: 0, max: 1000000 },
      ],
    });
    const viaString = generateSeedData({
      seed: 99,
      count: 5,
      fields: [
        { name: "e", type: "string", length: 8 },
        { name: "n", type: "integer", min: 0, max: 1000000 },
      ],
    });
    for (let i = 0; i < 5; i++) {
      assert.equal(viaEmail.records[i].n, viaString.records[i].n);
      assert.equal(
        (viaEmail.records[i].e as string).replace(/@example\.com$/, ""),
        viaString.records[i].e,
      );
    }
  });
});

describe("generateSeedData — per-type generation", () => {
  it("generates integers within the inclusive bounds, reaching both", () => {
    const out = generateSeedData({
      seed: 42,
      count: 1000,
      fields: [{ name: "v", type: "integer", min: 0, max: 1 }],
    });
    const values = out.records.map((r) => r.v as number);
    assert.ok(values.every((v) => v === 0 || v === 1));
    assert.ok(values.includes(0));
    assert.ok(values.includes(1));
    const ranged = generateSeedData({
      seed: 3,
      count: 200,
      fields: [{ name: "v", type: "integer", min: -5, max: 7 }],
    });
    assert.ok(
      ranged.records.every((r) => (r.v as number) >= -5 && (r.v as number) <= 7),
    );
  });

  it("generates the constant when integer min equals max", () => {
    const out = generateSeedData({
      seed: 42,
      count: 10,
      fields: [{ name: "v", type: "integer", min: 4, max: 4 }],
    });
    assert.ok(out.records.every((r) => r.v === 4));
  });

  it("uses the integer defaults 0..100 when bounds are omitted", () => {
    const out = generateSeedData({
      seed: 42,
      count: 100,
      fields: [{ name: "v", type: "integer" }],
    });
    assert.ok(
      out.records.every(
        (r) => Number.isInteger(r.v) && (r.v as number) >= 0 && (r.v as number) <= 100,
      ),
    );
    // First draw 0.6011037519201636 -> floor(0.6011... * 101) = 60.
    assert.equal(out.records[0].v, 60);
  });

  it("generates numbers within range, rounded to 4 decimal places", () => {
    const out = generateSeedData({
      seed: 42,
      count: 500,
      fields: [{ name: "v", type: "number", min: -2.5, max: 3.75 }],
    });
    for (const record of out.records) {
      const v = record.v as number;
      assert.ok(v >= -2.5 && v <= 3.75);
      assert.ok(Math.abs(v * 10000 - Math.round(v * 10000)) < 1e-9);
    }
  });

  it("uses the number defaults 0..1 when bounds are omitted", () => {
    const out = generateSeedData({
      seed: 42,
      count: 50,
      fields: [{ name: "v", type: "number" }],
    });
    assert.ok(out.records.every((r) => (r.v as number) >= 0 && (r.v as number) <= 1));
  });

  it("generates booleans, both values appearing over many records", () => {
    const out = generateSeedData({
      seed: 42,
      count: 1000,
      fields: [{ name: "v", type: "boolean" }],
    });
    assert.ok(out.records.every((r) => typeof r.v === "boolean"));
    assert.ok(out.records.some((r) => r.v === true));
    assert.ok(out.records.some((r) => r.v === false));
  });

  it("generates strings over the lowercase alphabet at the declared length", () => {
    const out = generateSeedData({
      seed: 42,
      count: 100,
      fields: [{ name: "v", type: "string", length: 12 }],
    });
    assert.ok(out.records.every((r) => /^[a-z]{12}$/.test(r.v as string)));
  });

  it("uses the string default length 8 and honours the bounds 1 and 64", () => {
    const dflt = generateSeedData({
      seed: 1,
      count: 5,
      fields: [{ name: "v", type: "string" }],
    });
    assert.ok(dflt.records.every((r) => (r.v as string).length === 8));
    const one = generateSeedData({
      seed: 1,
      count: 5,
      fields: [{ name: "v", type: "string", length: 1 }],
    });
    assert.ok(one.records.every((r) => (r.v as string).length === 1));
    const max = generateSeedData({
      seed: 1,
      count: 5,
      fields: [{ name: "v", type: "string", length: 64 }],
    });
    assert.ok(max.records.every((r) => (r.v as string).length === 64));
  });

  it("generates enum values only from the declared choices", () => {
    const values = ["red", "green", "blue"];
    const out = generateSeedData({
      seed: 42,
      count: 300,
      fields: [{ name: "v", type: "enum", values }],
    });
    assert.ok(out.records.every((r) => values.includes(r.v as string)));
    assert.ok(new Set(out.records.map((r) => r.v)).size > 1);
  });

  it("generates a single-choice enum constantly", () => {
    const out = generateSeedData({
      seed: 42,
      count: 10,
      fields: [{ name: "v", type: "enum", values: ["only"] }],
    });
    assert.ok(out.records.every((r) => r.v === "only"));
  });

  it("generates emails with an 8-letter local part at @example.com", () => {
    const out = generateSeedData({
      seed: 42,
      count: 100,
      fields: [{ name: "v", type: "email" }],
    });
    assert.ok(
      out.records.every((r) => /^[a-z]{8}@example\.com$/.test(r.v as string)),
    );
  });

  it("generates dates inside the range, formatted YYYY-MM-DD", () => {
    const out = generateSeedData({
      seed: 42,
      count: 500,
      fields: [{ name: "v", type: "date", from: "2023-06-15", to: "2023-06-20" }],
    });
    for (const record of out.records) {
      const v = record.v as string;
      assert.match(v, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(v >= "2023-06-15" && v <= "2023-06-20");
    }
  });

  it("generates the constant date when from equals to, including a leap day", () => {
    const out = generateSeedData({
      seed: 42,
      count: 5,
      fields: [{ name: "v", type: "date", from: "2024-02-29", to: "2024-02-29" }],
    });
    assert.ok(out.records.every((r) => r.v === "2024-02-29"));
  });

  it("uses the date defaults covering 2020 when from/to are omitted", () => {
    const out = generateSeedData({
      seed: 42,
      count: 200,
      fields: [{ name: "v", type: "date" }],
    });
    assert.ok(
      out.records.every((r) => {
        const v = r.v as string;
        return v >= "2020-01-01" && v <= "2020-12-31";
      }),
    );
  });

  it("crosses month and year boundaries correctly inside a range", () => {
    const out = generateSeedData({
      seed: 42,
      count: 1000,
      fields: [{ name: "v", type: "date", from: "2019-12-30", to: "2020-01-02" }],
    });
    const allowed = new Set(["2019-12-30", "2019-12-31", "2020-01-01", "2020-01-02"]);
    assert.ok(out.records.every((r) => allowed.has(r.v as string)));
    assert.ok(new Set(out.records.map((r) => r.v)).size > 1);
  });
});

describe("generateSeedData — properties a type does not use are ignored", () => {
  it("ignores min/max/length/values/from/to on a boolean field, even malformed ones", () => {
    const out = generateSeedData({
      seed: 42,
      count: 3,
      fields: [
        {
          name: "v",
          type: "boolean",
          min: "junk",
          max: null,
          length: 999,
          values: [],
          from: "not-a-date",
          to: 42,
        },
      ],
    });
    assert.ok(out.records.every((r) => typeof r.v === "boolean"));
  });

  it("ignores an inverted min/max on a string field and a bad length on an integer field", () => {
    const s = generateSeedData({
      seed: 42,
      count: 2,
      fields: [{ name: "v", type: "string", length: 3, min: 10, max: 1 }],
    });
    assert.ok(s.records.every((r) => (r.v as string).length === 3));
    const n = generateSeedData({
      seed: 42,
      count: 2,
      fields: [{ name: "v", type: "integer", length: 0, values: "junk" }],
    });
    assert.ok(n.records.every((r) => Number.isInteger(r.v)));
  });

  it("ignores length on an email field: the local part is always 8 characters", () => {
    const out = generateSeedData({
      seed: 42,
      count: 5,
      fields: [{ name: "v", type: "email", length: 2 }],
    });
    assert.ok(
      out.records.every((r) => /^[a-z]{8}@example\.com$/.test(r.v as string)),
    );
  });
});

describe("generateSeedData — validation", () => {
  const okFields = [{ name: "v", type: "boolean" }];

  it("rejects a missing, non-integer, or out-of-range seed, naming the path", () => {
    assert.throws(() => generateSeedData({ count: 1, fields: okFields }), /seed is required/);
    assert.throws(
      () => generateSeedData({ seed: 1.5, count: 1, fields: okFields }),
      /seed must be an integer/,
    );
    assert.throws(
      () => generateSeedData({ seed: "42", count: 1, fields: okFields }),
      /seed must be an integer/,
    );
    assert.throws(
      () => generateSeedData({ seed: true, count: 1, fields: okFields }),
      /seed must be an integer/,
    );
    assert.throws(
      () => generateSeedData({ seed: -1, count: 1, fields: okFields }),
      /seed must be in 0\.\.4294967295/,
    );
    assert.throws(
      () => generateSeedData({ seed: 4294967296, count: 1, fields: okFields }),
      /seed must be in 0\.\.4294967295/,
    );
    assert.throws(() => generateSeedData(null), /seed is required/);
  });

  it("rejects a missing, non-integer, or out-of-range count, naming the path", () => {
    assert.throws(() => generateSeedData({ seed: 1, fields: okFields }), /count is required/);
    assert.throws(
      () => generateSeedData({ seed: 1, count: 2.5, fields: okFields }),
      /count must be an integer/,
    );
    assert.throws(
      () => generateSeedData({ seed: 1, count: "3", fields: okFields }),
      /count must be an integer/,
    );
    assert.throws(
      () => generateSeedData({ seed: 1, count: 0, fields: okFields }),
      /count must be in 1\.\.1000/,
    );
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1001, fields: okFields }),
      /count must be in 1\.\.1000/,
    );
  });

  it("rejects missing, empty, or non-array fields, naming the path", () => {
    assert.throws(() => generateSeedData({ seed: 1, count: 1 }), /fields is required/);
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1, fields: [] }),
      /fields must be a non-empty array/,
    );
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1, fields: "nope" }),
      /fields must be a non-empty array/,
    );
  });

  it("rejects a field entry that is not an object, naming the path", () => {
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1, fields: [42] }),
      /fields\[0\] must be an object/,
    );
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1, fields: [{ name: "a", type: "boolean" }, null] }),
      /fields\[1\] must be an object/,
    );
  });

  it("rejects a missing, empty, or non-string field name, naming the path", () => {
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1, fields: [{ type: "boolean" }] }),
      /fields\[0\]\.name is required/,
    );
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1, fields: [{ name: "", type: "boolean" }] }),
      /fields\[0\]\.name must be a non-empty string/,
    );
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1, fields: [{ name: 7, type: "boolean" }] }),
      /fields\[0\]\.name must be a non-empty string/,
    );
  });

  it("rejects a duplicate field name, naming the second occurrence's path", () => {
    assert.throws(
      () =>
        generateSeedData({
          seed: 1,
          count: 1,
          fields: [
            { name: "a", type: "boolean" },
            { name: "b", type: "boolean" },
            { name: "a", type: "integer" },
          ],
        }),
      /fields\[2\]\.name duplicates fields\[0\]\.name "a"/,
    );
  });

  it("rejects a missing or unknown field type, naming the path", () => {
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1, fields: [{ name: "v" }] }),
      /fields\[0\]\.type is required/,
    );
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1, fields: [{ name: "v", type: "uuid" }] }),
      /fields\[0\]\.type must be one of/,
    );
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1, fields: [{ name: "v", type: 3 }] }),
      /fields\[0\]\.type must be one of/,
    );
  });

  it("rejects non-integer integer bounds and min > max, naming the path", () => {
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "integer", min: 0.5 }],
        }),
      /fields\[0\]\.min must be an integer/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "integer", max: "10" }],
        }),
      /fields\[0\]\.max must be an integer/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "integer", min: 10, max: 9 }],
        }),
      /fields\[0\]\.min must be <= fields\[0\]\.max/,
    );
    // A lone min above the default max is likewise inverted.
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "integer", min: 200 }],
        }),
      /fields\[0\]\.min must be <= fields\[0\]\.max/,
    );
  });

  it("rejects non-finite number bounds and min > max, naming the path", () => {
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "number", min: Number.NaN }],
        }),
      /fields\[0\]\.min must be a finite number/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "number", max: Number.POSITIVE_INFINITY }],
        }),
      /fields\[0\]\.max must be a finite number/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "number", min: "0" }],
        }),
      /fields\[0\]\.min must be a finite number/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "number", min: 2, max: 1 }],
        }),
      /fields\[0\]\.min must be <= fields\[0\]\.max/,
    );
  });

  it("rejects a length outside 1..64 or non-integer on a string field, naming the path", () => {
    for (const length of [0, 65, 2.5, "8"]) {
      assert.throws(
        () =>
          generateSeedData({
            seed: 1, count: 1,
            fields: [{ name: "v", type: "string", length }],
          }),
        /fields\[0\]\.length must be an integer in 1\.\.64/,
      );
    }
  });

  it("rejects enum values missing, non-array, empty, or holding bad entries, naming the path", () => {
    assert.throws(
      () => generateSeedData({ seed: 1, count: 1, fields: [{ name: "v", type: "enum" }] }),
      /fields\[0\]\.values is required for enum fields/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "enum", values: "red" }],
        }),
      /fields\[0\]\.values must be a non-empty array/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "enum", values: [] }],
        }),
      /fields\[0\]\.values must be a non-empty array/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "enum", values: ["ok", ""] }],
        }),
      /fields\[0\]\.values\[1\] must be a non-empty string/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "enum", values: [42] }],
        }),
      /fields\[0\]\.values\[0\] must be a non-empty string/,
    );
  });

  it("rejects malformed or non-calendar dates, naming the path", () => {
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "date", from: "2021-02-29" }],
        }),
      /fields\[0\]\.from must be a real calendar date in YYYY-MM-DD form/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "date", to: "2020-13-01" }],
        }),
      /fields\[0\]\.to must be a real calendar date in YYYY-MM-DD form/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "date", from: "2020/01/01" }],
        }),
      /fields\[0\]\.from must be a real calendar date in YYYY-MM-DD form/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "date", from: 20200101 }],
        }),
      /fields\[0\]\.from must be a real calendar date in YYYY-MM-DD form/,
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "date", to: "2020-04-31" }],
        }),
      /fields\[0\]\.to must be a real calendar date in YYYY-MM-DD form/,
    );
  });

  it("rejects a date range with from after to, naming the path", () => {
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "date", from: "2024-05-02", to: "2024-05-01" }],
        }),
      /fields\[0\]\.from must be <= fields\[0\]\.to/,
    );
  });

  it("accepts real leap dates and validates every field before generating anything", () => {
    assert.doesNotThrow(() =>
      generateSeedData({
        seed: 1, count: 1,
        fields: [{ name: "v", type: "date", from: "2020-02-29", to: "2020-03-01" }],
      }),
    );
    // 2000 is a leap year (divisible by 400); 1900 was not.
    assert.doesNotThrow(() =>
      generateSeedData({
        seed: 1, count: 1,
        fields: [{ name: "v", type: "date", from: "2000-02-29", to: "2000-02-29" }],
      }),
    );
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 1,
          fields: [{ name: "v", type: "date", from: "1900-02-29" }],
        }),
      /fields\[0\]\.from must be a real calendar date/,
    );
    // A bad second field must throw even though the first is
    // fine: no partial results on invalid input.
    assert.throws(
      () =>
        generateSeedData({
          seed: 1, count: 5,
          fields: [
            { name: "good", type: "integer" },
            { name: "bad", type: "enum", values: [] },
          ],
        }),
      /fields\[1\]\.values must be a non-empty array/,
    );
  });
});
