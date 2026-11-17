chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    message?.type !== "open-cade-doutor" ||
    sender.id !== chrome.runtime.id ||
    !sender.tab?.id ||
    !sender.url?.startsWith("https://app.tstsaude.tst.jus.br/")
  )
    return;
  // Open synchronously from the click message to preserve Chrome's user gesture.
  const opening = chrome.sidePanel.open({ tabId: sender.tab.id });
  Promise.all([
    opening,
    chrome.storage.session.set({
      context: { specialty: String(message.specialty ?? "").slice(0, 150) },
    }),
  ]).then(
    () => respond({ ok: true }),
    () => respond({ ok: false }),
  );
  return true;
});
