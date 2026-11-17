import { emptyWorkspace, validateWorkspace } from "../core/workspace.js";
export function createWorkspace({ api, notice, changed = () => {} }) {
  let data = emptyWorkspace(),
    epoch = 0,
    queue = Promise.resolve(),
    dirty = false,
    loaded = false;
  return {
    get: () => data,
    ready: () => loaded,
    dirty: () => dirty,
    reset() {
      if (dirty)
        throw new Error("Exporte as alterações pendentes antes de trocar de perfil.");
      epoch++;
      data = emptyWorkspace();
      loaded = false;
      changed();
    },
    async load() {
      if (dirty)
        throw new Error(
          "Há alterações não salvas. Exporte o histórico antes de atualizar a conexão.",
        );
      const generation = ++epoch;
      loaded = false;
      data = emptyWorkspace();
      changed();
      await queue.catch(() => {});
      const next = await api("workspace");
      if (generation !== epoch) return;
      data = { ...validateWorkspace(next), profile: next.profile };
      loaded = true;
      changed();
    },
    update(change) {
      const generation = epoch;
      const task = queue
        .catch(() => {})
        .then(async () => {
          if (!loaded || generation !== epoch)
            throw new Error(
              "Conecte o serviço e carregue seu histórico antes de salvar.",
            );
          const next = structuredClone(data);
          change(next);
          data = { ...validateWorkspace(next), profile: data.profile };
          dirty = true;
          changed();
          try {
            const saved = await api("workspace", data, "PUT");
            if (generation === epoch) {
              data = saved;
              dirty = false;
              changed();
            }
          } catch (e) {
            notice(e.message);
            throw e;
          }
        });
      queue = task;
      return task;
    },
    // Explicit discard after export is the only way to reload a conflicting profile.
    discardPending() {
      dirty = false;
    },
  };
}
