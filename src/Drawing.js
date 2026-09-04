/**
 * Drawing 类
 * 用户面向的高级 API：
 *   const d = new Drawing()
 *   d.rect({ x:100, y:100, width:200, height:80, label:"Hello" })
 *   d.arrow({ x:100, y:200, width:200 })
 *   await d.save("out.excalidraw")
 */
import { readFile, writeFile } from "node:fs/promises";
import {
  rectangle,
  ellipse,
  diamond,
  text,
  line,
  arrow,
  frame,
} from "./elements.js";
import { serialize, deserialize } from "./serialize.js";

export class Drawing {
  /** @type {object[]} 原始元素（可能是单对象或 [shape, textEl] 数组） */
  #raw = [];

  /** @type {Record<string, unknown>} */
  #appState = {};

  /**
   * @param {{ elements?: object[], appState?: Record<string, unknown> }} [init]
   */
  constructor(init = {}) {
    this.#raw = [...(init.elements ?? [])];
    this.#appState = { ...(init.appState ?? {}) };
  }

  /**
   * 读取已有 .excalidraw；文件不存在时返回空画布
   * @param {string} filePath
   */
  static async load(filePath) {
    try {
      const raw = await readFile(filePath, "utf8");
      const data = deserialize(raw);
      return new Drawing({
        elements: data.elements,
        appState: data.appState ?? {},
      });
    } catch (err) {
      if (err && err.code === "ENOENT") return new Drawing();
      throw err;
    }
  }

  /**
   * 设置画布背景色
   * @param {string} color  CSS 颜色字符串
   */
  background(color) {
    this.#appState.viewBackgroundColor = color;
    return this;
  }

  // ── 基础形状 ─────────────────────────────────────────────────────────────────

  /** 矩形（可带 label） @returns {this} */
  rect(opts = {}) { this.#raw.push(rectangle(opts)); return this; }

  /** 矩形别名 */
  rectangle(opts = {}) { return this.rect(opts); }

  /** 椭圆（可带 label） @returns {this} */
  oval(opts = {}) { this.#raw.push(ellipse(opts)); return this; }

  /** 椭圆别名 */
  ellipse(opts = {}) { return this.oval(opts); }

  /** 菱形（可带 label） @returns {this} */
  diamond(opts = {}) { this.#raw.push(diamond(opts)); return this; }

  /** 文本 @returns {this} */
  text(opts = {}) {
    if (typeof opts === "string") opts = { text: opts, x: 0, y: 0 };
    this.#raw.push(text(opts));
    return this;
  }

  /** 直线 @returns {this} */
  line(opts = {}) { this.#raw.push(line(opts)); return this; }

  /** 箭头（可带 label） @returns {this} */
  arrow(opts = {}) { this.#raw.push(arrow(opts)); return this; }

  /**
   * 帧（Frame）容器
   * @param {object} opts
   * @param {Function|string[]} [opts.children]
   *   函数：回调 (d) => {}，在其中添加内容
   *   数组：已有元素 id 列表，写入后设置 frameId
   */
  frame(opts = {}) {
    const { children, ...frameOpts } = opts;
    if (typeof children === "function") {
      const childDrawing = new Drawing();
      children(childDrawing);
      const f = frame(frameOpts);
      this.#raw.push(f);
      childDrawing.toElements().forEach((e) => this.#raw.push({ ...e, frameId: f.id }));
      return this;
    }

    const f = frame(frameOpts);
    this.#raw.push(f);
    if (Array.isArray(children) && children.length) {
      const ids = new Set(children);
      this.#raw = this.toElements().map((el) =>
        ids.has(el.id) ? { ...el, frameId: f.id } : el
      );
    }
    return this;
  }

  // ── 组合操作 ──────────────────────────────────────────────────────────────────

  /**
   * 添加任意原始元素对象（高级用法）
   */
  add(elOrArray) {
    if (Array.isArray(elOrArray)) {
      elOrArray.forEach((e) => this.#raw.push(e));
    } else {
      this.#raw.push(elOrArray);
    }
    return this;
  }

  // ── 输出 ─────────────────────────────────────────────────────────────────────

  /**
   * 将内部元素摊平成线性数组（_withLabel 返回的是 [shape, text]）
   * @returns {object[]}
   */
  toElements() {
    return this.#raw.flatMap((el) =>
      Array.isArray(el) ? el : [el]
    );
  }

  /**
   * 序列化为 JSON 字符串
   * @returns {string}
   */
  toJSON() {
    return serialize(this.toElements(), this.#appState);
  }

  /**
   * 保存为 .excalidraw 文件
   * @param {string} filePath
   */
  async save(filePath) {
    const json = this.toJSON();
    await writeFile(filePath, json, "utf8");
    return filePath;
  }
}
