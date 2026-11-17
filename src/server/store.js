import {
  mkdir,
  readFile,
  writeFile,
  rename,
  chmod,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

export const defaultDir = () =>
  process.env.CADE_DOUTOR_HOME || join(homedir(), ".config", "cade-doutor");
export class Store {
  constructor(dir = defaultDir()) {
    this.dir = dir;
    this.queue = Promise.resolve();
  }
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await chmod(this.dir, 0o700);
  }
  async read(name, fallback) {
    try {
      return JSON.parse(await readFile(join(this.dir, name), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return structuredClone(fallback);
      throw e;
    }
  }
  async write(name, data) {
    await this.init();
    const path = join(this.dir, name),
      tmp = path + "." + randomUUID() + ".tmp";
    await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(tmp, path);
    await chmod(path, 0o600);
  }
  async transaction(fn) {
    const task = this.queue.then(fn, fn);
    this.queue = task.catch(() => {});
    return task;
  }
  async host() {
    return this.transaction(async () => {
      let h = await this.read("host.json", null);
      if (!h) {
        h = { id: "urn:uuid:" + randomUUID() };
        await this.write("host.json", h);
      }
      return h.id;
    });
  }
  async lock() {
    await this.init();
    try {
      await writeFile(join(this.dir, "runtime.lock"), String(process.pid), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (e) {
      if (e.code === "EEXIST")
        throw new Error(
          "Outro serviço pode estar usando este perfil. Encerre-o; remova runtime.lock somente se ele não estiver em execução.",
        );
      throw e;
    }
  }
  async unlock() {
    await unlink(join(this.dir, "runtime.lock")).catch(() => {});
  }
}
