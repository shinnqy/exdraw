/**
 * CLI：每个基础绘图操作对应一条子命令，追加写入同一个 .excalidraw
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Drawing } from "./Drawing.js";
import { serialize, deserialize } from "./serialize.js";
import {
  rectangle, square, ellipse, circle, diamond, text, line, arrow,
  frame, freedraw, image, embeddable,
} from "./elements.js";
import {
  FONT_FAMILY, COLOR_PALETTE, FILL_STYLE, STROKE_STYLE,
  STROKE_WIDTH, ROUGHNESS, ROUNDNESS, ARROWHEAD,
} from "./constants.js";
import { parseArgv, coerce } from "./parse-args.js";

export class CliError extends Error {
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
  link: "string",
  locked: "boolean",
  frameId: "string",
  rounded: "boolean",
  sharp: "boolean",
  label: "string",
  labelColor: "string",
  labelSize: "number",
  labelAlign: "string",
};

const TEXT_FIELDS = {
  fontSize: "number",
  fontFamily: "string",
  textAlign: "string",
  verticalAlign: "string",
};

const CONNECTOR_FIELDS = {
  points: "points",
  from: "string",
  to: "string",
  fromSide: "string",
  toSide: "string",
  startArrowhead: "string",
  endArrowhead: "string",
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
  r: "radius",
  url: "link",
};

const COMMON_DRAW_FLAGS = `
    -f, --file <path>          要写入的 .excalidraw 文件（必填，不存在则创建）
    --x <n> --y <n>            左上角坐标
    --width, --w <n>           宽度
    --height <n>               高度
    --stroke, --color <c>      描边颜色
    --fill, --bg <c>           填充颜色
    --stroke-width <n>         1 / 2 / 4
    --stroke-style <s>         solid | dashed | dotted
    --fill-style <s>           solid | hachure | cross-hatch | zigzag
    --roughness <n>            0 | 1 | 2
    --opacity <n>              0-100
    --angle <deg>              旋转角度（度）
    --id <id>                  自定义元素 id（供箭头 --from/--to 使用）
    --link <url>               超链接
    --locked                   锁定
    --frame-id <id>            放入已有 frame
    --label <s>                框内 / 箭头文字
    --label-color --label-size --label-align
    --rounded / --sharp        圆角或直角
    -q, --quiet
`;

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
    fields: { ...STYLE_FIELDS, ...TEXT_FIELDS, text: "string" },
    summary: "写文字",
    usage: "exdraw text -f <file> --x 100 --y 20 --text \"标题\"",
    extraHelp: `    --text <s>                文字（也可写成位置参数）
    --font-size <n>            字号，默认 20
    --font-family <s>          Excalifont | Nunito | "Comic Shanns"
    --text-align <s>           left | center | right
    --vertical-align <s>       top | middle | bottom`,
  },
  rect: {
    kind: "draw",
    method: "rect",
    aliases: ["rectangle"],
    positional: "label",
    fields: { ...STYLE_FIELDS },
    summary: "画矩形（默认圆角，与官方 UI 一致）",
    usage: "exdraw rect -f <file> --x 100 --y 80 --width 200 --height 50 --label Browser",
    extraHelp: "    --sharp                   直角矩形（默认圆角）",
  },
  square: {
    kind: "draw",
    method: "square",
    positional: "label",
    fields: { ...STYLE_FIELDS, size: "number" },
    summary: "画正方形",
    usage: "exdraw square -f <file> --x 100 --y 80 --size 120 --label Box",
    extraHelp: "    --size <n>                边长（也可用 --width）",
  },
  diamond: {
    kind: "draw",
    method: "diamond",
    positional: "label",
    fields: { ...STYLE_FIELDS },
    summary: "画菱形",
    usage: "exdraw diamond -f <file> --x 100 --y 80 --width 200 --height 90 --label \"条件？\"",
  },
  oval: {
    kind: "draw",
    method: "oval",
    aliases: ["ellipse"],
    positional: "label",
    fields: { ...STYLE_FIELDS },
    summary: "画椭圆",
    usage: "exdraw oval -f <file> --x 100 --y 80 --width 160 --height 70 --label Node",
  },
  circle: {
    kind: "draw",
    method: "circle",
    positional: "label",
    fields: {
      ...STYLE_FIELDS,
      radius: "number",
      diameter: "number",
      cx: "number",
      cy: "number",
    },
    summary: "画圆",
    usage: "exdraw circle -f <file> --cx 200 --cy 200 --r 60 --label Start",
    extraHelp: `    --r, --radius <n>         半径
    --diameter <n>            直径
    --cx --cy                 圆心（也可用 --x --y 表示左上角）`,
  },
  line: {
    kind: "draw",
    method: "line",
    fields: { ...STYLE_FIELDS, ...CONNECTOR_FIELDS, polygon: "boolean" },
    summary: "画直线 / 折线",
    usage: "exdraw line -f <file> --points \"100,280;300,280;300,320\"",
    extraHelp: `    --points <s>              点列，必须加引号："0,0;100,50"
    --rounded                 曲线
    --polygon                 闭合多边形
    --from / --to <id>        绑到已有形状`,
  },
  arrow: {
    kind: "draw",
    method: "arrow",
    positional: "label",
    fields: { ...STYLE_FIELDS, ...CONNECTOR_FIELDS, elbow: "boolean", elbowed: "boolean" },
    summary: "画箭头（可绑到形状）",
    usage: "exdraw arrow -f <file> --from browser --to web --label HTTP",
    extraHelp: `    --points <s>              点列，如 "0,0;0,80"
    --from / --to <id>        绑到已有形状的 id
    --from-side / --to-side   left | right | top | bottom | center
    --elbow                   直角折线箭头（K8s/架构图常用）
    --start-arrowhead <s>     none | arrow | bar | circle | triangle | diamond
    --end-arrowhead <s>       默认 arrow
    --sharp                   直线箭头（默认略带弧度）`,
  },
  freedraw: {
    kind: "draw",
    method: "freedraw",
    aliases: ["draw"],
    required: ["points"],
    fields: { ...STYLE_FIELDS, points: "points" },
    summary: "手绘笔迹",
    usage: "exdraw freedraw -f <file> --points \"0,0;8,4;20,10;36,6\"",
    extraHelp: "    --points <s>              笔迹点列（必填）",
  },
  image: {
    kind: "draw",
    method: "image",
    aliases: ["img"],
    required: ["src"],
    fields: { ...STYLE_FIELDS, src: "string" },
    summary: "插入本地图片",
    usage: "exdraw image -f <file> --src ./logo.png --x 0 --y 0 --width 200",
    extraHelp: "    --src <path>              本地图片路径（必填）",
  },
  frame: {
    kind: "draw",
    method: "frame",
    positional: "name",
    fields: { ...STYLE_FIELDS, name: "string", children: "list" },
    summary: "画 Frame 容器",
    usage: "exdraw frame -f <file> --x 40 --y 40 --width 400 --height 300 --name Compute",
    extraHelp: `    --name <s>                帧名称
    --children <ids>          已有元素 id，逗号分隔`,
  },
  embed: {
    kind: "draw",
    method: "embed",
    aliases: ["embeddable"],
    positional: "link",
    required: ["link"],
    fields: { ...STYLE_FIELDS, link: "string" },
    summary: "嵌入网页",
    usage: "exdraw embed -f <file> --x 0 --y 0 --width 480 --height 320 --link https://example.com",
  },
  group: {
    kind: "draw",
    method: "group",
    required: ["ids"],
    fields: { ids: "list", id: "string" },
    summary: "把已有元素编成一组",
    usage: "exdraw group -f <file> --ids a,b,c",
    extraHelp: "    --ids <ids>               元素 id，逗号分隔",
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
    if (!(from in out) || from === to) continue;
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
  if (opts.angle != null) opts.angle = (opts.angle * Math.PI) / 180;
  if (opts.elbow != null) opts.elbowed = opts.elbow;

  if (typeof opts.label === "string" && (opts.labelColor || opts.labelSize || opts.labelAlign)) {
    opts.label = {
      text: opts.label,
      strokeColor: opts.labelColor,
      fontSize: opts.labelSize,
      textAlign: opts.labelAlign ?? "center",
      verticalAlign: "middle",
    };
  }
  delete opts.labelColor;
  delete opts.labelSize;
  delete opts.labelAlign;

  for (const key of spec.required ?? []) {
    if (opts[key] == null || opts[key] === "") {
      throw new CliError(`缺少参数 --${key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}`);
    }
  }

  return opts;
}

function showHelp(print) {
  print(`
  exdraw — 每个基础操作一条 CLI 命令，追加写入 .excalidraw

  形状:
    rect        矩形（默认圆角）    别名: rectangle
    square      正方形
    diamond     菱形
    oval        椭圆                别名: ellipse
    circle      圆

  线与箭头:
    line        直线 / 折线 / 多边形
    arrow       箭头（支持 --from/--to 绑定）
    freedraw    手绘                别名: draw

  文字与媒体:
    text        文字
    image       本地图片            别名: img
    embed       嵌入网页            别名: embeddable

  结构:
    frame       Frame 容器
    group       编组
    background  画布背景色

  文件:
    new         新建空白画布
    inspect     查看元素概要

  用法:
    exdraw new -f test.excalidraw
    exdraw rect -f test.excalidraw --id browser --x 100 --y 80 --width 200 --height 50 --label Browser
    exdraw rect -f test.excalidraw --id web --x 100 --y 200 --width 200 --height 50 --label Web
    exdraw arrow -f test.excalidraw --from browser --to web --label HTTP
    exdraw circle -f test.excalidraw --cx 400 --cy 120 --r 40 --label DB
    exdraw inspect test.excalidraw -v

  查看某条命令的参数:
    exdraw rect --help
    exdraw arrow --help
    exdraw circle --help
`);
}

function showCommandHelp(name, print) {
  const spec = COMMANDS[name];
  print(`
  ${spec.usage}

  ${spec.summary}
${spec.kind === "draw" && name !== "background" && name !== "group" ? COMMON_DRAW_FLAGS : ""}${spec.extraHelp ? `\n${spec.extraHelp}\n` : ""}
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
  try {
    d[spec.method](opts);
  } catch (err) {
    throw new CliError(err.message);
  }
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
  out.push(`    版本: ${data.version}  元素数: ${data.elements.length}  图片: ${Object.keys(data.files ?? {}).length}`);
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
        el.type === "arrow" ? `  → ${el.endArrowhead}${el.elbowed ? "  elbow" : ""}` :
        el.type === "image" ? `  file=${el.fileId?.slice(0, 8) ?? "-"}` : "";
      out.push(
        `  [${el.type}]  id=${el.id}  x=${Math.round(el.x)} y=${Math.round(el.y)}  w=${Math.round(el.width)} h=${Math.round(el.height)}${extra}`
      );
    }
  }
  out.push("");
  io.stdout.write(out.join("\n") + "\n");
}

const FACTORIES = {
  rectangle, square, ellipse, circle, diamond, text, line, arrow,
  frame, freedraw, image, embeddable,
};

async function cmdRun(scriptPath, outPath, io) {
  if (!scriptPath) throw new CliError("用法: exdraw run <script.js> -o out.excalidraw");
  const absPath = resolve(io.cwd, scriptPath);

  Object.assign(globalThis, {
    Drawing,
    ...FACTORIES,
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
    json = serialize(defaultExport.elements, defaultExport.appState, defaultExport.files);
  } else {
    throw new CliError("脚本的 default export 必须是 function(drawing)、Drawing 实例、JSON 字符串或 { elements, appState }");
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

  const typeMap = {
    rectangle, square, ellipse, circle, diamond, text, line, arrow,
    frame, freedraw, image, embeddable,
  };
  const files = { ...(data.files ?? {}) };
  const elements = (data.elements ?? []).flatMap((el) => {
    if (!el.id || !el.seed) {
      const factory = typeMap[el.type];
      if (factory) {
        const built = factory(el);
        if (built?.element) {
          if (built.file) files[built.file.id] = built.file;
          return [built.element];
        }
        return Array.isArray(built) ? built : [built];
      }
    }
    return [el];
  });

  const json = serialize(elements, data.appState ?? {}, files);
  if (outPath) {
    await writeFile(outPath, json, "utf8");
    if (!io.quiet) io.stderr.write(`✓ 已写入: ${outPath}\n`);
  } else {
    io.stdout.write(json + "\n");
  }
}

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
    await cmdNew(pickFile(flags, positionals, { required: true, positionalOk: true, cwd: io.cwd }), io);
    return;
  }
  if (command === "inspect") {
    await cmdInspect(pickFile(flags, positionals, { required: true, positionalOk: true, cwd: io.cwd }), Boolean(flags.verbose), io);
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
    if (!color || color === true) {
      throw new CliError("缺少背景色，例如: exdraw background -f t.excalidraw --color \"#f8f9fa\"");
    }
    await cmdBackground(file, { color: String(color) }, io);
    return;
  }

  const opts = buildDrawOpts(spec, flags, positionals);
  if (opts.src) opts.src = resolve(io.cwd, opts.src);
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
