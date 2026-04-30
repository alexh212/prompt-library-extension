export function isEditableElement(element) {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  if (element.matches("textarea")) {
    return true;
  }

  if (element.matches("input[type='text']")) {
    return true;
  }

  return element.matches("[contenteditable='true']");
}

export function findInsertionTarget(doc, adapterSelectors) {
  const active = doc.activeElement;
  if (isEditableElement(active)) {
    return active;
  }

  const selectors = Array.isArray(adapterSelectors) ? adapterSelectors : [];
  for (const selector of selectors) {
    const candidate = doc.querySelector(selector);
    if (isEditableElement(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function insertTextIntoElement(target, text) {
  if (!isEditableElement(target)) {
    return false;
  }

  if (target.matches("[contenteditable='true']")) {
    target.textContent = text;
  } else {
    target.value = text;
  }

  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.focus();
  return true;
}
