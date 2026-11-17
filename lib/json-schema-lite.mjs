// A deliberately small JSON Schema checker for the subset this project
// declares on its MCP tools: type, const, enum, properties, required,
// additionalProperties: false, items, minimum and maximum.
//
// The same function enforces tool arguments at runtime and checks tool
// results against their declared output schemas in tests and evaluations, so
// the published schema and the enforced behavior cannot drift apart.

const typeOf = (value) => value === null ? "null" : Array.isArray(value) ? "array"
  : Number.isInteger(value) ? "integer" : typeof value;

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  return actual === expected;
}

const list = (values) => values.map((value) => JSON.stringify(value)).join(", ");

/**
 * @param {Record<string, unknown>} schema
 * @param {unknown} value
 * @param {string} [path]
 * @returns {string[]} Human-readable problems. Empty when the value conforms.
 */
export function validateJsonSchema(schema, value, path = "value") {
  const problems = [];
  if (!schema || typeof schema !== "object") return problems;

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((expected) => matchesType(value, expected))) {
      problems.push(`${path} must be ${allowed.length === 1 ? `of type ${allowed[0]}` : `one of the types ${allowed.join(", ")}`}`);
      return problems;
    }
  }
  if ("const" in schema && value !== schema.const) problems.push(`${path} must equal ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) problems.push(`${path} must be one of ${list(schema.enum)}`);

  if (typeof value === "number") {
    const { minimum, maximum } = schema;
    const low = typeof minimum === "number" && value < minimum;
    const high = typeof maximum === "number" && value > maximum;
    if (low || high) {
      problems.push(typeof minimum === "number" && typeof maximum === "number"
        ? `${path} must be between ${minimum} and ${maximum}`
        : low ? `${path} must be at least ${minimum}` : `${path} must be at most ${maximum}`);
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    for (const key of Array.isArray(schema.required) ? schema.required : []) {
      if (!(key in value)) problems.push(`${path}.${key} is required`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key in properties) problems.push(...validateJsonSchema(properties[key], child, `${path}.${key}`));
      else if (schema.additionalProperties === false) problems.push(`${path}.${key} is not an accepted property`);
    }
  }

  if (Array.isArray(value) && schema.items && typeof schema.items === "object") {
    value.forEach((item, index) => problems.push(...validateJsonSchema(schema.items, item, `${path}[${index}]`)));
  }
  return problems;
}
