import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const AUTH = "https://auth.openai.com",
  RESOURCE = "https://api.openai.com/v1";
const random = () => randomBytes(32).toString("base64url");
const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function beginAuthorization({ hostId, redirectUri, registration }) {
  const state = random(),
    nonce = random(),
    verifier = random();
  const url = new URL(AUTH + "/api/accounts/authorize");
  const values = {
    client_id: registration?.client_id ?? "dynamic_agent_client",
    ext_agent_host_id: hostId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope:
      "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
  if (!registration) values.agent_name_hint = "Cadê Doutor";
  if (registration?.id_token) values.id_token_hint = registration.id_token;
  for (const [k, v] of Object.entries(values)) url.searchParams.set(k, v);
  return {
    url: url.toString(),
    state,
    nonce,
    verifier,
    redirectUri,
    registration,
    expires: Date.now() + 10 * 60_000,
  };
}
export function validateCallback(pending, params) {
  if (
    !pending ||
    pending.expires < Date.now() ||
    !same(pending.state, params.get("state"))
  )
    throw new Error("Retorno de autenticação inválido ou expirado.");
  if (params.has("error"))
    throw new Error(
      params.get("error") === "access_denied"
        ? "Autorização recusada."
        : "Falha no retorno de autenticação.",
    );
  const clientId = params.get("client_id") || pending.registration?.client_id;
  if (
    !clientId ||
    clientId === "dynamic_agent_client" ||
    (pending.registration && clientId !== pending.registration.client_id) ||
    !params.get("code")
  )
    throw new Error("Registro de cliente incompleto ou divergente.");
  return { clientId, code: params.get("code") };
}
export function safeAuthEndpoint(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "auth.openai.com" ||
    u.username ||
    u.password
  )
    throw new Error("Endpoint de autenticação não confiável.");
  return u;
}
export class Auth {
  constructor(store, { fetchFn = fetch, verifyFn = jwtVerify } = {}) {
    this.store = store;
    this.fetch = fetchFn;
    this.verify = verifyFn;
    this.pending = new Map();
    this.refreshes = new Map();
  }
  async profiles() {
    return this.store.read("accounts.json", { active: null, accounts: {} });
  }
  async metadata() {
    if (!this.meta) {
      const r = await this.fetch(AUTH + "/.well-known/openid-configuration", {
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok)
        throw new Error("Não foi possível verificar a configuração OpenAI.");
      this.meta = await r.json();
      if (this.meta.issuer !== AUTH)
        throw new Error("Emissor OpenAI divergente.");
      this.jwks = createRemoteJWKSet(safeAuthEndpoint(this.meta.jwks_uri));
    }
    return this.meta;
  }
  async start(redirectUri, key) {
    const db = await this.profiles();
    const registration = key
      ? db.accounts[key]
      : await this.store.read("registration-draft.json", null);
    if (key && !registration) throw new Error("Conta não encontrada.");
    const p = beginAuthorization({
      hostId: await this.store.host(),
      redirectUri,
      registration,
    });
    this.pending.set(p.state, p);
    for (const [s, v] of this.pending)
      if (v.expires < Date.now()) this.pending.delete(s);
    return p.url;
  }
  async tokenRequest(values) {
    const r = await this.fetch(AUTH + "/api/accounts/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error("OpenAI recusou a sessão. Entre novamente.");
    return r.json();
  }
  async callback(params) {
    const state = params.get("state"),
      p = this.pending.get(state);
    if (p && params.has("error")) this.pending.delete(state);
    const { clientId, code } = validateCallback(p, params);
    this.pending.delete(state);
    if (!p.registration?.subject)
      await this.store.write("registration-draft.json", {
        client_id: clientId,
      });
    const token = await this.tokenRequest({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: p.verifier,
      redirect_uri: p.redirectUri,
      resource: RESOURCE,
    });
    await this.metadata();
    const { payload } = await this.verify(token.id_token, this.jwks, {
      issuer: AUTH,
      audience: clientId,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "nonce"],
    });
    if (
      !same(payload.nonce, p.nonce) ||
      !payload.sub ||
      (p.registration?.subject && payload.sub !== p.registration.subject)
    )
      throw new Error("Identidade da conta não confere.");
    if (
      typeof token.access_token !== "string" ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 0
    )
      throw new Error("Credenciais incompletas.");
    const key = createHash("sha256")
      .update(clientId + "\n" + payload.sub)
      .digest("hex");
    await this.store.transaction(async () => {
      const db = await this.profiles();
      db.accounts[key] = {
        client_id: clientId,
        subject: payload.sub,
        email: payload.email ?? "",
        name: payload.name ?? "",
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        id_token: token.id_token,
        scopes: String(token.scope ?? "")
          .split(" ")
          .filter(Boolean),
        expires: Date.now() + token.expires_in * 1000,
      };
      db.active = key;
      await this.store.write("accounts.json", db);
      if (!p.registration?.subject)
        await this.store.write("registration-draft.json", null);
    });
    return key;
  }
  async status() {
    const db = await this.profiles();
    return {
      active: db.active,
      accounts: Object.entries(db.accounts).map(([key, a]) => ({
        key,
        label:
          (a.email || a.name || "Conta ChatGPT") +
          " · " +
          a.client_id.slice(-6),
        connected: Boolean(a.access_token),
        planEnabled: a.scopes?.includes("chatgpt.tokens.use.direct") ?? false,
      })),
    };
  }
  async select(key) {
    await this.store.transaction(async () => {
      const db = await this.profiles();
      if (!db.accounts[key]) throw new Error("Conta não encontrada.");
      db.active = key;
      await this.store.write("accounts.json", db);
    });
  }
  async access(selectedKey) {
    const db = await this.profiles(),
      key = selectedKey ?? db.active,
      a = db.accounts[key];
    if (!a?.access_token || !a.scopes?.includes("chatgpt.tokens.use.direct"))
      throw new Error("Entre com ChatGPT e autorize o uso do plano.");
    if (a.expires > Date.now() + 60000) return a.access_token;
    if (!this.refreshes.has(key))
      this.refreshes.set(
        key,
        this.refresh(key).finally(() => this.refreshes.delete(key)),
      );
    return this.refreshes.get(key);
  }
  async refresh(key) {
    const db = await this.profiles(),
      a = db.accounts[key];
    if (!a?.refresh_token) throw new Error("Entre novamente com ChatGPT.");
    const t = await this.tokenRequest({
      grant_type: "refresh_token",
      client_id: a.client_id,
      refresh_token: a.refresh_token,
      resource: RESOURCE,
    });
    if (!t.access_token || !Number.isFinite(t.expires_in) || t.expires_in <= 0)
      throw new Error("Renovação incompleta.");
    let result;
    await this.store.transaction(async () => {
      const latest = await this.profiles();
      if (latest.accounts[key]?.refresh_token !== a.refresh_token)
        throw new Error("A sessão mudou durante a renovação.");
      const scopes =
        t.scope === undefined ? a.scopes : String(t.scope).split(" ");
      if (!scopes.includes("chatgpt.tokens.use.direct"))
        throw new Error("Permissão de uso do plano não concedida.");
      latest.accounts[key] = {
        ...a,
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? a.refresh_token,
        scopes,
        expires: Date.now() + t.expires_in * 1000,
      };
      await this.store.write("accounts.json", latest);
      result = t.access_token;
    });
    return result;
  }
  async logout(key) {
    const db = await this.profiles(),
      a = db.accounts[key];
    if (!a) throw new Error("Conta não encontrada.");
    let revoked = !a.refresh_token;
    await this.store.transaction(async () => {
      const latest = await this.profiles();
      const r = latest.accounts[key];
      if (r) {
        delete r.access_token;
        delete r.refresh_token;
        delete r.id_token;
        r.scopes = [];
        if (latest.active === key) latest.active = null;
        await this.store.write("accounts.json", latest);
      }
    });
    if (a.refresh_token) {
      try {
        const meta = await this.metadata();
        const endpoint = safeAuthEndpoint(meta.revocation_endpoint);
        for (let i = 0; i < 2; i++) {
          try {
            const r = await this.fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                token: a.refresh_token,
                token_type_hint: "refresh_token",
                client_id: a.client_id,
              }),
              signal: AbortSignal.timeout(10000),
            });
            if (r.status === 200) {
              revoked = true;
              break;
            }
            if (r.status < 500) break;
          } catch {}
          if (i === 0) await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch {}
    }
    return {
      revoked,
      message: revoked
        ? "Sessão encerrada."
        : "Sessão local encerrada. Revogação remota não confirmada; desconecte o app nas configurações do ChatGPT.",
    };
  }
}
