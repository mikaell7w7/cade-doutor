// Runs on the local companion page, never inside the MV3 extension.
import { searchUnits, distanceKm } from "../core/catalog.js";
const $ = (s) => document.querySelector(s);
let session = sessionStorage.getItem("cade-session"),
  catalog,
  origin,
  map,
  limit = 20,
  places = new Map(),
  markers = new Map(),
  routes = new Map();
const notice = (t) => {
  $("#notice").textContent = t;
};
const action = (fn) => async () => {
  try {
    await fn();
  } catch (e) {
    notice(e.message);
  }
};
async function api(path, body) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Cade-Session": session ?? "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Consulta indisponível.");
  return d;
}
function button(text, fn) {
  const b = document.createElement("button");
  b.className = "secondary";
  b.textContent = text;
  b.onclick = action(fn);
  return b;
}
function safeLink(text, url) {
  const a = document.createElement("a");
  a.textContent = text;
  try {
    const u = new URL(url);
    if (u.protocol === "https:") {
      a.href = u.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
  } catch {}
  return a;
}
async function load() {
  const key = await api("map-key");
  catalog = await api("catalog");
  $("#pair-panel").hidden = true;
  render();
  if (key.key && !map) {
    await new Promise((resolve, reject) => {
      window.cadeMapReady = resolve;
      const s = document.createElement("script");
      const u = new URL("https://maps.googleapis.com/maps/api/js");
      u.search = new URLSearchParams({
        key: key.key,
        callback: "cadeMapReady",
        loading: "async",
        v: "quarterly",
        language: "pt-BR",
        region: "BR",
      });
      s.src = u.href;
      s.onerror = () =>
        reject(new Error("Não foi possível carregar o mapa Google."));
      document.head.append(s);
    });
    map = new google.maps.Map($("#map"), {
      center: { lat: -15.8, lng: -47.9 },
      zoom: 9,
      mapTypeControl: false,
      streetViewControl: false,
    });
    if (origin) map.setCenter(origin);
    render();
  }
}
function setOrigin(point, label) {
  origin = point;
  routes.clear();
  $("#origin-label").textContent = "Partindo de: " + label;
  $("#origin-options").replaceChildren();
  if (map) {
    map.setCenter(point);
    map.setZoom(12);
  }
  render();
}
function render() {
  if (!catalog) return;
  const rows = searchUnits(catalog, {
    query: $("#query").value,
    type: $("#type").value,
  });
  const metric = (u) => {
    const p = places.get(u.id);
    if (!p) return Infinity;
    const mode = $("#sort").value;
    if (mode === "rating") return -(p.rating ?? -1);
    if (mode === "reviews") return -(p.userRatingCount ?? -1);
    return origin
      ? distanceKm(origin, {
          lat: p.location.latitude,
          lng: p.location.longitude,
        })
      : 0;
  };
  rows.sort(
    (a, b) => metric(a) - metric(b) || a.name.localeCompare(b.name, "pt-BR"),
  );
  const shown = new Set(rows.map((u) => u.id));
  for (const [id, marker] of markers) marker.setMap(shown.has(id) ? map : null);
  $("#count").textContent = rows.length + " unidades no filtro";
  $("#coverage").textContent =
    rows.filter((u) => places.has(u.id)).length +
    " de " +
    rows.length +
    " unidades do filtro confirmadas no mapa. Resultados Google consultados nesta sessão, sem gravação em arquivo.";
  $("#more").hidden = rows.length <= limit;
  $("#map-results").replaceChildren(
    ...rows.slice(0, limit).map((u) => {
      const el = document.createElement("article");
      el.className = "card";
      const title = document.createElement("h3");
      title.textContent = u.name;
      const address = document.createElement("p");
      address.textContent = u.address;
      el.append(title, address);
      const p = places.get(u.id);
      if (p) {
        const line = document.createElement("p"),
          dist = origin
            ? distanceKm(origin, {
                lat: p.location.latitude,
                lng: p.location.longitude,
              })
            : null;
        line.textContent =
          (p.rating === undefined
            ? "Sem nota no Google"
            : p.rating +
              " ★ · " +
              (p.userRatingCount ?? 0) +
              " avaliações no Google") +
          (dist === null ? "" : " · " + dist.toFixed(1) + " km em linha reta");
        el.append(
          line,
          safeLink("Ver ficha no Google Maps ↗", p.googleMapsUri),
        );
        for (const attribution of p.attributions ?? [])
          el.append(
            safeLink(
              attribution.provider ?? "Fonte Google",
              attribution.providerUri ?? "https://maps.google.com/",
            ),
          );
        const route = routes.get(u.id);
        if (route) {
          const text = document.createElement("p");
          text.textContent =
            (route.distanceMeters / 1000).toFixed(1) +
            " km de carro · " +
            Math.ceil(parseFloat(route.duration) / 60) +
            " min estimados · consulta " +
            new Date(route.checkedAt).toLocaleTimeString("pt-BR");
          el.append(text);
        }
        el.append(
          button("Calcular rota de carro", async () => {
            if (!origin) throw new Error("Defina a origem primeiro.");
            routes.set(
              u.id,
              await api("route", {
                origin,
                destination: {
                  lat: p.location.latitude,
                  lng: p.location.longitude,
                },
              }),
            );
            render();
          }),
        );
      }
      el.append(
        button(
          p ? "Revisar correspondência" : "Localizar e conferir no Google",
          async () => {
            if (!map)
              throw new Error(
                "Configure e carregue o mapa Google antes de consultar fichas.",
              );
            const options = await api("place", { id: u.id });
            const box = document.createElement("div");
            box.className = "panel";
            const text = document.createElement("p");
            text.textContent = options.length
              ? "Confira nome, endereço e telefone. Selecione somente a mesma unidade."
              : "Nenhum resultado correspondente.";
            box.append(text);
            for (const candidate of options) {
              if (!candidate.location) continue;
              const item = document.createElement("p");
              item.textContent = [
                candidate.displayName?.text,
                candidate.formattedAddress,
                candidate.nationalPhoneNumber,
              ]
                .filter(Boolean)
                .join(" · ");
              box.append(
                item,
                button("Confirmar esta unidade", () => {
                  places.set(u.id, candidate);
                  routes.delete(u.id);
                  markers.get(u.id)?.setMap(null);
                  const point = {
                      lat: candidate.location.latitude,
                      lng: candidate.location.longitude,
                    },
                    marker = new google.maps.Marker({
                      position: point,
                      map,
                      title: u.name,
                    });
                  markers.set(u.id, marker);
                  marker.addListener("click", () => {
                    notice(u.name + " · " + candidate.formattedAddress);
                    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  });
                  map.setCenter(point);
                  map.setZoom(13);
                  render();
                }),
              );
            }
            el.append(box);
          },
        ),
      );
      return el;
    }),
  );
}
$("#pair").onclick = action(async () => {
  const r = await fetch("/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: $("#pair-code").value.trim() }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  session = d.session;
  sessionStorage.setItem("cade-session", session);
  $("#pair-code").value = "";
  await load();
});
$("#find-origin").onclick = action(async () => {
  const rows = await api("geocode", { address: $("#origin").value });
  $("#origin-options").replaceChildren(
    ...rows.map((r) =>
      button(
        r.address +
          (r.partial ? " (resultado parcial)" : "") +
          " · " +
          r.precision,
        () => setOrigin(r.location, r.address),
      ),
    ),
  );
  notice(
    "Escolha o endereço de origem. Um CEP pode indicar apenas o centro aproximado da região.",
  );
});
$("#locate").onclick = () =>
  navigator.geolocation.getCurrentPosition(
    (p) => {
      setOrigin(
        { lat: p.coords.latitude, lng: p.coords.longitude },
        "Localização do navegador (precisão aproximada " +
          Math.round(p.coords.accuracy) +
          " m)",
      );
      notice(
        "Localização mantida em memória. O cálculo de rotas envia a origem ao Google.",
      );
    },
    () =>
      notice(
        "Localização não autorizada ou indisponível. Informe CEP ou endereço.",
      ),
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
  );
for (const id of ["#query", "#type", "#sort"])
  $(id).addEventListener("input", () => {
    limit = 20;
    render();
  });
$("#more").onclick = () => {
  limit += 20;
  render();
};
if (session) load().catch((e) => notice(e.message));
