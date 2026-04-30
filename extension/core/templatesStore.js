const STORAGE_KEY = "promptLibraryStateV1";

function getStorage() {
  return chrome.storage.local;
}

export async function loadState() {
  const result = await getStorage().get(STORAGE_KEY);
  const state = result[STORAGE_KEY];
  if (!state || typeof state !== "object" || !Array.isArray(state.templates)) {
    return { templates: [] };
  }
  return state;
}

export async function saveState(state) {
  const nextState = state && typeof state === "object" ? state : { templates: [] };
  await getStorage().set({ [STORAGE_KEY]: nextState });
  return nextState;
}

export async function saveTemplates(templates) {
  return saveState({ templates: Array.isArray(templates) ? templates : [] });
}

export async function getTemplates() {
  const state = await loadState();
  return state.templates;
}

export { STORAGE_KEY };
