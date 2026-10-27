(function defineModels() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  CC.models = {
    keys: { settings: "cc-settings-v1", folders: "cc-folders-v1", tags: "cc-tags-v1", chatMeta: "cc-chat-meta-v1", historyCatalog: "cc-history-catalog-v1", prompts: "cc-prompts-v1", chains: "cc-chains-v1", bookmarks: "cc-bookmarks-v1", labels: "cc-message-labels-v1", searchHistory: "cc-search-history-v1", usage: "cc-usage-v1", mediaFavorites: "cc-media-favorites-v1", tagRules: "cc-tag-rules-v1", job: "cc-operation-job-v1" },
    defaultSettings: { locale: "tr", showArchived: true, confirmBulkDelete: true, theme: "midnight", indexChatHistory: false, contextEstimate: true, collapsibleMessages: true, wordCounter: true, soundAlert: false, nativeFolderShortcuts: true }
  };
})();
