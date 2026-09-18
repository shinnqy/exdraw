import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Drawing } from "../src/Drawing.js";
import { rectangle, serialize } from "../src/index.js";
import { runCli } from "../src/cli.js";

async function tempFile(name = "scene.excalidraw") {
  const dir = await mkdtemp(join(tmpdir(), "exdraw-edit-"));
  return join(dir, name);
}

function element(d, id) {
  const result = d.get(id);
  assert.ok(result, `missing element ${id}`);
  return result;
}

describe("已有场景编辑", () => {
  test("label 会建立 containerId 和 boundElements 双向关系", () => {
    const d = new Drawing();
    d.rect({ id: "box", x: 0, y: 0, width: 100, height: 50 });
    d.label("box", { text: "旧标签" });
    const box = element(d, "box");
    const labelRef = box.boundElements.find((ref) => ref.type === "text");
    const label = element(d, labelRef.id);
    assert.equal(label.containerId, "box");
    assert.equal(label.text, "旧标签");

    d.label("box", { text: "新标签", strokeColor: "#ff0000" });
    assert.equal(d.toElements().filter((item) => item.containerId === "box").length, 1);
    assert.equal(element(d, label.id).text, "新标签");
    assert.equal(element(d, label.id).strokeColor, "#ff0000");
  });

  test("移动和缩放容器会同步文本与绑定箭头", () => {
    const d = new Drawing();
    d.rect({ id: "a", x: 0, y: 0, width: 100, height: 50, label: "A" });
    d.rect({ id: "b", x: 200, y: 0, width: 100, height: 50 });
    d.arrow({ id: "ab", from: "a", to: "b" });
    const textBefore = d.toElements().find((item) => item.containerId === "a");
    const arrowBefore = element(d, "ab");

    d.move("a", 20, 30);
    assert.equal(element(d, "a").x, 20);
    assert.equal(element(d, textBefore.id).x, textBefore.x + 20);
    assert.notDeepEqual(element(d, "ab").points, arrowBefore.points);

    d.resize("a", { width: 160, height: 80 });
    assert.equal(element(d, "a").width, 160);
    assert.ok(element(d, textBefore.id).x > textBefore.x);
    assert.equal(element(d, "ab").startBinding.elementId, "a");
  });

  test("bind/unbind/delete 会修复双向引用，delete 默认软删除", () => {
    const d = new Drawing();
    d.rect({ id: "a", x: 0, y: 0, width: 80, height: 40, label: "A" });
    d.rect({ id: "b", x: 200, y: 0, width: 80, height: 40 });
    d.arrow({ id: "ab", from: "a", to: "b" });

    d.unbind("ab", "from");
    assert.equal(element(d, "ab").startBinding, null);
    assert.ok(!element(d, "a").boundElements.some((ref) => ref.id === "ab"));
    d.bind("ab", { from: "a", to: "b" });
    assert.ok(element(d, "a").boundElements.some((ref) => ref.id === "ab"));

    d.delete("a");
    assert.equal(element(d, "a").isDeleted, true);
    assert.equal(element(d, "ab").startBinding, null);
    assert.equal(d.validate().ok, true);

    d.purge("a");
    assert.equal(d.get("a"), null);
  });

  test("编辑会递增版本，保存已有 source 和合法 index", async () => {
    const file = await tempFile();
    const first = rectangle({ id: "a", x: 0, y: 0 });
    const second = rectangle({ id: "b", x: 100, y: 0 });
    first.index = "a0";
    second.index = "a1";
    await writeFile(file, serialize([first, second], {}, {}, {
      source: "https://example.test/editor",
    }));

    const d = await Drawing.load(file);
    const beforeVersion = element(d, "a").version;
    d.update("a", { strokeColor: "#f00" });
    await d.save(file);
    const data = JSON.parse(await readFile(file, "utf8"));
    assert.equal(data.source, "https://example.test/editor");
    assert.equal(data.elements.length, 2);
    assert.equal(data.elements[0].index, "a0");
    assert.equal(data.elements[1].index, "a1");
    assert.equal(data.elements[0].version, beforeVersion + 1);
    assert.equal(data.elements[0].strokeColor, "#f00");
  });

  test("order 在已有 fractional index 场景中只重排目标并保持合法顺序", async () => {
    const file = await tempFile();
    const d = new Drawing();
    d.add([
      { ...rectangle({ id: "a" }), index: "a0" },
      { ...rectangle({ id: "b" }), index: "a1" },
      { ...rectangle({ id: "c" }), index: "a2" },
    ]);
    await d.save(file);
    const loaded = await Drawing.load(file);
    loaded.order("c", { before: "a" });
    await loaded.save(file);
    const data = JSON.parse(await readFile(file, "utf8"));
    assert.deepEqual(data.elements.map((item) => item.id), ["c", "a", "b"]);
    assert.ok(data.elements.every((item) => typeof item.index === "string"));
    assert.ok(data.elements.every((item, i, all) => i === 0 || all[i - 1].index < item.index));
  });

  test("支持 group/frame 的逆向编辑", () => {
    const d = new Drawing();
    d.rect({ id: "a" });
    d.rect({ id: "b" });
    d.group(["a", "b"], { id: "g" });
    assert.deepEqual(element(d, "a").groupIds, ["g"]);
    d.ungroup({ groupId: "g" });
    assert.deepEqual(element(d, "a").groupIds, []);

    d.frame({ id: "f", children: ["a", "b"] });
    assert.equal(element(d, "a").frameId, "f");
    d.unframe({ frameId: "f" });
    assert.equal(element(d, "a").frameId, null);
  });
});

describe("编辑 CLI", () => {
  test("支持 edit / label / move / resize / bind / delete", async () => {
    const file = await tempFile();
    const io = { stdout: { write() {} }, stderr: { write() {} } };
    await runCli(["rect", "-f", file, "--id", "a", "--x", "0", "--y", "0", "--width", "80", "--height", "40"], io);
    await runCli(["rect", "-f", file, "--id", "b", "--x", "200", "--y", "0", "--width", "80", "--height", "40"], io);
    await runCli(["arrow", "-f", file, "--id", "ab", "--points", "80,20;200,20"], io);
    await runCli(["label", "-f", file, "--container", "a", "--text", "A"], io);
    await runCli(["edit", "rect", "-f", file, "--id", "a", "--x", "10", "--width", "100"], io);
    await runCli(["bind", "-f", file, "--id", "ab", "--from", "a", "--to", "b"], io);
    await runCli(["move", "-f", file, "--ids", "b", "--dx", "20", "--dy", "10"], io);
    await runCli(["resize", "-f", file, "--id", "b", "--width", "120", "--height", "60"], io);

    const beforeDelete = JSON.parse(await readFile(file, "utf8"));
    assert.equal(beforeDelete.elements.find((item) => item.id === "a").x, 10);
    assert.equal(beforeDelete.elements.find((item) => item.id === "b").width, 120);
    assert.equal(beforeDelete.elements.find((item) => item.id === "ab").startBinding.elementId, "a");

    await runCli(["delete", "-f", file, "--ids", "a"], io);
    const afterDelete = JSON.parse(await readFile(file, "utf8"));
    assert.equal(afterDelete.elements.find((item) => item.id === "a").isDeleted, true);
    assert.equal(afterDelete.elements.find((item) => item.id === "ab").startBinding, null);
  });
});
