/**
 * seedgen core: deterministic seed / fixture data generation.
 *
 *   generateSeedData({seed, count, fields}) -> {seed, count, records}
 *
 * PRNG (pinned — the mulberry32 algorithm): state a starts at
 * the seed. Each draw: a = (a + 0x6D2B79F5) as a signed 32-bit
 * integer; t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t +
 * Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; the draw is
 * ((t ^ (t >>> 14)) >>> 0) / 4294967296, a float in [0, 1).
 * Draws are consumed record by record (record 0 first), field
 * by field in the order the fields are declared. A "string"
 * field consumes one draw per character, an "email" field
 * consumes 8 draws, and every other type consumes exactly 1
 * draw per record.
 *
 * Generation per field type, given one draw r:
 * - integer: min (default 0) and max (default 100), both
 *   integers with min <= max; value =
 *   min + Math.floor(r * (max - min + 1)) — both bounds are
 *   reachable.
 * - number: min (default 0) and max (default 1) with
 *   min <= max; value =
 *   Math.round((min + r * (max - min)) * 10000) / 10000 —
 *   rounded to 4 decimal places.
 * - boolean: value = r < 0.5.
 * - string: length L (default 8, 1..64); each character is
 *   "abcdefghijklmnopqrstuvwxyz"[Math.floor(r * 26)], one draw
 *   per character.
 * - enum: value = values[Math.floor(r * values.length)].
 * - email: an 8-character local part drawn exactly like a
 *   string field (8 draws), then "@example.com".
 * - date: from/to are real calendar dates in YYYY-MM-DD form
 *   (defaults "2020-01-01" / "2020-12-31") with from <= to;
 *   with D the whole number of days from `from` to `to`, the
 *   value is `from` + Math.floor(r * (D + 1)) days, computed
 *   in UTC and formatted YYYY-MM-DD.
 *
 * Optional properties a field's type does not use are ignored
 * and not validated (a pinned spec choice): `min` on a
 * boolean field, `length` on an integer field, and so on,
 * have no effect and cannot make the input invalid.
 *
 * Validation is strict and path-naming, and total: every
 * field spec is validated before any record is generated, so
 * malformed input throws an Error naming the offending path
 * (for example "fields[1].values must be a non-empty array")
 * and no partial result is produced.
 */
import type { SeedFieldSpec, SeedGenResult } from "./types.js";

export const VERSION = "0.1.0";

const FIELD_TYPES = [
  "integer",
  "number",
  "boolean",
  "string",
  "enum",
  "email",
  "date",
] as const;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The pinned mulberry32 PRNG. `seed` is an unsigned 32-bit
 * integer; `| 0` holds it in the signed 32-bit representation
 * the algorithm's Math.imul arithmetic works in, and each
 * step keeps `a` a signed 32-bit integer exactly as pinned.
 */
function createDraw(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gregorian leap-year rule, for real-calendar-date checks. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Parse a strict YYYY-MM-DD string naming a real calendar
 * date, or return null. "2021-02-29" returns null: 2021 is
 * not a leap year.
 */
function parseDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12) return null;
  const daysInMonth = MONTH_DAYS[m - 1] + (m === 2 && isLeapYear(y) ? 1 : 0);
  if (d < 1 || d > daysInMonth) return null;
  return { y, m, d };
}

/**
 * Days from the civil epoch 1970-01-01 for a Gregorian date
 * (Howard Hinnant's days_from_civil). Pure arithmetic, valid
 * for every four-digit year — Date.UTC silently maps years
 * 0..99 onto 1900..1999, so it is not used here.
 */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400; // [0, 399]
  const mp = m > 2 ? m - 3 : m + 9; // Mar=0 .. Feb=11
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of daysFromCivil (Hinnant's civil_from_days). */
function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097; // [0, 146096]
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  ); // [0, 399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153); // Mar=0 .. Feb=11
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: m <= 2 ? y + 1 : y, m, d };
}

function formatDate(dayNumber: number): string {
  const { y, m, d } = civilFromDays(dayNumber);
  const yy = String(y).padStart(4, "0");
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** A field spec with its type's defaults resolved. */
interface NormalisedField {
  name: string;
  type: SeedFieldSpec["type"];
  min: number;
  max: number;
  length: number;
  values: string[];
  fromDay: number;
  toDay: number;
}

function validateField(raw: unknown, i: number, seen: Map<string, number>): NormalisedField {
  const path = `fields[${i}]`;
  if (!isRecord(raw)) throw new Error(`${path} must be an object`);

  if (raw.name === undefined) throw new Error(`${path}.name is required`);
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new Error(`${path}.name must be a non-empty string`);
  }
  const firstIndex = seen.get(raw.name);
  if (firstIndex !== undefined) {
    throw new Error(
      `${path}.name duplicates fields[${firstIndex}].name "${raw.name}"`,
    );
  }
  seen.set(raw.name, i);

  if (raw.type === undefined) throw new Error(`${path}.type is required`);
  if (
    typeof raw.type !== "string" ||
    !(FIELD_TYPES as readonly string[]).includes(raw.type)
  ) {
    throw new Error(
      `${path}.type must be one of "integer", "number", "boolean", "string", "enum", "email", "date"`,
    );
  }
  const type = raw.type as SeedFieldSpec["type"];

  const field: NormalisedField = {
    name: raw.name,
    type,
    min: 0,
    max: 0,
    length: 8,
    values: [],
    fromDay: 0,
    toDay: 0,
  };

  if (type === "integer" || type === "number") {
    const defaultMin = 0;
    const defaultMax = type === "integer" ? 100 : 1;
    let min = defaultMin;
    let max = defaultMax;
    if (raw.min !== undefined) {
      if (type === "integer") {
        if (typeof raw.min !== "number" || !Number.isInteger(raw.min)) {
          throw new Error(`${path}.min must be an integer`);
        }
      } else if (typeof raw.min !== "number" || !Number.isFinite(raw.min)) {
        throw new Error(`${path}.min must be a finite number`);
      }
      min = raw.min;
    }
    if (raw.max !== undefined) {
      if (type === "integer") {
        if (typeof raw.max !== "number" || !Number.isInteger(raw.max)) {
          throw new Error(`${path}.max must be an integer`);
        }
      } else if (typeof raw.max !== "number" || !Number.isFinite(raw.max)) {
        throw new Error(`${path}.max must be a finite number`);
      }
      max = raw.max;
    }
    if (min > max) throw new Error(`${path}.min must be <= ${path}.max`);
    field.min = min;
    field.max = max;
  }

  if (type === "string") {
    let length = 8;
    if (raw.length !== undefined) {
      if (
        typeof raw.length !== "number" ||
        !Number.isInteger(raw.length) ||
        raw.length < 1 ||
        raw.length > 64
      ) {
        throw new Error(`${path}.length must be an integer in 1..64`);
      }
      length = raw.length;
    }
    field.length = length;
  }

  if (type === "enum") {
    if (raw.values === undefined) {
      throw new Error(`${path}.values is required for enum fields`);
    }
    if (!Array.isArray(raw.values) || raw.values.length === 0) {
      throw new Error(`${path}.values must be a non-empty array`);
    }
    raw.values.forEach((entry, j) => {
      if (typeof entry !== "string" || entry.length === 0) {
        throw new Error(`${path}.values[${j}] must be a non-empty string`);
      }
    });
    field.values = raw.values as string[];
  }

  if (type === "date") {
    const fromRaw = raw.from === undefined ? "2020-01-01" : raw.from;
    const toRaw = raw.to === undefined ? "2020-12-31" : raw.to;
    if (typeof fromRaw !== "string" || parseDate(fromRaw) === null) {
      throw new Error(
        `${path}.from must be a real calendar date in YYYY-MM-DD form`,
      );
    }
    if (typeof toRaw !== "string" || parseDate(toRaw) === null) {
      throw new Error(
        `${path}.to must be a real calendar date in YYYY-MM-DD form`,
      );
    }
    const from = parseDate(fromRaw) as { y: number; m: number; d: number };
    const to = parseDate(toRaw) as { y: number; m: number; d: number };
    const fromDay = daysFromCivil(from.y, from.m, from.d);
    const toDay = daysFromCivil(to.y, to.m, to.d);
    if (fromDay > toDay) throw new Error(`${path}.from must be <= ${path}.to`);
    field.fromDay = fromDay;
    field.toDay = toDay;
  }

  return field;
}

/** Draw `length` lowercase characters, one draw per character. */
function drawString(draw: () => number, length: number): string {
  let out = "";
  for (let j = 0; j < length; j++) {
    out += ALPHABET[Math.floor(draw() * 26)];
  }
  return out;
}

/** Generate one field's value, consuming its pinned draws. */
function generateValue(field: NormalisedField, draw: () => number): unknown {
  switch (field.type) {
    case "integer": {
      const r = draw();
      return field.min + Math.floor(r * (field.max - field.min + 1));
    }
    case "number": {
      const r = draw();
      return Math.round((field.min + r * (field.max - field.min)) * 10000) / 10000;
    }
    case "boolean": {
      return draw() < 0.5;
    }
    case "string": {
      return drawString(draw, field.length);
    }
    case "enum": {
      const r = draw();
      return field.values[Math.floor(r * field.values.length)];
    }
    case "email": {
      return `${drawString(draw, 8)}@example.com`;
    }
    case "date": {
      const r = draw();
      const span = field.toDay - field.fromDay; // D; inclusive span D + 1
      return formatDate(field.fromDay + Math.floor(r * (span + 1)));
    }
  }
}

/**
 * Generate deterministic seed records from the full
 * arguments object. Throws an Error naming the offending
 * path on any invalid input, before anything is generated.
 */
export function generateSeedData(input: unknown): SeedGenResult {
  const args = isRecord(input) ? input : {};

  if (args.seed === undefined) throw new Error("seed is required");
  if (typeof args.seed !== "number" || !Number.isInteger(args.seed)) {
    throw new Error("seed must be an integer");
  }
  if (args.seed < 0 || args.seed > 4294967295) {
    throw new Error("seed must be in 0..4294967295");
  }
  const seed = args.seed;

  if (args.count === undefined) throw new Error("count is required");
  if (typeof args.count !== "number" || !Number.isInteger(args.count)) {
    throw new Error("count must be an integer");
  }
  if (args.count < 1 || args.count > 1000) {
    throw new Error("count must be in 1..1000");
  }
  const count = args.count;

  if (args.fields === undefined) throw new Error("fields is required");
  if (!Array.isArray(args.fields) || args.fields.length === 0) {
    throw new Error("fields must be a non-empty array");
  }
  const seen = new Map<string, number>();
  const fields = args.fields.map((raw, i) => validateField(raw, i, seen));

  const draw = createDraw(seed);
  const records: Array<Record<string, unknown>> = [];
  for (let i = 0; i < count; i++) {
    const record: Record<string, unknown> = {};
    for (const field of fields) {
      record[field.name] = generateValue(field, draw);
    }
    records.push(record);
  }
  return { seed, count, records };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
