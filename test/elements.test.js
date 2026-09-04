/**
 * 核心库单元测试（Node.js 内置 test runner）
 * 运行: npm test
 */
import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { rectangle, ellipse, diamond, text, line, arrow } from "../src/elements.js";
import { serialize, deserialize } from "../src/serialize.js";
import { Drawing } from "../src/Drawing.js";

// ── 元素工厂测试 ──────────────────────────────────────────────────────────────

describe("rectangle()", () => {
  test("无参数调用应返回有效对象", () => {
    const el = rectangle();
    assert.equal(el.type, "rectangle");
    assert.ok(el.id.length > 0);
    assert.ok(typeof el.seed === "number");
    assert.equal(el.version, 1);
    assert.equal(el.isDeleted, false);
  });

  test("参数应正确覆盖默认值", () => {
    const el = rectangle({ x: 50, y: 80, width: 200, height: 120, strokeColor: "#ff0000" });
    assert.equal(el.x, 50);
    assert.equal(el.y, 80);
    assert.equal(el.strokeColor, "#ff0000");
  });

  test("rounded=true 应设置 roundness", () => {
    const el = rectangle({ rounded: true });
    assert.ok(el.roundness !== null);
    assert.equal(el.roundness.type, 3); // ADAPTIVE_RADIUS
  });

  test("带 label 应返回 [shape, text] 数组", () => {
    const result = rectangle({ x: 0, y: 0, label: { text: "Hello" } });
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 2);
    assert.equal(result[0].type, "rectangle");
    assert.equal(result[1].type, "text");
    assert.equal(result[1].containerId, result[0].id);
  });
});

describe("text()", () => {
  test("必须包含 text 相关字段", () => {
    const el = text({ text: "Hello", x: 10, y: 20 });
    assert.equal(el.type, "text");
    assert.equal(el.text, "Hello");
    assert.equal(el.originalText, "Hello");
    assert.ok(typeof el.fontSize === "number");
    assert.ok(typeof el.fontFamily === "number");
  });
});

describe("arrow()", () => {
  test("应包含 points 和箭头头部字段", () => {
    const el = arrow({ x: 0, y: 0, width: 100 });
    assert.equal(el.type, "arrow");
    assert.ok(Array.isArray(el.points));
    assert.equal(el.points[0][0], 0);
    assert.equal(el.endArrowhead, "arrow");
    assert.equal(el.startArrowhead, null);
  });

  test("自定义 points 应正确展开", () => {
    const el = arrow({ x: 10, y: 10, points: [[10, 10], [110, 10], [110, 60]] });
    assert.equal(el.points[0][0], 0);
    assert.equal(el.points[1][0], 100);
  });

  test("未传 x/y 时用 points 第一个点作为原点", () => {
    const el = arrow({ points: [[100, 200], [100, 280]] });
    assert.equal(el.x, 100);
    assert.equal(el.y, 200);
    assert.equal(el.points[0][0], 0);
    assert.equal(el.points[1][1], 80);
  });
});

describe("line()", () => {
  test("基础直线", () => {
    const el = line({ x: 0, y: 0, width: 200 });
    assert.equal(el.type, "line");
    assert.ok(Array.isArray(el.points));
  });
});

describe("ellipse() / diamond()", () => {
  test("椭圆", () => {
    const el = ellipse({ x: 0, y: 0, width: 100, height: 60 });
    assert.equal(el.type, "ellipse");
  });
  test("菱形", () => {
    const el = diamond({ x: 0, y: 0 });
    assert.equal(el.type, "diamond");
  });
});

// ── 序列化测试 ────────────────────────────────────────────────────────────────

describe("serialize() / deserialize()", () => {
  test("生成的 JSON 可以被 deserialize 还原", () => {
    const elements = [rectangle({ x: 0, y: 0 })];
    const json = serialize(elements);
    const { elements: restored, version } = deserialize(json);
    assert.equal(version, 2);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].type, "rectangle");
  });

  test("带 label 的元素展开后在 elements 数组中应有两项", () => {
    const raw = rectangle({ x: 0, y: 0, label: "测试" });
    const elements = Array.isArray(raw) ? raw : [raw];
    const json = serialize(elements);
    const { elements: restored } = deserialize(json);
    assert.equal(restored.length, 2);
    assert.equal(restored[1].type, "text");
    assert.equal(restored[1].text, "测试");
  });

  test("分数索引应被赋值", () => {
    const elements = [rectangle(), ellipse()];
    const json = serialize(elements);
    const { elements: restored } = deserialize(json);
    assert.ok(restored[0].index !== null);
    assert.ok(restored[1].index !== null);
    assert.notEqual(restored[0].index, restored[1].index);
  });
});

// ── Drawing API 测试 ──────────────────────────────────────────────────────────

describe("Drawing", () => {
  test("链式调用返回自身", () => {
    const d = new Drawing();
    const result = d.rect({ x: 0, y: 0 }).text({ x: 0, y: 0, text: "hi" });
    assert.ok(result instanceof Drawing);
  });

  test("toElements() 展平带 label 的元素", () => {
    const d = new Drawing();
    d.rect({ x: 0, y: 0, label: "A" });
    const els = d.toElements();
    assert.ok(els.length >= 2);
  });

  test("toJSON() 产生合法 JSON", () => {
    const d = new Drawing();
    d.rect({ x: 10, y: 20, width: 100, height: 50 });
    const json = d.toJSON();
    const parsed = JSON.parse(json);
    assert.equal(parsed.type, "excalidraw");
    assert.equal(parsed.version, 2);
    assert.ok(Array.isArray(parsed.elements));
  });

  test("background() 设置 viewBackgroundColor", () => {
    const d = new Drawing();
    d.background("#ff0000");
    const parsed = JSON.parse(d.toJSON());
    assert.equal(parsed.appState.viewBackgroundColor, "#ff0000");
  });

  test("arrow 带 label 展平为多元素", () => {
    const d = new Drawing();
    d.arrow({ x: 0, y: 0, width: 100, label: "边" });
    const els = d.toElements();
    assert.ok(els.length >= 2);
    const arrowEl = els.find((e) => e.type === "arrow");
    const textEl = els.find((e) => e.type === "text");
    assert.ok(arrowEl);
    assert.ok(textEl);
  });

  test("load 读回已保存文件", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "exdraw-"));
    const file = join(dir, "a.excalidraw");
    const d = new Drawing();
    d.rect({ x: 10, y: 20, width: 30, height: 40 });
    await d.save(file);
    const loaded = await Drawing.load(file);
    assert.equal(loaded.toElements().length, 1);
    assert.equal(loaded.toElements()[0].type, "rectangle");
  });
});
