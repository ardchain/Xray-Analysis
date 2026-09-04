chrome.action.onClicked.addListener(() => {
  const urls = ["https://x.com/i/account_analytics*"];
  const url = "https://x.com/i/account_analytics/overview";
  chrome.tabs.query({ url: urls }, tabs => {
    if (tabs[0]?.id) chrome.tabs.update(tabs[0].id, { active: true });
    else chrome.tabs.create({ url });
  });
});
