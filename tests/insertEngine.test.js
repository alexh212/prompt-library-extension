import { findInsertionTarget } from "../extension/core/insertEngine.js";

test("insertion helper prefers focused editable target", () => {
  document.body.innerHTML = `
    <textarea id="preferred"></textarea>
    <textarea id="fallback"></textarea>
  `;
  const preferred = document.getElementById("preferred");
  preferred.focus();
  const target = findInsertionTarget(document, ["#fallback"]);
  expect(target).toBe(preferred);
});
