import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { renderMarkdown } from "../src/ui/markdown.js";
function target() {
  return parseHTML(
    '<html><body><div id="result"></div></body></html>',
  ).document.getElementById("result");
}
test("answers render real tables, headings, emphasis and lists", () => {
  const node = target();
  renderMarkdown(
    node,
    "## Opções\n\n**Especialidade**: Ortodontia\n\n| Clínica | Região |\n|---|---|\n| Exemplo | Guará |\n\n- Confirmar horário\n- Confirmar cobertura",
  );
  assert.equal(node.querySelector("h2").textContent, "Opções");
  assert.equal(node.querySelectorAll("table").length, 1);
  assert.equal(node.querySelectorAll("th").length, 2);
  assert.equal(node.querySelector("strong").textContent, "Especialidade");
  assert.equal(node.querySelectorAll("li").length, 2);
});
test("raw HTML, event handlers and unsafe links never become executable DOM", () => {
  const node = target();
  renderMarkdown(
    node,
    "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[Perigo](javascript:alert%281%29)\n\n![Imagem](https://tracker.example/pixel)\n\n[Seguro](https://example.org)",
  );
  assert.equal(node.querySelectorAll("script,img,iframe,style").length, 0);
  const links = [...node.querySelectorAll("a")];
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute("href"), "https://example.org/");
  assert.equal(links[0].getAttribute("rel"), "noopener noreferrer");
});
test("provider references open the exact catalog ID through a controlled action", () => {
  const node = target();
  let selected;
  renderMarkdown(node, "[Clínica](#prestador=tst-example)", (id) => (selected = id));
  const button = node.querySelector("button");
  assert(button);
  button.click();
  assert.equal(selected, "tst-example");
  assert.equal(node.querySelectorAll("a").length, 0);
});
