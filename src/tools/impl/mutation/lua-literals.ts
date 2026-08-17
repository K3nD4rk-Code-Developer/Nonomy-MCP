/** Shared helpers for rendering JS values as Lua literals in generated probe code. */

export function luaStringLiteral(value: string): string {
  return JSON.stringify(value);
}

export type SimpleValue = string | number | boolean | null;

/** Render a plain JSON-ish value (string/number/boolean/null) as a Lua literal. */
export function jsValueToLuaLiteral(value: SimpleValue): string {
  if (value === null) return "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Numeric value must be finite.");
    }
    return String(value);
  }
  return luaStringLiteral(value);
}
