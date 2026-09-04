import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { measureText } from "../src/text-metrics.js";

describe("measureText()", () => {
  test("四个汉字 fontSize=20 时宽度为 80（与 Excalidraw 自适应一致）", () => {
    const m = measureText("集群模式", { fontSize: 20, lineHeight: 1.25 });
    assert.equal(m.width, 80);
    assert.equal(m.height, 25);
  });

  test("拉丁字母仍按 0.6em", () => {
    const m = measureText("Hello", { fontSize: 20 });
    assert.equal(m.width, 60);
  });

  test("中英混排按各自步进累加", () => {
    const m = measureText("AB集群", { fontSize: 20 });
    assert.equal(m.width, 20 * 0.6 * 2 + 20 * 2);
  });

  test("多行取最宽一行", () => {
    const m = measureText("集\n集群模式", { fontSize: 20, lineHeight: 1.25 });
    assert.equal(m.width, 80);
    assert.equal(m.height, 50);
  });
});
