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
});
