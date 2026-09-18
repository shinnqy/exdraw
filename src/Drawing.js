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
import {
  addLabel,
  bindElement,
  deleteElements,
  mutateElement,
  moveElements,
  reorderElements,
  resizeElement,
  unbindElement,
  unframeElements,
  ungroupElements,
  updateElements,
  validateScene,
} from "./edit.js";
import { EXCALIDRAW_SOURCE, EXCALIDRAW_VERSION } from "./constants.js";

export class Drawing {
  #raw = [];
  #appState = {};
  #files = {};
  #source = EXCALIDRAW_SOURCE;
  #version = EXCALIDRAW_VERSION;

  /**
   * @param {{ elements?: object[], appState?: object, files?: object, source?: string, version?: number }} [init]
   */
  constructor(init = {}) {
    this.#raw = [...(init.elements ?? [])];
    this.#appState = { ...(init.appState ?? {}) };
    this.#files = { ...(init.files ?? {}) };
    this.#source = init.source ?? EXCALIDRAW_SOURCE;
    this.#version = init.version ?? EXCALIDRAW_VERSION;
  }

  static async load(filePath) {
    try {
      const raw = await readFile(filePath, "utf8");
      const data = deserialize(raw);
      return new Drawing({
        elements: data.elements,
        appState: data.appState ?? {},
        files: data.files ?? {},
        source: data.source,
        version: data.version,
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
    const createdElements = created?.element
      ? [created.element]
      : (Array.isArray(created) ? created : [created]);
    const existingIds = new Set(this.toElements().map((element) => element.id));
    for (const element of createdElements) {
      if (!element?.id) continue;
      if (existingIds.has(element.id) || createdElements.filter((item) => item?.id === element.id).length > 1) {
        throw new Error(`元素 id="${element.id}" 已存在`);
      }
      existingIds.add(element.id);
    }
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
      this.#replaceAll(els.map((element) =>
        element.id === targetId
          ? mutateElement(element, {
            boundElements: [...(element.boundElements ?? []), { id: arrowId, type: "arrow" }],
          })
          : element
      ));
      return;
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

  replaceImage(id, opts = {}) {
    const current = this.get(id);
    if (!current) throw new Error(`找不到元素 id="${id}"`);
    if (current.type !== "image") throw new Error(`元素 id="${id}" 不是 image`);
    const created = image(opts);
    if (!created?.element) throw new Error("无法创建图片元素");

    const oldFileId = current.fileId;
    const nextElement = mutateElement(current, {
      fileId: created.element.fileId,
      status: created.element.status,
      scale: opts.scale ?? current.scale ?? created.element.scale,
      crop: opts.crop ?? current.crop ?? created.element.crop,
      width: opts.width ?? current.width ?? created.element.width,
      height: opts.height ?? current.height ?? created.element.height,
    });
    this.#replaceAll(this.toElements().map((element) =>
      element.id === id ? nextElement : element
    ));
    if (created.file) this.#files[created.file.id] = created.file;

    if (oldFileId && oldFileId !== created.element.fileId) {
      const stillUsed = this.toElements().some((element) =>
        !element.isDeleted && element.type === "image" && element.fileId === oldFileId
      );
      if (!stillUsed) delete this.#files[oldFileId];
    }
    return this;
  }

  embed(opts = {}) { this.#push(embeddable(opts)); return this; }
  embeddable(opts = {}) { return this.embed(opts); }

  frame(opts = {}) {
    const { children, ...frameOpts } = opts;
    if (typeof children === "function") {
      const childDrawing = new Drawing();
      children(childDrawing);
      const f = frame(frameOpts);
      this.#raw.push(f);
      childDrawing.toElements().forEach((e) => this.#raw.push(mutateElement(e, { frameId: f.id })));
      Object.assign(this.#files, childDrawing.#files);
      return this;
    }

    const f = frame(frameOpts);
    this.#push(f);
    if (Array.isArray(children) && children.length) {
      const ids = new Set(children);
      this.#replaceAll(this.toElements().map((el) =>
        ids.has(el.id) ? mutateElement(el, { frameId: f.id }) : el
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
    for (const id of list) {
      if (!this.get(id)) throw new Error(`找不到元素 id="${id}"`);
    }
    const gid = opts.id ?? randomId();
    if (this.toElements().some((element) => (element.groupIds ?? []).includes(gid))) {
      throw new Error(`group id="${gid}" 已存在`);
    }
    const set = new Set(list);
    this.#replaceAll(this.toElements().map((el) =>
      set.has(el.id)
        ? mutateElement(el, { groupIds: [...new Set([...(el.groupIds ?? []), gid])] })
        : el
    ));
    return this;
  }

  /**
   * 修改一个已有元素。CLI 会在上层按元素类型限制可用字段，库层保留
   * 未知字段并只覆盖明确传入的属性。
   */
  update(id, patch = {}) {
    this.#replaceAll(updateElements(this.toElements(), id, patch));
    return this;
  }

  move(ids, dx, dy) {
    this.#replaceAll(moveElements(this.toElements(), ids, Number(dx), Number(dy)));
    return this;
  }

  resize(id, dimensions = {}) {
    this.#replaceAll(resizeElement(this.toElements(), id, dimensions));
    return this;
  }

  rotate(ids, angle, { relative = false } = {}) {
    if (!Number.isFinite(Number(angle))) throw new Error("angle 必须是数字");
    const list = Array.isArray(ids) ? ids : [ids];
    for (const id of list) {
      const element = this.get(id);
      if (!element) throw new Error(`找不到元素 id="${id}"`);
      this.#replaceAll(updateElements(this.toElements(), id, {
        angle: relative ? element.angle + Number(angle) : Number(angle),
      }));
    }
    return this;
  }

  label(containerId, opts = {}) {
    this.#replaceAll(addLabel(this.toElements(), containerId, opts));
    return this;
  }

  bind(id, opts = {}) {
    this.#replaceAll(bindElement(this.toElements(), id, { ...opts, recompute: opts.recompute !== false }));
    return this;
  }

  unbind(id, which = "both") {
    this.#replaceAll(unbindElement(this.toElements(), id, which));
    return this;
  }

  delete(ids, opts = {}) {
    const result = deleteElements(this.toElements(), this.#files, ids, opts);
    this.#replaceAll(result.elements);
    this.#files = { ...(result.files ?? {}) };
    return this;
  }

  remove(ids, opts = {}) {
    return this.delete(ids, opts);
  }

  purge(ids, opts = {}) {
    return this.delete(ids, { ...opts, purge: true });
  }

  ungroup(opts = {}) {
    this.#replaceAll(ungroupElements(this.toElements(), opts));
    return this;
  }

  unframe(opts = {}) {
    this.#replaceAll(unframeElements(this.toElements(), opts));
    return this;
  }

  order(ids, opts = {}) {
    this.#replaceAll(reorderElements(this.toElements(), ids, opts));
    return this;
  }

  validate() {
    return validateScene(this.toElements(), this.#files);
  }

  add(elOrArray) {
    const elements = Array.isArray(elOrArray) ? elOrArray : [elOrArray];
    for (const element of elements) this.#push(element);
    return this;
  }

  toElements() {
    return this.#raw.flatMap((el) => (Array.isArray(el) ? el : [el]));
  }

  toJSON() {
    return serialize(this.toElements(), this.#appState, this.#files, {
      source: this.#source,
      version: this.#version,
    });
  }

  async save(filePath) {
    await writeFile(filePath, this.toJSON(), "utf8");
    return filePath;
  }
}
