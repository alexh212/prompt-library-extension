import { renderTemplate } from "../extension/core/templateRenderer.js";

test("variable rendering replacement", () => {
  const template = "Write outreach to {{company}} for {{persona}}.";
  const rendered = renderTemplate(template, {
    company: "Acme",
    persona: "CTO"
  });
  expect(rendered).toBe("Write outreach to Acme for CTO.");
});
