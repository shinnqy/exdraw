/**
 * CLI：每个基础绘图操作对应一条子命令，追加写入同一个 .excalidraw
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Drawing } from "./Drawing.js";
import { validateScene } from "./edit.js";
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

// JS 文件生成入口保留源码以便内部兼容，但对 CLI 使用方永久关闭。
const ENABLE_JS_ENTRYPOINT = false;

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

const COMMON_STYLE_PARAMS = [
  ["-f, --file <path>", "写入的 .excalidraw 文件（不存在则创建）", true],
  ["--x <n>", "左上角 x"],
  ["--y <n>", "左上角 y"],
  ["--width, --w <n>", "宽度"],
  ["--height <n>", "高度"],
  ["--stroke, --color <c>", "描边颜色"],
  ["--fill, --bg <c>", "填充颜色"],
  ["--stroke-width <n>", "描边宽度：1 / 2 / 4"],
  ["--stroke-style <s>", "solid | dashed | dotted"],
  ["--fill-style <s>", "solid | hachure | cross-hatch | zigzag"],
  ["--roughness <n>", "0 平滑 / 1 默认 / 2 粗糙"],
  ["--opacity <n>", "不透明度 0-100"],
  ["--angle <deg>", "旋转角度（度）"],
  ["--id <id>", "自定义元素 id，供箭头 --from/--to 使用"],
  ["--link <url>", "超链接"],
  ["--locked", "锁定，不可选中"],
  ["--frame-id <id>", "放入已有 frame"],
  ["--label <s>", "框内 / 箭头文字（也可写成位置参数）"],
  ["--label-color <c>", "标签颜色"],
  ["--label-size <n>", "标签字号"],
  ["--label-align <s>", "left | center | right"],
  ["--rounded", "圆角"],
  ["--sharp", "直角 / 直线"],
  ["-q, --quiet", "少打印"],
];

const COMMON_DRAW_FLAGS = COMMON_STYLE_PARAMS
  .map(([flag, desc]) => `    ${flag.padEnd(26)} ${desc}`)
  .join("\n");

const COMMAND_GROUPS = [
  ["shape", "形状"],
  ["line", "线与箭头"],
  ["media", "文字与媒体"],
  ["structure", "结构"],
  ["file", "文件"],
];

function P(flag, desc, required = false) {
  return { flag, desc, required };
}

const COMMANDS = {
  new: {
    kind: "meta",
    group: "file",
    usesFile: true,
    summary: "新建空白画布（覆盖已有文件）",
    usage: "exdraw new -f <file.excalidraw>",
    params: [
      P("-f, --file <path>", "输出文件（也可写成位置参数）", true),
    ],
  },
  background: {
    kind: "draw",
    group: "structure",
    method: "background",
    usesFile: true,
    positional: "color",
    fields: { color: "string" },
    summary: "设置画布背景色",
    usage: "exdraw background -f <file> --color \"#f8f9fa\"",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--color <c>", "背景色；也可写成位置参数", true),
    ],
  },
  text: {
    kind: "draw",
    group: "media",
    method: "text",
    usesStyle: true,
    usesFile: true,
    positional: "text",
    required: ["text"],
    fields: { ...STYLE_FIELDS, ...TEXT_FIELDS, text: "string" },
    summary: "写文字",
    usage: "exdraw text -f <file> --x 100 --y 20 --text \"标题\"",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--text <s>", "文字内容；也可写成位置参数", true),
      P("--x <n> --y <n>", "左上角"),
      P("--font-size <n>", "字号，默认 20"),
      P("--font-family <s>", "Excalifont | Nunito | \"Comic Shanns\""),
      P("--text-align <s>", "left | center | right"),
      P("--vertical-align <s>", "top | middle | bottom"),
    ],
  },
  rect: {
    kind: "draw",
    group: "shape",
    method: "rect",
    usesStyle: true,
    usesFile: true,
    aliases: ["rectangle"],
    positional: "label",
    fields: { ...STYLE_FIELDS },
    summary: "画矩形（默认圆角，与官方 UI 一致）",
    usage: "exdraw rect -f <file> --x 100 --y 80 --width 200 --height 50 --label Browser",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--x <n> --y <n>", "左上角"),
      P("--width --height <n>", "宽高"),
      P("--label <s>", "框内文字；也可写成位置参数"),
      P("--sharp", "直角矩形（默认圆角）"),
    ],
  },
  square: {
    kind: "draw",
    group: "shape",
    method: "square",
    usesStyle: true,
    usesFile: true,
    positional: "label",
    fields: { ...STYLE_FIELDS, size: "number" },
    summary: "画正方形",
    usage: "exdraw square -f <file> --x 100 --y 80 --size 120 --label Box",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--size <n>", "边长（也可用 --width）"),
      P("--label <s>", "框内文字；也可写成位置参数"),
    ],
  },
  diamond: {
    kind: "draw",
    group: "shape",
    method: "diamond",
    usesStyle: true,
    usesFile: true,
    positional: "label",
    fields: { ...STYLE_FIELDS },
    summary: "画菱形",
    usage: "exdraw diamond -f <file> --x 100 --y 80 --width 200 --height 90 --label \"条件？\"",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--x <n> --y <n> --width --height", "位置与尺寸"),
      P("--label <s>", "框内文字；也可写成位置参数"),
    ],
  },
  oval: {
    kind: "draw",
    group: "shape",
    method: "oval",
    usesStyle: true,
    usesFile: true,
    aliases: ["ellipse"],
    positional: "label",
    fields: { ...STYLE_FIELDS },
    summary: "画椭圆",
    usage: "exdraw oval -f <file> --x 100 --y 80 --width 160 --height 70 --label Node",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--x <n> --y <n> --width --height", "外接矩形"),
      P("--label <s>", "框内文字；也可写成位置参数"),
    ],
  },
  circle: {
    kind: "draw",
    group: "shape",
    method: "circle",
    usesStyle: true,
    usesFile: true,
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
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--r, --radius <n>", "半径"),
      P("--diameter <n>", "直径"),
      P("--cx <n> --cy <n>", "圆心（也可用 --x --y 表示左上角）"),
      P("--label <s>", "圆内文字；也可写成位置参数"),
    ],
  },
  line: {
    kind: "draw",
    group: "line",
    method: "line",
    usesStyle: true,
    usesFile: true,
    fields: { ...STYLE_FIELDS, ...CONNECTOR_FIELDS, polygon: "boolean" },
    summary: "画直线 / 折线",
    usage: "exdraw line -f <file> --points \"100,280;300,280;300,320\"",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--points <s>", "点列，zsh 必须加引号：\"0,0;100,50\""),
      P("--rounded", "曲线"),
      P("--polygon", "闭合多边形"),
      P("--from <id> --to <id>", "绑到已有形状"),
      P("--from-side --to-side", "left | right | top | bottom | center"),
    ],
  },
  arrow: {
    kind: "draw",
    group: "line",
    method: "arrow",
    usesStyle: true,
    usesFile: true,
    positional: "label",
    fields: { ...STYLE_FIELDS, ...CONNECTOR_FIELDS, elbow: "boolean", elbowed: "boolean" },
    summary: "画箭头（可绑到形状）",
    usage: "exdraw arrow -f <file> --from browser --to web --label HTTP",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--points <s>", "点列，如 \"0,0;0,80\"（与 --from/--to 二选一）"),
      P("--from <id> --to <id>", "绑到已有形状的 id"),
      P("--from-side --to-side", "left | right | top | bottom | center"),
      P("--elbow", "直角折线箭头"),
      P("--label <s>", "箭头文字；也可写成位置参数"),
      P("--start-arrowhead <s>", "none | arrow | bar | circle | triangle | diamond"),
      P("--end-arrowhead <s>", "末端箭头，默认 arrow"),
      P("--sharp", "直线箭头（默认略带弧度）"),
    ],
  },
  freedraw: {
    kind: "draw",
    group: "line",
    method: "freedraw",
    usesStyle: true,
    usesFile: true,
    aliases: ["draw"],
    required: ["points"],
    fields: { ...STYLE_FIELDS, points: "points" },
    summary: "手绘笔迹",
    usage: "exdraw freedraw -f <file> --points \"0,0;8,4;20,10;36,6\"",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--points <s>", "笔迹点列", true),
    ],
  },
  image: {
    kind: "draw",
    group: "media",
    method: "image",
    usesStyle: true,
    usesFile: true,
    aliases: ["img"],
    required: ["src"],
    fields: { ...STYLE_FIELDS, src: "string" },
    summary: "插入本地图片",
    usage: "exdraw image -f <file> --src ./logo.png --x 0 --y 0 --width 200",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--src <path>", "本地图片路径", true),
      P("--x <n> --y <n> --width --height", "位置与显示尺寸"),
    ],
  },
  frame: {
    kind: "draw",
    group: "structure",
    method: "frame",
    usesStyle: true,
    usesFile: true,
    positional: "name",
    fields: { ...STYLE_FIELDS, name: "string", children: "list" },
    summary: "画 Frame 容器",
    usage: "exdraw frame -f <file> --x 40 --y 40 --width 400 --height 300 --name Compute",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--name <s>", "帧名称；也可写成位置参数"),
      P("--x --y --width --height", "位置与尺寸"),
      P("--children <ids>", "已有元素 id，逗号分隔"),
    ],
  },
  embed: {
    kind: "draw",
    group: "media",
    method: "embed",
    usesStyle: true,
    usesFile: true,
    aliases: ["embeddable"],
    positional: "link",
    required: ["link"],
    fields: { ...STYLE_FIELDS, link: "string" },
    summary: "嵌入网页",
    usage: "exdraw embed -f <file> --x 0 --y 0 --width 480 --height 320 --link https://example.com",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--link <url>", "嵌入地址；也可写成位置参数", true),
      P("--x --y --width --height", "位置与尺寸"),
    ],
  },
  group: {
    kind: "draw",
    group: "structure",
    method: "group",
    usesFile: true,
    required: ["ids"],
    fields: { ids: "list", id: "string" },
    summary: "把已有元素编成一组",
    usage: "exdraw group -f <file> --ids a,b,c",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--ids <ids>", "元素 id，逗号分隔", true),
      P("--id <id>", "自定义组 id"),
    ],
  },
  edit: {
    kind: "edit",
    group: "file",
    usesFile: true,
    summary: "按元素类型编辑已有元素（rect/text/arrow/line 等）",
    usage: "exdraw edit <type> -f <file> --id <id> [options]",
    params: [
      P("<type>", "rect | text | arrow | line | diamond | oval | circle | image | embed | frame", true),
      P("-f, --file <path>", "写入文件", true),
      P("--id <id>", "要修改的元素 id", true),
    ],
  },
  label: {
    kind: "edit",
    group: "media",
    usesFile: true,
    required: ["container", "text"],
    fields: {
      container: "string",
      text: "string",
      ...TEXT_FIELDS,
      strokeColor: "string",
      backgroundColor: "string",
      opacity: "number",
      link: "string",
      locked: "boolean",
    },
    summary: "给已有容器新增或修改绑定文本",
    usage: "exdraw label -f <file> --container <shape-id> --text \"新标签\"",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--container <id>", "承载文本的形状 / 箭头 id", true),
      P("--text <s>", "文本内容", true),
      P("--font-size <n>", "字号"),
      P("--font-family <s>", "字体"),
      P("--text-align <s>", "left | center | right"),
      P("--vertical-align <s>", "top | middle | bottom"),
    ],
  },
  bind: {
    kind: "edit",
    group: "line",
    usesFile: true,
    required: ["id"],
    fields: { id: "string", from: "string", to: "string", fromSide: "string", toSide: "string" },
    summary: "修改已有线 / 箭头的端点绑定",
    usage: "exdraw bind -f <file> --id <arrow-id> --from <id> --to <id>",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--id <id>", "线 / 箭头 id", true),
      P("--from <id>", "起点元素 id"),
      P("--to <id>", "终点元素 id"),
      P("--from-side --to-side", "left | right | top | bottom | center"),
    ],
  },
  unbind: {
    kind: "edit",
    group: "line",
    usesFile: true,
    required: ["id"],
    fields: { id: "string", side: "string" },
    summary: "解除已有线 / 箭头的端点绑定",
    usage: "exdraw unbind -f <file> --id <arrow-id> --side from",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--id <id>", "线 / 箭头 id", true),
      P("--side <s>", "from | to | both，默认 both"),
    ],
  },
  move: {
    kind: "edit",
    group: "structure",
    usesFile: true,
    required: ["ids", "dx", "dy"],
    fields: { ids: "list", dx: "number", dy: "number" },
    summary: "移动一个或多个已有元素",
    usage: "exdraw move -f <file> --ids a,b --dx 20 --dy 10",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--ids <ids>", "元素 id，逗号分隔", true),
      P("--dx <n> --dy <n>", "相对位移", true),
    ],
  },
  resize: {
    kind: "edit",
    group: "structure",
    usesFile: true,
    required: ["id"],
    fields: { id: "string", width: "number", height: "number" },
    summary: "调整已有元素尺寸",
    usage: "exdraw resize -f <file> --id a --width 300 --height 100",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--id <id>", "元素 id", true),
      P("--width --height <n>", "新尺寸，至少提供一个", true),
    ],
  },
  rotate: {
    kind: "edit",
    group: "structure",
    usesFile: true,
    required: ["ids", "angle"],
    fields: { ids: "list", angle: "number", relative: "boolean" },
    summary: "旋转一个或多个已有元素",
    usage: "exdraw rotate -f <file> --ids a,b --angle 15",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--ids <ids>", "元素 id，逗号分隔", true),
      P("--angle <deg>", "角度；默认绝对角度", true),
      P("--relative", "相对当前角度增加"),
    ],
  },
  delete: {
    kind: "edit",
    group: "structure",
    usesFile: true,
    required: ["ids"],
    fields: { ids: "list", cascade: "boolean" },
    summary: "软删除已有元素并修复引用",
    usage: "exdraw delete -f <file> --ids a,b",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--ids <ids>", "元素 id，逗号分隔", true),
      P("--cascade / --no-cascade", "是否连带删除绑定文本，默认是"),
    ],
  },
  purge: {
    kind: "edit",
    group: "structure",
    usesFile: true,
    required: ["ids"],
    fields: { ids: "list" },
    summary: "物理移除元素并清理无引用图片文件",
    usage: "exdraw purge -f <file> --ids a,b",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--ids <ids>", "元素 id，逗号分隔", true),
    ],
  },
  ungroup: {
    kind: "edit",
    group: "structure",
    usesFile: true,
    fields: { groupId: "string", ids: "list" },
    summary: "解除已有编组",
    usage: "exdraw ungroup -f <file> --group-id <group-id>",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--group-id <id>", "组 id"),
      P("--ids <ids>", "从这些元素推断其组 id"),
    ],
  },
  unframe: {
    kind: "edit",
    group: "structure",
    usesFile: true,
    fields: { frameId: "string", ids: "list" },
    summary: "将元素移出 Frame",
    usage: "exdraw unframe -f <file> --frame-id <frame-id>",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--frame-id <id>", "Frame id"),
      P("--ids <ids>", "元素 id，逗号分隔"),
    ],
  },
  order: {
    kind: "edit",
    group: "structure",
    usesFile: true,
    required: ["ids"],
    fields: { ids: "list", before: "string", after: "string", front: "boolean", back: "boolean" },
    summary: "调整元素图层顺序并维护 fractional index",
    usage: "exdraw order -f <file> --ids a,b --before c",
    params: [
      P("-f, --file <path>", "写入文件", true),
      P("--ids <ids>", "元素 id，逗号分隔", true),
      P("--before <id> / --after <id>", "放到目标前 / 后"),
      P("--front / --back", "置顶 / 置底"),
    ],
  },
  inspect: {
    kind: "meta",
    group: "file",
    summary: "查看文件里的元素概要",
    usage: "exdraw inspect <file.excalidraw> [-v]",
    params: [
      P("<file> / -f <file>", "要查看的 .excalidraw 文件", true),
      P("-v, --verbose", "列出每个元素的 id、坐标、尺寸"),
      P("--id <id>", "只查看一个元素"),
      P("--type <type>", "只查看一种元素类型"),
      P("--refs", "显示 container / binding / group 引用"),
    ],
  },
  validate: {
    kind: "meta",
    group: "file",
    summary: "校验元素引用、文件引用和 fractional index",
    usage: "exdraw validate <file.excalidraw>",
    params: [
      P("<file> / -f <file>", "要校验的 .excalidraw 文件", true),
      P("--strict", "将警告也作为失败处理"),
    ],
  },
  run: {
    kind: "meta",
    group: "file",
    summary: "执行 JS 绘图脚本（高级）",
    usage: "exdraw run <script.js> -o <out.excalidraw>",
    params: [
      P("<script.js>", "绘图脚本路径", true),
      P("-o, --file <path>", "输出 .excalidraw；省略则打印到 stdout"),
    ],
  },
  build: {
    kind: "meta",
    group: "file",
    summary: "把简化 JSON 转成 .excalidraw（高级）",
    usage: "exdraw build <scene.json> -o <out.excalidraw>",
    params: [
      P("<scene.json>", "简化场景 JSON", true),
      P("-o, --file <path>", "输出 .excalidraw；省略则打印到 stdout"),
    ],
  },
};

if (!ENABLE_JS_ENTRYPOINT) {
  delete COMMANDS.run;
}

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

function formatParamLine(param, flagWidth = 28) {
  const mark = param.required ? "必填  " : "      ";
  return `    ${mark}${param.flag.padEnd(flagWidth)} ${param.desc}`;
}

function requiredLine(spec) {
  const req = (spec.params ?? []).filter((p) => p.required).map((p) => p.flag);
  return req.length ? req.join("；") : "无（除文件外均可选）";
}

function renderCommandBlock(name, spec, { includeCommon = false } = {}) {
  const alias = spec.aliases?.length ? `    别名: ${spec.aliases.join(", ")}` : "";
  const lines = [
    `  ${name}`,
    `    能力: ${spec.summary}`,
    alias,
    `    用法: ${spec.usage}`,
    `    必填: ${requiredLine(spec)}`,
    "    参数:",
  ].filter(Boolean);

  for (const p of spec.params ?? []) {
    lines.push(formatParamLine(p));
  }
  if (includeCommon && spec.usesStyle) {
    lines.push("    另外可用上面的「绘图通用参数」（颜色、描边、圆角等）");
  }
  return lines.join("\n");
}

function showHelp(print) {
  const chunks = [
    "  exdraw — 每个基础操作一条 CLI 命令，追加写入 .excalidraw",
    "",
    "  全局:",
    "    exdraw --help              列出全部子命令、能力与参数",
    "    exdraw <命令> --help       只看某一条命令",
    "    -q, --quiet                少打印",
    "",
    "  绘图通用参数（形状 / 线 / 文字 / 图片 / frame 均可使用）:",
  ];
  for (const [flag, desc, required] of COMMON_STYLE_PARAMS) {
    chunks.push(formatParamLine({ flag, desc, required }));
  }
  chunks.push("");

  for (const [groupId, title] of COMMAND_GROUPS) {
    chunks.push(`  ── ${title} ──`);
    chunks.push("");
    for (const [name, spec] of Object.entries(COMMANDS)) {
      if (spec.group !== groupId) continue;
      chunks.push(renderCommandBlock(name, spec, { includeCommon: true }));
      chunks.push("");
    }
  }

  chunks.push("  示例:");
  chunks.push("    exdraw new -f test.excalidraw");
  chunks.push("    exdraw text -f test.excalidraw --x 100 --y 20 --text \"集群模式\"");
  chunks.push("    exdraw rect -f test.excalidraw --id browser --x 100 --y 80 --width 200 --height 50 --label Browser");
  chunks.push("    exdraw arrow -f test.excalidraw --from browser --to web --label HTTP");
  chunks.push("    exdraw circle -f test.excalidraw --cx 400 --cy 120 --r 40 --label DB");
  chunks.push("    exdraw edit rect -f test.excalidraw --id browser --x 120 --width 240");
  chunks.push("    exdraw move -f test.excalidraw --ids browser,web --dx 20 --dy 10");
  chunks.push("    exdraw validate test.excalidraw");
  chunks.push("    exdraw inspect test.excalidraw -v");
  chunks.push("");
  print(`\n${chunks.join("\n")}\n`);
}

function showCommandHelp(name, print) {
  const spec = COMMANDS[name];
  const extra = spec.usesStyle
    ? `\n  通用样式参数:\n${COMMON_DRAW_FLAGS}\n`
    : "";
  print(`\n${renderCommandBlock(name, spec)}\n${extra}\n`);
}

const EDIT_TYPE_ALIASES = {
  rect: "rect",
  rectangle: "rect",
  square: "square",
  diamond: "diamond",
  oval: "oval",
  ellipse: "oval",
  circle: "circle",
  text: "text",
  line: "line",
  arrow: "arrow",
  freedraw: "freedraw",
  draw: "freedraw",
  image: "image",
  img: "image",
  embed: "embed",
  embeddable: "embed",
  frame: "frame",
};

function resolveEditType(rawType) {
  const type = EDIT_TYPE_ALIASES[String(rawType ?? "").toLowerCase()];
  if (!type) {
    throw new CliError(`未知编辑类型: ${rawType ?? ""}；可选 rect/text/arrow/line/diamond/oval/circle/image/embed/frame`);
  }
  return type;
}

function editTypeSpec(type) {
  const spec = COMMANDS[type];
  if (!spec) throw new CliError(`未知编辑类型: ${type}`);
  return { ...spec, required: [] };
}

function showEditTypeHelp(rawType, print) {
  const type = resolveEditType(rawType);
  const base = editTypeSpec(type);
  const spec = {
    ...base,
    summary: `编辑已有元素：${base.summary}`,
    usage: `exdraw edit ${type} -f <file> --id <id> [options]`,
    params: [
      P("--id <id>", "要修改的元素 id", true),
      ...(base.params ?? []).map((param) =>
        param.flag.startsWith("-f") ? param : { ...param, required: false }
      ),
    ],
  };
  const extra = spec.usesStyle
    ? `\n  通用样式参数:\n${COMMON_DRAW_FLAGS}\n`
    : "";
  print(`\n${renderCommandBlock(`edit ${type}`, spec)}\n${extra}\n`);
}

function expectedElementTypes(type) {
  if (type === "rect" || type === "square") return ["rectangle"];
  if (type === "oval" || type === "circle") return ["ellipse"];
  if (type === "embed") return ["embeddable"];
  if (type === "freedraw") return ["freedraw"];
  return [type];
}

function roundnessForEdit(type, opts, current) {
  if (!opts.sharp && opts.rounded == null) return;
  if (opts.sharp) return null;
  if (!opts.rounded) return current.roundness;
  if (current.roundness) return current.roundness;
  if (type === "rect" || type === "square" || current.type === "rectangle") {
    return { type: ROUNDNESS.ADAPTIVE_RADIUS };
  }
  if (["diamond", "oval", "circle"].includes(type)) {
    return { type: ROUNDNESS.PROPORTIONAL_RADIUS };
  }
  if (["line", "arrow"].includes(type)) {
    return { type: ROUNDNESS.PROPORTIONAL_RADIUS };
  }
  return null;
}

function formatValidationReport(report) {
  const lines = [
    `元素: ${report.stats.elements}（活动 ${report.stats.activeElements}）  文件: ${report.stats.files}`,
    report.ok ? "结果: OK" : `结果: FAIL（${report.errors.length} 个错误）`,
  ];
  for (const error of report.errors) lines.push(`  ✗ ${error}`);
  for (const warning of report.warnings) lines.push(`  ! ${warning}`);
  return lines.join("\n") + "\n";
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

async function cmdLabel(file, opts, io) {
  const d = await Drawing.load(file);
  const { container, text: content, ...labelOpts } = opts;
  d.label(container, { ...labelOpts, text: content });
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ label ${container} → ${file}\n`);
}

async function cmdBind(file, opts, io) {
  if (opts.from == null && opts.to == null) {
    throw new CliError("bind 至少需要 --from 或 --to");
  }
  const d = await Drawing.load(file);
  const binding = {};
  for (const key of ["from", "to", "fromSide", "toSide"]) {
    if (Object.prototype.hasOwnProperty.call(opts, key)) binding[key] = opts[key];
  }
  d.bind(opts.id, binding);
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ bind ${opts.id} → ${file}\n`);
}

async function cmdUnbind(file, opts, io) {
  const side = opts.side ?? "both";
  if (!["from", "to", "both"].includes(side)) {
    throw new CliError("--side 只能是 from、to 或 both");
  }
  const d = await Drawing.load(file);
  d.unbind(opts.id, side);
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ unbind ${opts.id} ${side} → ${file}\n`);
}

async function cmdEdit(file, rawType, flags, positionals, io) {
  const type = resolveEditType(rawType);
  const opts = buildDrawOpts(editTypeSpec(type), flags, positionals);
  const id = opts.id;
  if (!id) throw new CliError("编辑已有元素必须指定 --id <id>");
  delete opts.id;
  if (opts.src) opts.src = resolve(io.cwd, opts.src);

  const d = await Drawing.load(file);
  const current = d.get(id);
  if (!current) throw new CliError(`找不到元素 id="${id}"`);
  if (!expectedElementTypes(type).includes(current.type)) {
    throw new CliError(`元素 id="${id}" 类型为 ${current.type}，不能按 ${type} 编辑`);
  }

  const label = opts.label;
  delete opts.label;
  const binding = {};
  for (const key of ["from", "to", "fromSide", "toSide"]) {
    if (Object.prototype.hasOwnProperty.call(opts, key)) binding[key] = opts[key];
    delete opts[key];
  }

  if (type === "circle") {
    const size = opts.radius != null
      ? Number(opts.radius) * 2
      : (opts.diameter != null ? Number(opts.diameter) : undefined);
    if (size != null) {
      d.resize(id, { width: size, height: size });
      delete opts.radius;
      delete opts.diameter;
    }
    const circleTarget = d.get(id);
    if (opts.cx != null || opts.cy != null) {
      const nextWidth = circleTarget.width;
      const nextHeight = circleTarget.height;
      d.update(id, {
        x: opts.cx != null ? Number(opts.cx) - nextWidth / 2 : circleTarget.x,
        y: opts.cy != null ? Number(opts.cy) - nextHeight / 2 : circleTarget.y,
      });
      delete opts.cx;
      delete opts.cy;
    }
  }

  if (type === "square" && opts.size != null) {
    d.resize(id, { width: Number(opts.size), height: Number(opts.size) });
    delete opts.size;
  }

  if (opts.sharp || opts.rounded != null) {
    const roundness = roundnessForEdit(type, opts, d.get(id));
    opts.roundness = roundness;
  }
  delete opts.sharp;
  delete opts.rounded;
  delete opts.elbow;

  if (type === "image" && opts.src) {
    d.replaceImage(id, opts);
    delete opts.src;
  }

  d.update(id, opts);
  if (label != null) {
    const labelOpts = typeof label === "string" ? { text: label } : label;
    d.label(id, labelOpts);
  }
  if (Object.keys(binding).length) {
    d.bind(id, { ...binding, recompute: !Object.prototype.hasOwnProperty.call(opts, "points") });
  }
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ edit ${type} ${id} → ${file}\n`);
}

async function cmdMove(file, opts, io) {
  const d = await Drawing.load(file);
  d.move(opts.ids, opts.dx, opts.dy);
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ move ${opts.ids.join(",")} → ${file}\n`);
}

async function cmdResize(file, opts, io) {
  if (opts.width == null && opts.height == null) throw new CliError("resize 至少需要 --width 或 --height");
  const d = await Drawing.load(file);
  d.resize(opts.id, opts);
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ resize ${opts.id} → ${file}\n`);
}

async function cmdRotate(file, opts, io) {
  const d = await Drawing.load(file);
  d.rotate(opts.ids, (opts.angle * Math.PI) / 180, { relative: Boolean(opts.relative) });
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ rotate ${opts.ids.join(",")} → ${file}\n`);
}

async function cmdDelete(file, opts, io, purge = false) {
  const d = await Drawing.load(file);
  d.delete(opts.ids, { purge, cascade: opts.cascade !== false });
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ ${purge ? "purge" : "delete"} ${opts.ids.join(",")} → ${file}\n`);
}

async function cmdUngroup(file, opts, io) {
  const d = await Drawing.load(file);
  d.ungroup({ groupId: opts.groupId, ids: opts.ids });
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ ungroup → ${file}\n`);
}

async function cmdUnframe(file, opts, io) {
  const d = await Drawing.load(file);
  d.unframe({ frameId: opts.frameId, ids: opts.ids });
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ unframe → ${file}\n`);
}

async function cmdOrder(file, opts, io) {
  const d = await Drawing.load(file);
  d.order(opts.ids, opts);
  await d.save(file);
  if (!io.quiet) io.stderr.write(`✓ order ${opts.ids.join(",")} → ${file}\n`);
}

async function cmdValidate(file, strict, io) {
  const raw = await readFile(file, "utf8");
  let data;
  try {
    data = deserialize(raw);
  } catch (err) {
    throw new CliError(`无法解析文件: ${err.message}`);
  }
  const report = validateScene(data.elements, data.files);
  io.stdout.write(formatValidationReport(report));
  if (!report.ok || (strict && report.warnings.length)) {
    throw new CliError("场景校验失败");
  }
}

async function cmdInspect(file, options, io) {
  const raw = await readFile(file, "utf8");
  let data;
  try {
    data = deserialize(raw);
  } catch (e) {
    throw new CliError(`无法解析文件: ${e.message}`);
  }

  const selected = data.elements.filter((element) =>
    (!options.id || element.id === options.id) &&
    (!options.type || element.type === options.type)
  );
  if (options.id && !selected.length) throw new CliError(`找不到元素 id="${options.id}"`);

  const out = [];
  out.push(`\n📄  ${file}`);
  out.push(`    版本: ${data.version}  元素数: ${data.elements.length}  图片: ${Object.keys(data.files ?? {}).length}`);
  out.push(`    背景: ${data.appState?.viewBackgroundColor ?? "(默认)"}\n`);

  const groups = {};
  for (const el of selected) {
    groups[el.type] = (groups[el.type] ?? 0) + 1;
  }
  for (const [type, count] of Object.entries(groups)) {
    out.push(`    ${type.padEnd(14)} × ${count}`);
  }

  if (options.verbose || options.refs) {
    out.push("\n── 元素详情 ──────────────────────────────────────");
    for (const el of selected) {
      const extra =
        el.type === "text" ? `  "${el.text?.slice(0, 40)}"` :
        el.type === "arrow" ? `  → ${el.endArrowhead}${el.elbowed ? "  elbow" : ""}` :
        el.type === "image" ? `  file=${el.fileId?.slice(0, 8) ?? "-"}` : "";
      const refs = options.refs
        ? `  container=${el.containerId ?? "-"} frame=${el.frameId ?? "-"} groups=${(el.groupIds ?? []).join(",") || "-"}`
          + ` bound=${(el.boundElements ?? []).map((item) => `${item.type}:${item.id}`).join(",") || "-"}`
          + ` from=${el.startBinding?.elementId ?? "-"} to=${el.endBinding?.elementId ?? "-"}`
        : "";
      out.push(
        `  [${el.type}]  id=${el.id}  x=${Math.round(el.x)} y=${Math.round(el.y)}  w=${Math.round(el.width)} h=${Math.round(el.height)}${extra}${refs}`
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
    json = serialize(defaultExport.elements, defaultExport.appState, defaultExport.files, {
      source: defaultExport.source,
      version: defaultExport.version,
    });
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

  const json = serialize(elements, data.appState ?? {}, files, {
    source: data.source,
    version: data.version,
  });
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
    if (command === "edit" && positionals[0]) {
      showEditTypeHelp(positionals[0], (s) => io.stdout.write(s));
      return;
    }
    showCommandHelp(command, (s) => io.stdout.write(s));
    return;
  }

  if (command === "new") {
    await cmdNew(pickFile(flags, positionals, { required: true, positionalOk: true, cwd: io.cwd }), io);
    return;
  }
  if (command === "inspect") {
    await cmdInspect(
      pickFile(flags, positionals, { required: true, positionalOk: true, cwd: io.cwd }),
      { verbose: Boolean(flags.verbose), id: flags.id, type: flags.type, refs: Boolean(flags.refs) },
      io
    );
    return;
  }
  if (command === "validate") {
    await cmdValidate(
      pickFile(flags, positionals, { required: true, positionalOk: true, cwd: io.cwd }),
      Boolean(flags.strict),
      io
    );
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

  if (command === "edit") {
    const file = pickFile(flags, positionals, { required: true, positionalOk: false, cwd: io.cwd });
    await cmdEdit(file, positionals[0], flags, positionals.slice(1), io);
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

  if (command === "label") {
    await cmdLabel(file, opts, io);
    return;
  }
  if (command === "bind") {
    await cmdBind(file, opts, io);
    return;
  }
  if (command === "unbind") {
    await cmdUnbind(file, opts, io);
    return;
  }
  if (command === "move") {
    await cmdMove(file, opts, io);
    return;
  }
  if (command === "resize") {
    await cmdResize(file, opts, io);
    return;
  }
  if (command === "rotate") {
    await cmdRotate(file, opts, io);
    return;
  }
  if (command === "delete") {
    await cmdDelete(file, opts, io, false);
    return;
  }
  if (command === "purge") {
    await cmdDelete(file, opts, io, true);
    return;
  }
  if (command === "ungroup") {
    await cmdUngroup(file, opts, io);
    return;
  }
  if (command === "unframe") {
    await cmdUnframe(file, opts, io);
    return;
  }
  if (command === "order") {
    await cmdOrder(file, opts, io);
    return;
  }
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
