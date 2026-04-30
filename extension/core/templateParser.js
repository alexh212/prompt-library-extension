const VARIABLE_REGEX = /{{\s*([A-Za-z0-9_.-]+)\s*}}/g;

export function extractVariables(body) {
  const text = typeof body === "string" ? body : "";
  const seen = new Set();
  const ordered = [];
  let match = VARIABLE_REGEX.exec(text);

  while (match) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
    match = VARIABLE_REGEX.exec(text);
  }

  VARIABLE_REGEX.lastIndex = 0;
  return ordered;
}

export { VARIABLE_REGEX };
