import { validateImportPayload } from "../extension/core/importExport.js";

test("import validation rejects malformed payload", () => {
  const malformed = {
    version: 2,
    exportedAt: "2026-01-01T00:00:00.000Z",
    templates: "bad"
  };
  const result = validateImportPayload(malformed);
  expect(result.ok).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
});
