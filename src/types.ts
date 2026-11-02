/**
 * seedgen types.
 *
 * seedgen generates deterministic seed / fixture records from
 * a numeric seed and a list of field specs. The caller
 * supplies:
 *
 *   - `seed`: an unsigned 32-bit integer feeding the pinned
 *     mulberry32 PRNG
 *   - `count`: how many records to generate (1..1000)
 *   - `fields`: the field specs, in output order; each names
 *     a field and says how its values are drawn (integer,
 *     number, boolean, string, enum, email, or date)
 *
 * and gets back `{seed, count, records}`: exactly `count`
 * record objects, each holding the declared fields in
 * declaration order. Generation is pure local computation —
 * the same seed and specs always produce the same records,
 * because the PRNG and the order its draws are consumed are
 * both pinned by the spec.
 */

/** The seven field types a spec may declare. */
export type SeedFieldType =
  | "integer"
  | "number"
  | "boolean"
  | "string"
  | "enum"
  | "email"
  | "date";

/**
 * One field spec, as supplied by the caller. Only the
 * properties the field's type uses are read; the rest are
 * ignored (and not validated).
 */
export interface SeedFieldSpec {
  /** Field name; unique across the field specs. */
  name: string;
  /** How this field's values are generated. */
  type: SeedFieldType;
  /**
   * Lower bound for integer/number fields. Integer default 0,
   * number default 0.
   */
  min?: number;
  /**
   * Upper bound for integer/number fields. Integer default
   * 100, number default 1.
   */
  max?: number;
  /** Length for string fields (1..64). Default 8. */
  length?: number;
  /** Choices for enum fields: at least one non-empty string. */
  values?: string[];
  /**
   * Earliest date for date fields, YYYY-MM-DD.
   * Default "2020-01-01".
   */
  from?: string;
  /**
   * Latest date for date fields, YYYY-MM-DD.
   * Default "2020-12-31".
   */
  to?: string;
}

/** The full generate_seed_data arguments object. */
export interface SeedGenInput {
  /** Seed for the pinned PRNG (unsigned 32-bit integer). */
  seed: number;
  /** Number of records to generate (1..1000). */
  count: number;
  /** Field specs, in output order (at least one). */
  fields: SeedFieldSpec[];
}

/** The generated seed data. */
export interface SeedGenResult {
  /** The seed the records were generated from. */
  seed: number;
  /** The number of records generated. */
  count: number;
  /**
   * Exactly `count` records; each holds the declared fields
   * in declaration order.
   */
  records: Array<Record<string, unknown>>;
}
