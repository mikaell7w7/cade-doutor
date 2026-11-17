import { marked } from "marked";

// Build DOM nodes from Markdown tokens. Never interpret model-supplied HTML.
export function renderMarkdown(target, text, openProvider = () => {}) {
  const doc = target.ownerDocument;
  const element = (tag, children = []) => {
    const node = doc.createElement(tag);
    node.append(...children);
    return node;
  };
  const literal = (value) => doc.createTextNode(String(value ?? ""));
  function inline(tokens = []) {
    return tokens.flatMap((t) => {
      if (["strong", "em", "del"].includes(t.type))
        return [element(t.type, inline(t.tokens))];
      if (t.type === "codespan") return [element("code", [literal(t.text)])];
      if (t.type === "br") return [element("br")];
      if (t.type === "link") {
        const children = inline(t.tokens),
          href = t.href ?? "",
          match = href.match(/^#prestador=([a-zA-Z0-9_-]{8,80})$/);
        if (match) {
          const b = element("button", children);
          b.type = "button";
          b.className = "provider-link";
          b.addEventListener("click", () => openProvider(match[1]));
          return [b];
        }
        try {
          const url = new URL(href);
          if (["https:", "http:"].includes(url.protocol)) {
            const a = element("a", children);
            a.href = url.href;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            return [a];
          }
        } catch {}
        return children.length ? children : [literal(t.text)];
      }
      if (t.type === "image") return [literal(t.text)];
      if (t.tokens) return inline(t.tokens);
      return [literal(t.text ?? t.raw)];
    });
  }
  function blocks(tokens = []) {
    return tokens.flatMap((t) => {
      if (t.type === "space") return [];
      if (t.type === "heading")
        return [element("h" + Math.min(6, Math.max(2, t.depth)), inline(t.tokens))];
      if (t.type === "paragraph" || t.type === "text")
        return [element("p", t.tokens ? inline(t.tokens) : [literal(t.text)])];
      if (t.type === "code")
        return [element("pre", [element("code", [literal(t.text)])])];
      if (t.type === "blockquote") return [element("blockquote", blocks(t.tokens))];
      if (t.type === "hr") return [element("hr")];
      if (t.type === "list") {
        const list = element(
          t.ordered ? "ol" : "ul",
          t.items.map((item) => element("li", blocks(item.tokens))),
        );
        if (t.ordered && Number.isInteger(t.start)) list.start = t.start;
        return [list];
      }
      if (t.type === "table") {
        const row = (cells, tag) =>
          element(
            "tr",
            cells.map((c) => element(tag, inline(c.tokens))),
          );
        const table = element("table", [
          element("thead", [row(t.header, "th")]),
          element(
            "tbody",
            t.rows.map((r) => row(r, "td")),
          ),
        ]);
        const wrap = element("div", [table]);
        wrap.className = "table-scroll";
        wrap.tabIndex = 0;
        wrap.setAttribute("role", "region");
        wrap.setAttribute("aria-label", "Tabela da resposta");
        return [wrap];
      }
      return [literal(t.raw ?? t.text)];
    });
  }
  target.replaceChildren(...blocks(marked.lexer(text, { gfm: true, breaks: true })));
}
