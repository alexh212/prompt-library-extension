import { VARIABLE_REGEX } from "./templateParser.js";

export function renderTemplate(body, values) {
  const text = typeof body === "string" ? body : "";
  const vars = values && typeof values === "object" ? values : {};
  return text.replace(VARIABLE_REGEX, (_match, variableName) => {
    const value = vars[variableName];
    return value == null ? "" : String(value);
  });
}
