// Only the public directory category is read. No cookies or patient data.
if (!document.getElementById("cade-doutor-launcher")) {
  const button = document.createElement("button");
  button.id = "cade-doutor-launcher";
  button.textContent = "＋ Cadê Doutor";
  button.style.cssText =
    "position:fixed;right:20px;bottom:20px;z-index:2147483647;padding:12px 18px;border:0;border-radius:24px;background:#174f43;color:white;font:600 14px system-ui;box-shadow:0 3px 14px #0003;cursor:pointer";
  button.title = "Pesquisar, favoritar e comparar a rede credenciada";
  button.addEventListener("click", () => {
    const match = document.body.innerText.match(
      /\d+\s+resultado\(s\)\s+para:\s*([^\n]+)/i,
    );
    chrome.runtime.sendMessage(
      { type: "open-cade-doutor", specialty: match?.[1]?.trim() ?? "" },
      (response) => {
        if (chrome.runtime.lastError || !response?.ok)
          button.textContent = "Abra o Cadê Doutor pelo ícone da extensão";
      },
    );
  });
  document.body.append(button);
}
