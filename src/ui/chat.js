import { renderMarkdown } from "./markdown.js";

export function createAssistant({
  base,
  getSession,
  getAccount,
  getCatalog,
  getSelected,
  renderCard,
  openProvider,
  notice,
}) {
  const $ = (s) => document.querySelector(s);
  let turns = [],
    aborter = null,
    generation = 0,
    account = null,
    busy = false;
  function busyState(value) {
    busy = value;
    $("#ask").disabled = value;
    $("#cancel-ai").hidden = !value;
    $("#question").readOnly = value;
    $("#scope").disabled = value;
    $("#model").disabled = value;
    $("#web-search").disabled = value;
    $("#chat-log").setAttribute("aria-busy", String(value));
  }
  function fillQuestion(text) {
    $("#question").value = text;
    $("#question").focus();
    $("#question").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function clear() {
    generation++;
    aborter?.abort();
    turns = [];
    $("#chat-log").replaceChildren();
    $("#chat-empty").hidden = false;
    $("#question").value = "";
    busyState(false);
    $("#chat-status").textContent = "Conversa nova. Pesquise em toda a rede credenciada.";
  }
  function refreshCards() {
    for (const turn of turns) renderCards(turn);
  }
  function renderCards(turn) {
    const units = [...turn.providers.values()];
    turn.cards.replaceChildren(
      ...units
        .slice(0, turn.limit)
        .map((u) => renderCard(getCatalog()?.units.find((x) => x.id === u.id) ?? u)),
    );
    turn.summary.textContent = `${units.length} prestador(es) consultado(s) nesta resposta`;
    turn.results.hidden = !units.length;
    turn.more.hidden = units.length <= turn.limit;
  }
  function addTurn(question) {
    const user = document.createElement("article");
    user.className = "chat-user";
    user.textContent = question;
    const root = document.createElement("article");
    root.className = "chat-assistant";
    const heading = document.createElement("div");
    heading.className = "chat-author";
    heading.textContent = "Cadê Doutor";
    const progress = document.createElement("p");
    progress.className = "chat-progress";
    progress.setAttribute("role", "status");
    progress.textContent = "Preparando sua pesquisa…";
    const body = document.createElement("div");
    body.className = "markdown-body";
    const trace = document.createElement("details"),
      traceSummary = document.createElement("summary"),
      traceList = document.createElement("ul");
    traceSummary.textContent = "Consultas ao catálogo";
    trace.append(traceSummary, traceList);
    trace.hidden = true;
    trace.className = "chat-trace";
    const results = document.createElement("details"),
      summary = document.createElement("summary"),
      cards = document.createElement("div"),
      more = document.createElement("button");
    results.hidden = true;
    results.open = true;
    results.className = "chat-providers";
    cards.className = "cards";
    more.type = "button";
    more.className = "secondary";
    more.textContent = "Mostrar mais prestadores";
    results.append(summary, cards, more);
    const controls = document.createElement("div");
    controls.className = "actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "secondary";
    copy.textContent = "Copiar resposta";
    copy.hidden = true;
    const turn = {
      question,
      text: "",
      state: "pending",
      providers: new Map(),
      root,
      body,
      progress,
      trace,
      traceList,
      results,
      summary,
      cards,
      more,
      copy,
      limit: 6,
    };
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(turn.text);
        notice("Resposta copiada.");
      } catch {
        notice("O navegador não permitiu copiar. Selecione o texto da resposta.");
      }
    };
    more.onclick = () => {
      turn.limit += 6;
      renderCards(turn);
    };
    controls.append(copy);
    root.append(heading, progress, trace, body, results, controls);
    $("#chat-log").append(user, root);
    $("#chat-empty").hidden = true;
    turns.push(turn);
    user.scrollIntoView({ behavior: "smooth", block: "start" });
    return turn;
  }
  async function submit(event) {
    event?.preventDefault();
    if (busy) return;
    const question = $("#question").value.trim();
    if (!question) {
      $("#question").focus();
      return;
    }
    const currentAccount = getAccount();
    if (!getSession() || !currentAccount) {
      notice("Abra Conexão, conecte o serviço local e selecione sua conta ChatGPT.");
      return;
    }
    if (!$("#model").value) {
      notice("Atualize a conexão para carregar os modelos da sua conta.");
      return;
    }
    if (account !== currentAccount) {
      clear();
      account = currentAccount;
      fillQuestion(question);
    }
    const scope = $("#scope").value,
      ids = scope === "selected" ? [...getSelected()] : [];
    if (scope === "selected" && !ids.length) {
      notice("Escolha Todo o catálogo para pesquisar sem selecionar prestadores.");
      return;
    }
    const history = turns
      .filter((t) => t.state === "completed")
      .flatMap((t) => [
        { role: "user", content: t.question },
        { role: "assistant", content: t.text },
      ]);
    const turn = addTurn(question),
      id = ++generation;
    aborter = new AbortController();
    busyState(true);
    $("#question").value = "";
    $("#chat-status").textContent =
      "Pesquisa em andamento. Você pode interromper a qualquer momento.";
    let frame = null;
    const paint = () => {
      frame = null;
      renderMarkdown(turn.body, turn.text, openProvider);
    };
    try {
      const r = await fetch(base + "/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Cade-Session": getSession() },
        body: JSON.stringify({
          question,
          history,
          scope,
          ids,
          account: currentAccount,
          model: $("#model").value,
          webSearch: $("#web-search").checked,
        }),
        signal: aborter.signal,
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error ?? "Pesquisa indisponível.");
      }
      let buffer = "",
        done = false;
      const reader = r.body.getReader(),
        decoder = new TextDecoder();
      while (true) {
        const packet = await reader.read();
        if (packet.done) break;
        if (id !== generation) {
          await reader.cancel();
          return;
        }
        buffer += decoder.decode(packet.value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (!line) continue;
          const e = JSON.parse(line);
          if (e.error) throw new Error(e.error);
          if (e.status) turn.progress.textContent = e.status;
          if (e.search) {
            const li = document.createElement("li");
            li.textContent =
              e.status +
              ` Página a partir de ${e.search.offset + 1}${e.search.nextOffset !== null ? " · há mais resultados" : ""}.`;
            turn.traceList.append(li);
            turn.trace.hidden = false;
          }
          if (e.providers) {
            for (const u of e.providers) turn.providers.set(u.id, u);
            renderCards(turn);
          }
          if (e.delta) {
            turn.text += e.delta;
            if (frame === null) frame = requestAnimationFrame(paint);
          }
          if (e.done) done = true;
        }
      }
      if (id !== generation) return;
      if (!done) throw new Error("Resposta interrompida antes da conclusão.");
      turn.state = "completed";
      turn.progress.textContent = "Pesquisa concluída. Continue a conversa para refinar.";
      $("#chat-status").textContent =
        "Faça uma pergunta complementar. O contexto desta conversa será mantido.";
    } catch (e) {
      if (id === generation) {
        turn.state = "failed";
        turn.progress.textContent =
          e.name === "AbortError"
            ? "Pesquisa interrompida. O texto parcial não foi concluído."
            : e.message;
        turn.progress.classList.add("chat-error");
        $("#chat-status").textContent =
          "Esta resposta ficou incompleta e não será usada como contexto. Você pode tentar novamente.";
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "secondary";
        retry.textContent = "Reutilizar pergunta";
        retry.onclick = () => fillQuestion(question);
        turn.root.append(retry);
      }
    } finally {
      if (frame !== null) cancelAnimationFrame(frame);
      if (id === generation) {
        paint();
        turn.copy.hidden = !turn.text;
        busyState(false);
        $("#question").focus();
      }
    }
  }
  $("#chat-form").addEventListener("submit", submit);
  $("#question").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      $("#chat-form").requestSubmit();
    }
  });
  $("#cancel-ai").onclick = () => aborter?.abort();
  $("#new-chat").onclick = clear;
  document.querySelectorAll("[data-prompt]").forEach((b) => {
    b.onclick = () => fillQuestion(b.dataset.prompt);
  });
  $("#scope").onchange = () => {
    $("#selection-wrap").hidden = $("#scope").value !== "selected";
  };
  return {
    submit,
    refreshCards,
    resetForAccount(key) {
      if (account !== key) {
        clear();
        account = key;
      }
    },
    fillQuestion,
  };
}
