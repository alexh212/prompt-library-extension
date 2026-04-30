import { validateTemplate } from "../extension/core/validation.js";

test("template validation rejects missing title/body", () => {
  const result = validateTemplate({
    id: "t1",
    title: "",
    body: "",
    tags: [],
    favorite: false
  });
  expect(result.ok).toBe(false);
  expect(result.errors).toEqual(
    expect.arrayContaining(["Title is required.", "Body is required."])
  );
});
