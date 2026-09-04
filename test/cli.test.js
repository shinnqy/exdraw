import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, CliError } from "../src/cli.js";

function captureIo() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: { write(s) { stdout += s; return true; } },
    stderr: { write(s) { stderr += s; return true; } },
    get out() { return stdout; },
    get err() { return stderr; },
  };
}

async function tmpFile() {
  const dir = await mkdtemp(join(tmpdir(), "exdraw-cli-"));
  return join(dir, "test.excalidraw");
}

describe("CLI 绘图命令", () => {
  test("--help 列出全部子命令、能力与必填参数", async () => {
    const io = captureIo();
    await runCli(["--help"], io);
    const out = io.out;
    for (const name of [
      "new", "text", "rect", "square", "diamond", "oval", "circle",
      "line", "arrow", "freedraw", "image", "frame", "embed", "group",
      "background", "inspect",
    ]) {
      assert.match(out, new RegExp(`\\n  ${name}\\n`));
      assert.match(out, new RegExp(`${name}[\\s\\S]*?能力:`));
      assert.match(out, new RegExp(`${name}[\\s\\S]*?必填:`));
      assert.match(out, new RegExp(`${name}[\\s\\S]*?参数:`));
    }
    assert.match(out, /--text <s>/);
    assert.match(out, /--from <id> --to <id>/);
    assert.match(out, /--src <path>/);
    assert.match(out, /--r, --radius <n>/);
    assert.match(out, /笔迹点列/);
  });

  test("text --help 含必填项与通用样式参数", async () => {
    const io = captureIo();
    await runCli(["text", "--help"], io);
    assert.match(io.out, /能力: 写文字/);
    assert.match(io.out, /必填:.*--text/);
    assert.match(io.out, /--font-size/);
    assert.match(io.out, /--stroke, --color/);
  });
  test("缺少 -f 时报错", async () => {
    await assert.rejects(
      () => runCli(["text", "--text", "hi"], { stdout: { write() {} }, stderr: { write() {} } }),
      (err) => err instanceof CliError && /请用 -f/.test(err.message)
    );
  });

  test("text / rect / arrow 连续追加到同一文件", async () => {
    const file = await tmpFile();
    const io = captureIo();
    await runCli(["new", "-f", file], io);
    await runCli(["text", "-f", file, "--x", "10", "--y", "20", "--text", "标题"], io);
    await runCli(["rect", "-f", file, "--x", "10", "--y", "80", "--width", "200", "--height", "50", "--label", "Browser", "--rounded"], io);
    await runCli(["arrow", "-f", file, "--points", "110,130;110,200", "--label", "HTTP"], io);

    const data = JSON.parse(await readFile(file, "utf8"));
    assert.equal(data.type, "excalidraw");
    const types = data.elements.map((e) => e.type);
    assert.ok(types.includes("text"));
    assert.ok(types.includes("rectangle"));
    assert.ok(types.includes("arrow"));
    assert.equal(data.elements.find((e) => e.type === "text" && !e.containerId).text, "标题");
    assert.equal(data.elements.find((e) => e.type === "arrow").x, 110);
    assert.equal(data.elements.find((e) => e.type === "arrow").y, 130);
  });

  test("位置参数可作为 text / label", async () => {
    const file = await tmpFile();
    const io = captureIo();
    await runCli(["text", "-f", file, "--x", "0", "--y", "0", "集群模式"], io);
    await runCli(["rect", "-f", file, "--x", "0", "--y", "40", "Browser"], io);
    const data = JSON.parse(await readFile(file, "utf8"));
    assert.equal(data.elements.find((e) => e.type === "text" && !e.containerId).text, "集群模式");
    assert.equal(data.elements.find((e) => e.type === "text" && e.containerId).text, "Browser");
  });

  test("background 写入 appState", async () => {
    const file = await tmpFile();
    const io = captureIo();
    await runCli(["background", "-f", file, "--color", "#f8f9fa"], io);
    const data = JSON.parse(await readFile(file, "utf8"));
    assert.equal(data.appState.viewBackgroundColor, "#f8f9fa");
  });

  test("inspect 能读出元素数量", async () => {
    const file = await tmpFile();
    const io = captureIo();
    await runCli(["rect", "-f", file, "--x", "1", "--y", "2"], io);
    const inspectIo = captureIo();
    await runCli(["inspect", file], inspectIo);
    assert.match(inspectIo.out, /元素数: 1/);
  });

  test("circle / diamond / line 都可直接调用", async () => {
    const file = await tmpFile();
    const io = captureIo();
    await runCli(["circle", "-f", file, "--cx", "80", "--cy", "80", "--r", "30", "--label", "DB"], io);
    await runCli(["diamond", "-f", file, "--x", "200", "--y", "40", "--width", "120", "--height", "80", "判断"], io);
    await runCli(["line", "-f", file, "--points", "0,0;80,0", "--sharp"], io);
    const data = JSON.parse(await readFile(file, "utf8"));
    assert.ok(data.elements.some((e) => e.type === "ellipse" && e.width === 60 && e.height === 60));
    assert.ok(data.elements.some((e) => e.type === "diamond"));
    const ln = data.elements.find((e) => e.type === "line");
    assert.ok(ln);
    assert.ok(!Object.prototype.hasOwnProperty.call(ln, "polygon"));
  });

  test("arrow --from/--to 绑定已有形状", async () => {
    const file = await tmpFile();
    const io = captureIo();
    await runCli(["rect", "-f", file, "--id", "a", "--x", "0", "--y", "0", "--width", "80", "--height", "40"], io);
    await runCli(["rect", "-f", file, "--id", "b", "--x", "200", "--y", "0", "--width", "80", "--height", "40"], io);
    await runCli(["arrow", "-f", file, "--from", "a", "--to", "b", "--label", "HTTP"], io);
    const data = JSON.parse(await readFile(file, "utf8"));
    const ar = data.elements.find((e) => e.type === "arrow");
    assert.equal(ar.startBinding.elementId, "a");
    assert.equal(ar.endBinding.elementId, "b");
  });

  test("image 写入 files", async () => {
    const { writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    const file = await tmpFile();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const src = join(dirname(file), "p.png");
    await writeFile(src, png);
    const io = captureIo();
    await runCli(["image", "-f", file, "--src", src, "--x", "0", "--y", "0"], io);
    const data = JSON.parse(await readFile(file, "utf8"));
    const img = data.elements.find((e) => e.type === "image");
    assert.ok(img);
    assert.equal(img.status, "saved");
    assert.ok(data.files[img.fileId]);
    assert.match(data.files[img.fileId].dataURL, /^data:image\/png;base64,/);
  });
});
