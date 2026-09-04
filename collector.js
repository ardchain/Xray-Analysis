(() => {
  const MESSAGE = "x-analytics-engagement-types";
  const keyFor = item => [
    item.engagement_type || item.metric_type || "",
    item.timestamp || item.date || "",
    item.count ?? item.value ?? item.metric ?? "",
    item.is_engaging_user_verified ?? item.is_user_verified ?? item.user_is_verified ?? item.user_verified ?? item.verified ?? "",
  ].join("|");
  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== MESSAGE || !Array.isArray(event.data.items)) return;
    chrome.storage.local.get({ records: [], updatedAt: 0 }, current => {
      const map = new Map(current.records.map(item => [keyFor(item), item]));
      event.data.items.forEach(item => map.set(keyFor(item), item));
      const records = [...map.values()].slice(-20000);
      chrome.storage.local.set({ records, updatedAt: Date.now(), sourceUrl: location.href });
    });
  });
})();
