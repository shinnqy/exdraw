/**
 * Drawing：把元素工厂组合成可保存的画布
 */
import { readFile, writeFile } from "node:fs/promises";
import {
  rectangle,
  square,
  ellipse,
  circle,
  diamond,
  text,
  line,
  arrow,
  frame,
  freedraw,
  image,
  embeddable,
} from "./elements.js";
import { serialize, deserialize } from "./serialize.js";
import { autoSides, sidePoint, makeBinding, elbowPoints } from "./geometry.js";
import { randomId } from "./utils.js";

export class Drawing {
  #raw = [];
  #appState = {};
  #files = {};

  /**
   * @param {{ elements?: object[], appState?: object, files?: object }} [init]
   */
  constructor(init = {}) {
    this.#raw = [...(init.elements ?? [])];
    this.#appState = { ...(init.appState ?? {}) };
    this.#files = { ...(init.files ?? {}) };
  }

  static async load(filePath) {
    try {
      const raw = await readFile(filePath, "utf8");
      const data = deserialize(raw);
      return new Drawing({
        elements: data.elements,
        appState: data.appState ?? {},
        files: data.files ?? {},
      });
    } catch (err) {
      if (err && err.code === "ENOENT") return new Drawing();
      throw err;
    }
  }

  get(id) {
    return this.toElements().find((el) => el.id === id) ?? null;
  }

  background(color) {
    this.#appState.viewBackgroundColor = color;
    return this;
  }

  #push(created) {
    if (created && created.element) {
      this.#raw.push(created.element);
      if (created.file) this.#files[created.file.id] = created.file;
      return created.element;
    }
    this.#raw.push(created);
    return Array.isArray(created) ? created[0] : created;
  }

  #replaceAll(elements) {
    this.#raw = elements;
  }

  #attachArrowBound(targetId, arrowId) {
    const els = this.toElements();
    const target = els.find((el) => el.id === targetId);
    if (!target) return;
    const already = (target.boundElements ?? []).some((b) => b.id === arrowId);
    if (!already) {
      target.boundElements = [...(target.boundElements ?? []), { id: arrowId, type: "arrow" }];
    }
    this.#replaceAll(els);
  }

  #resolveConnector(opts) {
    const next = { ...opts };
    const fromEl = opts.from ? this.get(opts.from) : null;
    const toEl = opts.to ? this.get(opts.to) : null;
    if (opts.from && !fromEl) {
      throw new Error(`找不到起点元素 id="${opts.from}"，请先用 --id 创建该形状`);
    }
    if (opts.to && !toEl) {
      throw new Error(`找不到终点元素 id="${opts.to}"，请先用 --id 创建该形状`);
    }
    if (!fromEl && !toEl) return next;

    let fromSide = opts.fromSide;
    let toSide = opts.toSide;
    if (fromEl && toEl && !fromSide && !toSide) {
      [fromSide, toSide] = autoSides(fromEl, toEl);
    }
    fromSide = fromSide ?? "center";
    toSide = toSide ?? "center";

    const start = fromEl
      ? sidePoint(fromEl, fromSide)
      : { x: opts.x ?? 0, y: opts.y ?? 0, fp: [0.5, 0.5] };
    const end = toEl
      ? sidePoint(toEl, toSide)
      : {
          x: (opts.x ?? start.x) + (opts.width ?? 100),
          y: opts.y ?? start.y,
          fp: [0.5, 0.5],
        };

    if (!opts.points) {
      next.points = (opts.elbow || opts.elbowed)
        ? elbowPoints(start, end, fromSide)
        : [[start.x, start.y], [end.x, end.y]];
    }
    if (fromEl) next.startBinding = makeBinding(fromEl.id, start.fp);
    if (toEl) next.endBinding = makeBinding(toEl.id, end.fp);
    return next;
  }

  rect(opts = {}) { this.#push(rectangle(opts)); return this; }
  rectangle(opts = {}) { return this.rect(opts); }
  square(opts = {}) { this.#push(square(opts)); return this; }
  oval(opts = {}) { this.#push(ellipse(opts)); return this; }
  ellipse(opts = {}) { return this.oval(opts); }
  circle(opts = {}) { this.#push(circle(opts)); return this; }
  diamond(opts = {}) { this.#push(diamond(opts)); return this; }

  text(opts = {}) {
    if (typeof opts === "string") opts = { text: opts, x: 0, y: 0 };
    this.#push(text(opts));
    return this;
  }

  line(opts = {}) {
    this.#push(line(this.#resolveConnector(opts)));
    return this;
  }

  arrow(opts = {}) {
    const resolved = this.#resolveConnector(opts);
    const created = arrow(resolved);
    const primary = this.#push(created);
    if (resolved.startBinding) this.#attachArrowBound(resolved.startBinding.elementId, primary.id);
    if (resolved.endBinding) this.#attachArrowBound(resolved.endBinding.elementId, primary.id);
    return this;
  }

  freedraw(opts = {}) { this.#push(freedraw(opts)); return this; }
  draw(opts = {}) { return this.freedraw(opts); }

  image(opts = {}) { this.#push(image(opts)); return this; }

  embed(opts = {}) { this.#push(embeddable(opts)); return this; }
  embeddable(opts = {}) { return this.embed(opts); }

  frame(opts = {}) {
    const { children, ...frameOpts } = opts;
    if (typeof children === "function") {
      const childDrawing = new Drawing();
      children(childDrawing);
      const f = frame(frameOpts);
      this.#raw.push(f);
      childDrawing.toElements().forEach((e) => this.#raw.push({ ...e, frameId: f.id }));
      Object.assign(this.#files, childDrawing.#files);
      return this;
    }

    const f = frame(frameOpts);
    this.#raw.push(f);
    if (Array.isArray(children) && children.length) {
      const ids = new Set(children);
      this.#replaceAll(this.toElements().map((el) =>
        ids.has(el.id) ? { ...el, frameId: f.id } : el
      ));
    }
    return this;
  }

  /**
   * 把已有元素编成一组
   * @param {string[]} ids
   * @param {{ id?: string }} [opts]
   */
  group(ids, opts = {}) {
    if (ids && !Array.isArray(ids)) {
      opts = { ...ids, ...opts };
      ids = ids.ids;
    }
    const list = ids;
    if (!list?.length) throw new Error("group 需要元素 id 列表");
    const gid = opts.id ?? randomId();
    const set = new Set(list);
    this.#replaceAll(this.toElements().map((el) =>
      set.has(el.id)
        ? { ...el, groupIds: [...new Set([...(el.groupIds ?? []), gid])] }
        : el
    ));
    return this;
  }

  add(elOrArray) {
    if (Array.isArray(elOrArray)) elOrArray.forEach((e) => this.#raw.push(e));
    else this.#raw.push(elOrArray);
    return this;
  }

  toElements() {
    return this.#raw.flatMap((el) => (Array.isArray(el) ? el : [el]));
  }

  toJSON() {
    return serialize(this.toElements(), this.#appState, this.#files);
  }

  async save(filePath) {
    await writeFile(filePath, this.toJSON(), "utf8");
    return filePath;
  }
}
