/**
 * CLI：每个绘图原语对应一条子命令，结果追加写入同一个 .excalidraw 文件
 *
 *   node bin/exdraw.js new  -f test.excalidraw
 *   node bin/exdraw.js text -f test.excalidraw --x 100 --y 20 --text "标题"
 *   node bin/exdraw.js rect -f test.excalidraw --x 100 --y 80 --width 200 --label Browser
 *   node bin/exdraw.js arrow -f test.excalidraw --points 200,130;200,200 --label HTTP
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Drawing } from "./Drawing.js";
import { serialize, deserialize } from "./serialize.js";
import {
  rectangle, ellipse, diamond, text, line, arrow, frame,
} from "./elements.js";
import {
  FONT_FAMILY, COLOR_PALETTE, FILL_STYLE, STROKE_STYLE,
  STROKE_WIDTH, ROUGHNESS, ROUNDNESS, ARROWHEAD,
} from "./constants.js";
import { parseArgv, coerce } from "./parse-args.js";

export class CliError extends Error {
  /**
   * @param {string} message
   * @param {number} [exitCode=1]
   */
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const STYLE_FIELDS = {
  x: "number",
  y: "number",
  width: "number",
  height: "number",
  strokeColor: "string",
  backgroundColor: "string",
  fillStyle: "string",
  strokeWidth: "number",
  strokeStyle: "string",
  roughness: "number",
  opacity: "number",
  id: "string",
  angle: "number",
};

const TEXT_STYLE_FIELDS = {
  fontSize: "number",
  fontFamily: "string",
  textAlign: "string",
  verticalAlign: "string",
};

const FLAG_ALIASES = {
  fill: "backgroundColor",
  bg: "backgroundColor",
  stroke: "strokeColor",
  color: "strokeColor",
  w: "width",
  width: "width",
  height: "height",
  file: "file",
  output: "file",
};

const COMMON_DRAW_FLAGS = `
    -f, --file <path>          要写入的 .excalidraw 文件（必填，不存在则创建）
    --x <n>                    左上角 x
    --y <n>                    左上角 y
    --width, --w <n>           宽度
    --height <n>               高度
    --stroke, --color <c>      描边颜色
    --fill, --bg <c>           填充颜色
    --stroke-width <n>         描边宽度 1/2/4
    --stroke-style <s>         solid | dashed | dotted
    --fill-style <s>           solid | hachure | cross-hatch | zigzag
    --roughness <n>            0 | 1 | 2
    --opacity <n>              0-100
    --id <id>                  自定义元素 id
    -q, --quiet                少打印
`;

/** @type {Record<string, object>} */
const COMMANDS = {
  new: {
    kind: "meta",
    summary: "新建空白画布（覆盖已有文件）",
    usage: "exdraw new -f <file.excalidraw>",
  },
  background: {
    kind: "draw",
    method: "background",
    positional: "color",
    required: ["color"],
    fields: { color: "string" },
    summary: "设置画布背景色",
    usage: "exdraw background -f <file> --color \"#f8f9fa\"",
    extraHelp: "    --color <c>               背景色（也可写成位置参数）",
  },
  text: {
    kind: "draw",
    method: "text",
    positional: "text",
    required: ["text"],
    fields: { ...STYLE_FIELDS, ...TEXT_STYLE_FIELDS, text: "string" },
    summary: "写文字",
    usage: "exdraw text -f <file> --x 100 --y 20 --text \"标题\"",
    extraHelp: `    --text <s>                文字内容（也可写成位置参数）
    --font-size <n>            字号，默认 20
    --font-family <s>          Excalifont | Nunito | "Comic Shanns" | 数字
    --text-align <s>           left | center | right
    --vertical-align <s>       top | middle | bottom`,
  },
  rect: {
    kind: "draw",
    method: "rect",
    aliases: ["rectangle"],
    positional: "label",
    fields: { ...STYLE_FIELDS, rounded: "boolean", label: "string" },
    summary: "画矩形",
    usage: "exdraw rect -f <file> --x 100 --y 80 --width 200 --height 50 --label Browser --rounded",
    extraHelp: `    --label <s>               框内文字（也可写成位置参数）
    --rounded                 圆角矩形`,
  },
  oval: {
    kind: "draw",
    method: "oval",
    aliases: ["ellipse"],
    positional: "label",
    fields: { ...STYLE_FIELDS, label: "string" },
    summary: "画椭圆",
    usage: "exdraw oval -f <file> --x 100 --y 80 --width 160 --height 70 --label Node",
    extraHelp: "    --label <s>               框内文字（也可写成位置参数）",
  },
  diamond: {
    kind: "draw",
    method: "diamond",
    positional: "label",
    fields: { ...STYLE_FIELDS, label: "string" },
    summary: "画菱形",
    usage: "exdraw diamond -f <file> --x 100 --y 80 --width 200 --height 90 --label \"条件？\"",
    extraHelp: "    --label <s>               框内文字（也可写成位置参数）",
  },
  line: {
    kind: "draw",
    method: "line",
    fields: { ...STYLE_FIELDS, points: "points" },
    summary: "画直线 / 折线",
    usage: "exdraw line -f <file> --points \"100,280;300,280;300,320\"",
    extraHelp: "    --points <s>              点列，如 \"0,0;100,50\" 或 \"[[0,0],[100,50]]\"",
  },
  arrow: {
    kind: "draw",
    method: "arrow",
    positional: "label",
    fields: {
      ...STYLE_FIELDS,
      points: "points",
      startArrowhead: "string",
      endArrowhead: "string",
      label: "string",
    },
    summary: "画箭头",
    usage: "exdraw arrow -f <file> --points \"200,130;200,200\" --label HTTP",
    extraHelp: `    --points <s>              点列，如 "0,0;0,80"
    --label <s>               箭头文字（也可写成位置参数）
    --start-arrowhead <s>     none | arrow | bar | circle | triangle | diamond
    --end-arrowhead <s>       默认 arrow`,
  },
  frame: {
    kind: "draw",
    method: "frame",
    positional: "name",
    fields: { ...STYLE_FIELDS, name: "string", children: "list" },
    summary: "画 Frame 容器",
    usage: "exdraw frame -f <file> --x 40 --y 40 --width 400 --height 300 --name Compute",
    extraHelp: `    --name <s>                帧名称（也可写成位置参数）
    --children <ids>          已有元素 id，逗号分隔`,
  },
  inspect: {
    kind: "meta",
    summary: "查看文件里的元素概要",
    usage: "exdraw inspect <file.excalidraw> [-v]",
  },
  run: {
    kind: "meta",
    summary: "执行 JS 绘图脚本（高级）",
    usage: "exdraw run <script.js> -o <out.excalidraw>",
  },
  build: {
    kind: "meta",
    summary: "把简化 JSON 转成 .excalidraw（高级）",
    usage: "exdraw build <scene.json> -o <out.excalidraw>",
  },
};

const ALIAS_TO_COMMAND = Object.fromEntries(
  Object.entries(COMMANDS).flatMap(([name, spec]) =>
    (spec.aliases ?? []).map((alias) => [alias, name])
  )
);

function resolveCommand(name) {
  if (!name) return null;
  if (COMMANDS[name]) return name;
  return ALIAS_TO_COMMAND[name] ?? null;
}

function applyAliases(flags) {
  const out = { ...flags };
  for (const [from, to] of Object.entries(FLAG_ALIASES)) {
    if (!(from in out)) continue;
    if (from === to) continue;
    if (!(to in out) || out[to] === true) out[to] = out[from];
    delete out[from];
  }
  return out;
}

function resolveFontFamily(value) {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" || /^\d+$/.test(String(value))) return Number(value);
  const key = String(value).toLowerCase();
  for (const [name, id] of Object.entries(FONT_FAMILY)) {
    if (name.toLowerCase() === key) return id;
  }
  throw new CliError(`未知字体 "${value}"，可选: ${Object.keys(FONT_FAMILY).join(", ")}`);
}

function resolveArrowhead(value) {
  if (value == null || value === "" || value === true) return undefined;
  const key = String(value).toLowerCase();
  if (key === "none" || key === "null") return null;
  if (!(key in ARROWHEAD) && !Object.values(ARROWHEAD).includes(key)) {
    throw new CliError(`未知箭头头部 "${value}"`);
  }
  return ARROWHEAD[key] ?? key;
}

function pickFile(flags, positionals, { required, positionalOk, cwd }) {
  const file = flags.file ?? flags.output ?? (positionalOk ? positionals[0] : null);
  if (required && !file) {
    throw new CliError("请用 -f <file.excalidraw> 指定要写入的文件");
  }
  return file ? resolve(cwd, file) : null;
}

function buildDrawOpts(spec, flags, positionals) {
  const aliased = applyAliases(flags);
  const opts = {};

  for (const [key, type] of Object.entries(spec.fields ?? {})) {
    if (!(key in aliased)) continue;
    if (aliased[key] === true && type !== "boolean") continue;
    opts[key] = coerce(aliased[key], type);
  }

  if (spec.positional && opts[spec.positional] == null && positionals[0] != null) {
    opts[spec.positional] = coerce(positionals[0], spec.fields[spec.positional] ?? "string");
  }

  if (opts.fontFamily != null) opts.fontFamily = resolveFontFamily(opts.fontFamily);
  if ("startArrowhead" in opts) opts.startArrowhead = resolveArrowhead(opts.startArrowhead);
  if ("endArrowhead" in opts) opts.endArrowhead = resolveArrowhead(opts.endArrowhead);

  for (const key of spec.required ?? []) {
    if (opts[key] == null || opts[key] === "") {
      throw new CliError(`缺少参数 --${key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}`);
    }
  }

  return opts;
}

function showHelp(print) {
  print(`
  exdraw — 用一条条 CLI 命令往 .excalidraw 里画图

  绘图命令（每次追加写入 -f 指定的文件）:
    text        写文字
    rect        画矩形          别名: rectangle
    oval        画椭圆          别名: ellipse
    diamond     画菱形
    line        画直线 / 折线
    arrow       画箭头
    frame       画 Frame
    background  设置画布背景色

  文件命令:
    new         新建空白画布
    inspect     查看元素概要

  用法:
    exdraw new  -f test.excalidraw
    exdraw text -f test.excalidraw --x 100 --y 20 --text "集群模式"
    exdraw rect -f test.excalidraw --x 100 --y 80 --width 320 --height 50 --label Browser --rounded
    exdraw arrow -f test.excalidraw --points "260,130;260,200" --label HTTP
    exdraw inspect test.excalidraw -v

  查看某条命令的参数:
    exdraw text --help
    exdraw rect --help
    exdraw arrow --help
`);
}

function showCommandHelp(name, print) {
  const spec = COMMANDS[name];
  print(`
  ${spec.usage}

  ${spec.summary}
${spec.kind === "draw" ? COMMON_DRAW_FLAGS : ""}${spec.extraHelp ? `\n${spec.extraHelp}\n` : ""}
`);
}

async function cmdNew(file, io) {
  const d = new Drawing();
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ 已创建空白画布: ${file}\n`);
}

async function cmdBackground(file, opts, io) {
  const d = await Drawing.load(file);
  d.background(opts.color);
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ background ${opts.color} → ${file}\n`);
}

async function cmdDraw(file, spec, opts, io) {
  const d = await Drawing.load(file);
  d[spec.method](opts);
  await d.save(file);
  if (!io.quiet) {
    io.stderr.write(`✓ ${spec.method} → ${file}（${d.toElements().length} 个元素）\n`);
  }
}

async function cmdInspect(file, verbose, io) {
  const raw = await readFile(file, "utf8");
  let data;
  try {
    data = deserialize(raw);
  } catch (e) {
    throw new CliError(`无法解析文件: ${e.message}`);
  }

  const out = [];
  out.push(`\n📄  ${file}`);
  out.push(`    版本: ${data.version}  元素数: ${data.elements.length}`);
  out.push(`    背景: ${data.appState?.viewBackgroundColor ?? "(默认)"}\n`);

  const groups = {};
  for (const el of data.elements) {
    groups[el.type] = (groups[el.type] ?? 0) + 1;
  }
  for (const [type, count] of Object.entries(groups)) {
    out.push(`    ${type.padEnd(14)} × ${count}`);
  }

  if (verbose) {
    out.push("\n── 元素详情 ──────────────────────────────────────");
    for (const el of data.elements) {
      const extra =
        el.type === "text" ? `  "${el.text?.slice(0, 40)}"` :
        el.type === "arrow" ? `  → ${el.endArrowhead}` : "";
      out.push(
        `  [${el.type}]  id=${el.id.slice(0, 8)}…  x=${el.x} y=${el.y}  w=${el.width} h=${el.height}${extra}`
      );
    }
  }
  out.push("");
  io.stdout.write(out.join("\n") + "\n");
}

async function cmdRun(scriptPath, outPath, io) {
  if (!scriptPath) throw new CliError("用法: exdraw run <script.js> -o out.excalidraw");
  const absPath = resolve(io.cwd, scriptPath);

  Object.assign(globalThis, {
    Drawing,
    rectangle, ellipse, diamond, text, line, arrow, frame,
    FONT_FAMILY, COLOR_PALETTE, FILL_STYLE, STROKE_STYLE,
    STROKE_WIDTH, ROUGHNESS, ROUNDNESS, ARROWHEAD,
  });

  let mod;
  try {
    mod = await import(pathToFileURL(absPath).href);
  } catch (e) {
    throw new CliError(`无法加载脚本 "${absPath}":\n  ${e.message}`);
  }

  const defaultExport = mod.default;
  let json;

  if (typeof defaultExport === "function") {
    const d = new Drawing();
    await defaultExport(d);
    json = d.toJSON();
  } else if (defaultExport instanceof Drawing) {
    json = defaultExport.toJSON();
  } else if (typeof defaultExport === "string") {
    json = defaultExport;
  } else if (defaultExport && typeof defaultExport === "object" && Array.isArray(defaultExport.elements)) {
    json = serialize(defaultExport.elements, defaultExport.appState);
  } else {
    throw new CliError(
      "脚本的 default export 必须是 function(drawing)、Drawing 实例、JSON 字符串或 { elements, appState }"
    );
  }

  if (outPath) {
    await writeFile(outPath, json, "utf8");
    if (!io.quiet) io.stderr.write(`✓ 已写入: ${outPath}\n`);
  } else {
    io.stdout.write(json + "\n");
  }
}

async function cmdBuild(jsonPath, outPath, io) {
  if (!jsonPath) throw new CliError("用法: exdraw build <scene.json> -o out.excalidraw");
  const raw = await readFile(resolve(io.cwd, jsonPath), "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new CliError(`JSON 解析失败: ${e.message}`);
  }

  const factories = { rectangle, ellipse, diamond, text, line, arrow, frame };
  const elements = (data.elements ?? []).map((el) => {
    if (!el.id || !el.seed) {
      const factory = factories[el.type];
      if (factory) {
        const built = factory(el);
        return Array.isArray(built) ? built : built;
      }
    }
    return el;
  }).flat();

  const json = serialize(elements, data.appState ?? {});
  if (outPath) {
    await writeFile(outPath, json, "utf8");
    if (!io.quiet) io.stderr.write(`✓ 已写入: ${outPath}\n`);
  } else {
    io.stdout.write(json + "\n");
  }
}

/**
 * @param {string[]} argv
 * @param {{ cwd?: string, stdout?: { write: Function }, stderr?: { write: Function } }} [options]
 */
export async function runCli(argv, options = {}) {
  const io = {
    cwd: options.cwd ?? process.cwd(),
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr,
    quiet: false,
  };

  const { command: rawCommand, positionals, flags } = parseArgv(argv);
  io.quiet = Boolean(flags.quiet || options.quiet);

  if (!rawCommand || rawCommand === "help") {
    if (rawCommand === "help" && positionals[0]) {
      const name = resolveCommand(positionals[0]);
      if (!name) throw new CliError(`未知命令: ${positionals[0]}`);
      showCommandHelp(name, (s) => io.stdout.write(s));
      return;
    }
    showHelp((s) => io.stdout.write(s));
    return;
  }

  const command = resolveCommand(rawCommand);
  if (!command) throw new CliError(`未知命令: ${rawCommand}\n输入 exdraw --help 查看可用命令`);

  const spec = COMMANDS[command];
  if (flags.help) {
    showCommandHelp(command, (s) => io.stdout.write(s));
    return;
  }

  if (command === "new") {
    const file = pickFile(flags, positionals, { required: true, positionalOk: true, cwd: io.cwd });
    await cmdNew(file, io);
    return;
  }

  if (command === "inspect") {
    const file = pickFile(flags, positionals, { required: true, positionalOk: true, cwd: io.cwd });
    await cmdInspect(file, Boolean(flags.verbose), io);
    return;
  }

  if (command === "run") {
    const outPath = flags.file ?? flags.output;
    await cmdRun(positionals[0], outPath ? resolve(io.cwd, outPath) : null, io);
    return;
  }

  if (command === "build") {
    const outPath = flags.file ?? flags.output;
    await cmdBuild(positionals[0], outPath ? resolve(io.cwd, outPath) : null, io);
    return;
  }

  const file = pickFile(flags, positionals, { required: true, positionalOk: false, cwd: io.cwd });

  if (command === "background") {
    const color = flags.color ?? flags.background ?? flags.fill ?? flags.bg ?? positionals[0];
    if (!color || color === true) throw new CliError("缺少背景色，例如: exdraw background -f t.excalidraw --color \"#f8f9fa\"");
    await cmdBackground(file, { color: String(color) }, io);
    return;
  }

  const opts = buildDrawOpts(spec, flags, positionals);
  await cmdDraw(file, spec, opts, io);
}

export async function main(argv = process.argv.slice(2)) {
  try {
    await runCli(argv);
  } catch (err) {
    const code = err instanceof CliError ? err.exitCode : 1;
    process.stderr.write(`\n❌ 错误: ${err.message}\n\n`);
    process.exitCode = code;
  }
}
