import { careRows, contactTone } from "../core/care.js";
export function createCare({ getCatalog, getPersonal, workspace, card, openRecord }) {
  const $ = (s) => document.querySelector(s);
  let limit = 30;
  const node = (tag, text, cls) => {
    const n = document.createElement(tag);
    n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  function render() {
    const catalog = getCatalog();
    if (!catalog) return;
    const rows = careRows(catalog, getPersonal().favorites, workspace.get(), {
      query: $("#favorite-query").value,
      view: $("#care-view").value,
      status: $("#care-status").value,
    });
    $("#care-summary").textContent =
      `${rows.length} prestadores · ${rows.filter((r) => r.favorite).length} favoritos · ${rows.reduce((n, r) => n + r.contacts.length, 0)} registros de contato`;
    $("#favorite-results").replaceChildren(
      ...rows.map((r) => {
        const el = card(r.unit, r.missing);
        const badge = node("span", r.status, "status-badge");
        badge.dataset.tone = contactTone(r.status);
        const summary = node("div", "", "care-card-summary");
        summary.append(badge);
        if (r.latest) {
          summary.append(
            node(
              "p",
              `Último contato: ${new Date(r.latest.date).toLocaleString("pt-BR")} · ${r.latest.person || r.latest.channel}`,
            ),
          );
          if (r.latest.professional)
            summary.append(node("p", "Profissional: " + r.latest.professional));
          if (r.latest.nextStep)
            summary.append(node("p", "Próximo passo: " + r.latest.nextStep));
          if (r.latest.returnAt)
            summary.append(
              node(
                "p",
                "Retorno previsto: " +
                  new Date(r.latest.returnAt).toLocaleString("pt-BR"),
              ),
            );
        }
        if (r.chats.length)
          summary.append(node("small", `${r.chats.length} conversa(s) vinculada(s)`));
        el.insertBefore(summary, el.querySelector(".actions"));
        return el;
      }),
    );
    if (!rows.length)
      $("#favorite-results").append(
        node(
          "p",
          "Nenhum prestador neste filtro. Favorite uma unidade ou registre um contato pela ficha do prestador.",
          "empty",
        ),
      );
    const records = rows
      .flatMap((r) => r.contacts)
      .sort((a, b) => b.date.localeCompare(a.date));
    $("#care-timeline").replaceChildren(
      ...records.slice(0, limit).map((c) => {
        const entry = node("article", "", "contact-entry");
        entry.dataset.tone = contactTone(c.status);
        const badge = node("span", c.status, "status-badge");
        badge.dataset.tone = contactTone(c.status);
        const b = node("button", "Abrir registro", "secondary");
        b.type = "button";
        b.onclick = () => openRecord(c);
        entry.append(
          node("strong", c.providerName),
          badge,
          node(
            "p",
            `${new Date(c.date).toLocaleString("pt-BR")} · ${c.channel}${c.person ? " · " + c.person : ""}`,
          ),
          node("p", c.note),
          b,
        );
        return entry;
      }),
    );
    if (!records.length)
      $("#care-timeline").append(
        node("p", "Nenhuma tratativa registrada neste filtro.", "muted"),
      );
    $("#care-more").hidden = records.length <= limit;
  }
  for (const selector of ["#favorite-query", "#care-view", "#care-status"])
    $(selector).addEventListener("input", () => {
      limit = 30;
      render();
    });
  $("#care-more").onclick = () => {
    limit += 30;
    render();
  };
  return { render };
}
