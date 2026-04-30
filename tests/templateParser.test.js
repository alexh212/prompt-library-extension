import { extractVariables } from "../extension/core/templateParser.js";

test("variable extraction unique + order", () => {
  const body = "Hello {{ company }}, meet {{user.name}} at {{ company }} with {{plan-tier}}.";
  expect(extractVariables(body)).toEqual(["company", "user.name", "plan-tier"]);
});
