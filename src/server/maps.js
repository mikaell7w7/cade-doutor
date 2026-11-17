// Google data is returned on demand and is never persisted in catalog snapshots.
export class Maps {
  constructor(key, fetchFn = fetch) {
    this.key = key;
    this.fetch = fetchFn;
  }
  async request(path, params) {
    if (!this.key)
      throw new Error(
        "Configure GOOGLE_MAPS_SERVER_KEY para consultar localização e rotas.",
      );
    const url = new URL(path, "https://maps.googleapis.com");
    for (const [k, v] of Object.entries({ ...params, key: this.key }))
      url.searchParams.set(k, v);
    const r = await this.fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error("Falha no serviço de mapas.");
    const d = await r.json();
    if (d.status !== "OK")
      throw new Error(
        d.status === "ZERO_RESULTS"
          ? "Endereço não localizado."
          : "O serviço de mapas não autorizou a consulta.",
      );
    return d;
  }
  async geocode(address) {
    if (
      typeof address !== "string" ||
      address.length < 3 ||
      address.length > 500
    )
      throw new Error("Informe um endereço ou CEP.");
    const d = await this.request("/maps/api/geocode/json", {
      address,
      region: "br",
      language: "pt-BR",
    });
    return d.results
      .slice(0, 5)
      .map((r) => ({
        placeId: r.place_id,
        address: r.formatted_address,
        location: r.geometry.location,
        precision: r.geometry.location_type,
        partial: !!r.partial_match,
      }));
  }
  async place(query) {
    if (!this.key)
      throw new Error(
        "Configure GOOGLE_MAPS_SERVER_KEY para consultar avaliações.",
      );
    const r = await this.fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.key,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.googleMapsUri,places.location,places.attributions",
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: "pt-BR",
          regionCode: "BR",
          pageSize: 3,
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok) throw new Error("Consulta Google Places indisponível.");
    return (await r.json()).places ?? [];
  }
  async route(origin, destination) {
    if (!this.key)
      throw new Error("Configure GOOGLE_MAPS_SERVER_KEY para consultar rotas.");
    const valid = (p) =>
      p &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lng) <= 180;
    if (!valid(origin) || !valid(destination))
      throw new Error("Coordenadas inválidas.");
    const point = (p) => ({
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
    });
    const r = await this.fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.key,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: point(origin),
          destination: point(destination),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          languageCode: "pt-BR",
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok) throw new Error("Rota indisponível.");
    const d = await r.json();
    if (!d.routes?.length) throw new Error("Não foi possível traçar a rota.");
    return { ...d.routes[0], checkedAt: new Date().toISOString() };
  }
}
