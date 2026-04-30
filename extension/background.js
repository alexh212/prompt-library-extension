import { getSiteAdapterForUrl } from "./core/siteAdapters.js";

function getActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0] ?? null);
}

function insertPromptIntoPage(promptText, selectors) {
  const isEditable = (element) => {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }
    return (
      element.matches("textarea") ||
      element.matches("input[type='text']") ||
      element.matches("[contenteditable='true']")
    );
  };

  const resolveTarget = () => {
    if (isEditable(document.activeElement)) {
      return document.activeElement;
    }
    for (const selector of selectors) {
      const candidate = document.querySelector(selector);
      if (isEditable(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  const target = resolveTarget();
  if (!target) {
    return { ok: false, error: "No editable chat input was found." };
  }

  if (target.matches("[contenteditable='true']")) {
    target.textContent = promptText;
  } else {
    target.value = promptText;
  }

  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.focus();
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "INSERT_PROMPT") {
    return false;
  }

  getActiveTab()
    .then((tab) => {
      if (!tab?.id || !tab.url) {
        sendResponse({ ok: false, error: "No active tab available." });
        return;
      }

      const adapter = getSiteAdapterForUrl(tab.url);
      if (!adapter) {
        sendResponse({ ok: false, error: "This site is not supported for insertion." });
        return;
      }

      return chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: insertPromptIntoPage,
          args: [message.prompt, adapter.selectors]
        })
        .then((results) => {
          const result = results?.[0]?.result;
          if (!result?.ok) {
            sendResponse({ ok: false, error: result?.error ?? "Insertion failed." });
            return;
          }
          sendResponse({ ok: true });
        });
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error?.message ?? "Unexpected insertion error." });
    });

  return true;
});
