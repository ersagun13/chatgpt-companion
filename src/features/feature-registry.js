(function defineFeatureRegistry() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const items = CC.features.items;
  CC.features.register = (item) => {
    if (!item?.id || typeof item.render !== "function") throw new TypeError("A feature needs an id and render function.");
    items.set(item.id, item);
  };
  CC.features.list = () => [...items.values()];
  CC.features.get = (id) => items.get(id) || null;
})();
