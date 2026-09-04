import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { parseArgv, parsePoints, coerce } from "../src/parse-args.js";

describe("parseArgv()", () => {
  test("拆出命令、位置参数和 flag", () => {
    const r = parseArgv(["text", "-f", "a.excalidraw", "--x", "10", "--text", "hi"]);
    assert.equal(r.command, "text");
    assert.deepEqual(r.positionals, []);
    assert.equal(r.flags.file, "a.excalidraw");
    assert.equal(r.flags.x, "10");
    assert.equal(r.flags.text, "hi");
  });

  test("支持 --key=value 和位置参数", () => {
    const r = parseArgv(["rect", "--width=200", "Browser"]);
    assert.equal(r.command, "rect");
    assert.equal(r.flags.width, "200");
    assert.deepEqual(r.positionals, ["Browser"]);
  });

  test("布尔 flag 与 --no- 前缀", () => {
    const r = parseArgv(["rect", "--rounded", "--no-locked"]);
    assert.equal(r.flags.rounded, true);
    assert.equal(r.flags.locked, false);
  });

  test("kebab-case 转 camelCase", () => {
    const r = parseArgv(["arrow", "--stroke-color", "#111", "--end-arrowhead", "none"]);
    assert.equal(r.flags.strokeColor, "#111");
    assert.equal(r.flags.endArrowhead, "none");
  });
});

describe("parsePoints() / coerce()", () => {
  test("分号分隔的点列", () => {
    assert.deepEqual(parsePoints("0,0;100,50"), [[0, 0], [100, 50]]);
  });

  test("JSON 点列", () => {
    assert.deepEqual(parsePoints("[[0,0],[10,20]]"), [[0, 0], [10, 20]]);
  });

  test("coerce number / boolean / points", () => {
    assert.equal(coerce("12.5", "number"), 12.5);
    assert.equal(coerce("true", "boolean"), true);
    assert.deepEqual(coerce("1,2;3,4", "points"), [[1, 2], [3, 4]]);
  });
});
