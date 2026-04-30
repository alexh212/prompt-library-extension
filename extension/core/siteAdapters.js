const ADAPTERS = [
  {
    matches: ["chatgpt.com", "chat.openai.com"],
    selectors: ["#prompt-textarea", "textarea", "[contenteditable='true']", "input[type='text']"]
  },
  {
    matches: ["claude.ai"],
    selectors: ["div[contenteditable='true']", "textarea", "input[type='text']"]
  },
  {
    matches: ["gemini.google.com"],
    selectors: ["rich-textarea div[contenteditable='true']", "textarea", "input[type='text']"]
  }
];

export function getSiteAdapterForUrl(url) {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  return (
    ADAPTERS.find((adapter) => adapter.matches.some((domain) => hostname === domain)) ?? null
  );
}

export function getAllSupportedDomains() {
  return ADAPTERS.flatMap((adapter) => adapter.matches);
}
