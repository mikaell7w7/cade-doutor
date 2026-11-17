// The terminal event can omit output or provide an empty/partial snapshot.
// Accumulate streamed items first; never erase them with the terminal snapshot.
export async function consumeSSE(stream, onDelta = () => {}, onComplete = () => {}) {
  const decoder = new TextDecoder(),
    items = new Map(),
    parts = new Map(),
    sources = new Map();
  let buffer = "",
    result = "",
    completed = false,
    events = 0;
  const emit = (text) => {
    if (text) {
      result += text;
      onDelta(text);
    }
  };
  function indexOf(item, fallback) {
    for (const [index, old] of items) {
      if (
        (item.id && old.id === item.id) ||
        (item.call_id && old.call_id === item.call_id)
      )
        return index;
    }
    return fallback;
  }
  function collectSource(a) {
    if (a?.type !== "url_citation") return;
    try {
      const u = new URL(a.url);
      if (["https:", "http:"].includes(u.protocol))
        sources.set(u.href, a.title ?? u.href);
    } catch {}
  }
  function appendPart(index, contentIndex, text, delta = false) {
    if (typeof text !== "string") return;
    const key = `${index}:${contentIndex}`,
      previous = parts.get(key) ?? "";
    if (delta) {
      parts.set(key, previous + text);
      emit(text);
    } else if (text.startsWith(previous)) {
      parts.set(key, text);
      emit(text.slice(previous.length));
    }
  }
  function saveItem(item, fallback) {
    if (!item || typeof item !== "object" || !item.type) return;
    let index = indexOf(item, fallback);
    if (
      items.has(index) &&
      item.id &&
      items.get(index).id &&
      items.get(index).id !== item.id
    )
      index = Math.max(-1, ...items.keys()) + 1;
    const previous = items.get(index),
      merged = { ...previous, ...item };
    for (const key of ["arguments", "encrypted_content"])
      if (!merged[key] && previous?.[key]) merged[key] = previous[key];
    if (!item.content?.length && previous?.content?.length)
      merged.content = previous.content;
    items.set(index, merged);
    if (merged.type === "message") {
      for (const [contentIndex, part] of (merged.content ?? []).entries()) {
        if (part.type === "output_text") appendPart(index, contentIndex, part.text);
        if (part.type === "refusal") appendPart(index, contentIndex, part.refusal);
        for (const a of part.annotations ?? []) collectSource(a);
      }
    }
  }
  function packet(raw) {
    const data = raw
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const e = JSON.parse(data);
    events++;
    const index = indexOf({ id: e.item_id }, e.output_index ?? 0);
    if (["response.failed", "response.incomplete", "error"].includes(e.type)) {
      const code = e.response?.error?.code ?? e.code ?? e.type;
      throw new Error(
        [
          "subscription_sharing_usage_limit_exceeded",
          "subscription_sharing_usage_unavailable",
        ].includes(code)
          ? "Limite do plano atingido. Gerencie o uso nas configurações do ChatGPT."
          : "A resposta da IA não foi concluída.",
      );
    }
    if (["response.output_item.added", "response.output_item.done"].includes(e.type))
      saveItem(e.item, e.output_index ?? 0);
    if (
      e.type === "response.function_call_arguments.delta" ||
      e.type === "response.function_call_arguments.done"
    ) {
      const item = items.get(index);
      if (item?.type === "function_call") {
        if (e.type.endsWith(".delta") && typeof e.delta === "string")
          item.arguments = (item.arguments ?? "") + e.delta;
        if (e.type.endsWith(".done") && typeof e.arguments === "string")
          item.arguments = e.arguments;
      }
    }
    if (e.type === "response.output_text.delta" || e.type === "response.refusal.delta")
      appendPart(index, e.content_index ?? 0, e.delta, true);
    if (e.type === "response.output_text.done")
      appendPart(index, e.content_index ?? 0, e.text);
    if (e.type === "response.refusal.done")
      appendPart(index, e.content_index ?? 0, e.refusal);
    if (e.type === "response.content_part.done") {
      const part = e.part;
      if (part?.type === "output_text")
        appendPart(index, e.content_index ?? 0, part.text);
      if (part?.type === "refusal") appendPart(index, e.content_index ?? 0, part.refusal);
      for (const a of part?.annotations ?? []) collectSource(a);
    }
    if (e.type === "response.output_text.annotation.added") collectSource(e.annotation);
    if (e.type === "response.completed") {
      completed = true;
      for (const [i, item] of (e.response?.output ?? []).entries()) saveItem(item, i);
    }
  }
  function drain(final = false) {
    // Do not normalize CRLF before the full separator arrives: network chunks may split CR/LF.
    let separator;
    while ((separator = /\r?\n\r?\n/.exec(buffer))) {
      const raw = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator[0].length);
      packet(raw);
    }
    if (final && buffer.trim()) {
      packet(buffer);
      buffer = "";
    }
  }
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    drain();
  }
  buffer += decoder.decode();
  drain(true);
  if (!completed) throw new Error("A conexão terminou antes de concluir a resposta.");
  const output = [...items.entries()].sort((a, b) => a[0] - b[0]).map(([, item]) => item);
  // No callback until the entire stream has been checked for failures.
  onComplete(output, {
    events,
    calls: output.filter((i) => i.type === "function_call").length,
    reasoning: output.filter((i) => i.type === "reasoning").length,
  });
  if (sources.size)
    emit(
      "\n\nFontes consultadas:\n" +
        [...sources].map(([url, title]) => title + "\n" + url).join("\n\n"),
    );
  return result;
}
