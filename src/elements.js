/**
 * 元素工厂模块
 * 每个函数接收精简参数，自动填充所有 Excalidraw 必填字段（id、seed、version 等）
 * 返回的对象可以直接放入 .excalidraw 文件的 elements 数组
 */
import {
  DEFAULT_ELEMENT_PROPS,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_VERTICAL_ALIGN,
  ROUNDNESS,
} from "./constants.js";
import { randomId, randomInteger, getUpdatedTimestamp } from "./utils.js";

// ── 基础构造函数 ───────────────────────────────────────────────────────────────
function baseElement(type, opts) {
  const {
    x = 0,
    y = 0,
    width = 100,
    height = 100,
    angle = 0,
    strokeColor = DEFAULT_ELEMENT_PROPS.strokeColor,
    backgroundColor = DEFAULT_ELEMENT_PROPS.backgroundColor,
    fillStyle = DEFAULT_ELEMENT_PROPS.fillStyle,
    strokeWidth = DEFAULT_ELEMENT_PROPS.strokeWidth,
    strokeStyle = DEFAULT_ELEMENT_PROPS.strokeStyle,
    roughness = DEFAULT_ELEMENT_PROPS.roughness,
    opacity = DEFAULT_ELEMENT_PROPS.opacity,
    groupIds = [],
    frameId = null,
    roundness = null,
    boundElements = null,
    link = null,
    locked = DEFAULT_ELEMENT_PROPS.locked,
    id = randomId(),
    seed = randomInteger(),
    version = 1,
    versionNonce = randomInteger(),
  } = opts;

  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle,
    strokeColor,
    backgroundColor,
    fillStyle,
    strokeWidth,
    strokeStyle,
    roughness,
    opacity,
    groupIds,
    frameId,
    index: null,       // 由序列化层统一赋值
    roundness,
    seed,
    version,
    versionNonce,
    isDeleted: false,
    boundElements,
    updated: getUpdatedTimestamp(),
    link,
    locked,
  };
}

// ── 形状 ───────────────────────────────────────────────────────────────────────

/**
 * 矩形
 * @param {object} opts
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number} [opts.width=100]
 * @param {number} [opts.height=100]
 * @param {string} [opts.strokeColor]
 * @param {string} [opts.backgroundColor]
 * @param {string} [opts.fillStyle]  "solid"|"hachure"|"cross-hatch"|"zigzag"
 * @param {number} [opts.strokeWidth]
 * @param {string} [opts.strokeStyle]  "solid"|"dashed"|"dotted"
 * @param {number} [opts.roughness]  0|1|2
 * @param {number} [opts.opacity]  0-100
 * @param {boolean} [opts.rounded=false]  是否圆角
 * @param {object} [opts.label]  { text, fontSize, strokeColor, textAlign }
 */
export function rectangle(opts = {}) {
  const el = baseElement("rectangle", {
    width: 100,
    height: 100,
    ...opts,
    roundness: opts.rounded
      ? { type: ROUNDNESS.ADAPTIVE_RADIUS }
      : (opts.roundness ?? null),
  });
  return _withLabel(el, opts.label);
}

/**
 * 椭圆
 */
export function ellipse(opts = {}) {
  const el = baseElement("ellipse", { width: 100, height: 100, ...opts });
  return _withLabel(el, opts.label);
}

/**
 * 菱形
 */
export function diamond(opts = {}) {
  const el = baseElement("diamond", { width: 100, height: 100, ...opts });
  return _withLabel(el, opts.label);
}

// ── 文本 ───────────────────────────────────────────────────────────────────────

/**
 * 文本元素
 * @param {object} opts
 * @param {string} opts.text
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number} [opts.fontSize=20]
 * @param {number} [opts.fontFamily]  使用 FONT_FAMILY 常量
 * @param {string} [opts.textAlign]   "left"|"center"|"right"
 * @param {string} [opts.verticalAlign] "top"|"middle"|"bottom"
 * @param {string} [opts.strokeColor]
 */
export function text(opts = {}) {
  const {
    text: content = "",
    fontSize = DEFAULT_FONT_SIZE,
    fontFamily = DEFAULT_FONT_FAMILY,
    textAlign = DEFAULT_TEXT_ALIGN,
    verticalAlign = DEFAULT_VERTICAL_ALIGN,
    containerId = null,
    autoResize = true,
    lineHeight = 1.25,
    ...rest
  } = opts;

  // 简单按字符估算宽高，用于布局参考（Excalidraw 打开后会重新计算）
  const charsPerLine = content.split("\n").reduce((m, l) => Math.max(m, l.length), 0) || 1;
  const lines = content.split("\n").length;
  const estWidth = charsPerLine * fontSize * 0.6;
  const estHeight = lines * fontSize * lineHeight;

  const base = baseElement("text", {
    width: estWidth,
    height: estHeight,
    roughness: 0,
    ...rest,
  });

  return {
    ...base,
    text: content,
    originalText: content,
    fontSize,
    fontFamily,
    textAlign,
    verticalAlign,
    containerId,
    autoResize,
    lineHeight,
  };
}

// ── 线条 & 箭头 ────────────────────────────────────────────────────────────────

/**
 * 构造 points 数组
 * 支持两种写法：
 *  1. points: [[x1,y1],[x2,y2],...]   绝对坐标 → 会转为相对第一个点的偏移
 *  2. points: [{dx,dy},{dx,dy}]        相对第一个点的增量，最终转为 [0,0] 出发
 */
/**
 * 若只给了绝对坐标 points、没给 x/y，则把第一个点当作元素原点。
 */
function withLinearOrigin(opts) {
  const next = { ...opts };
  if (Array.isArray(next.points?.[0])) {
    const [px, py] = next.points[0];
    if (!Object.prototype.hasOwnProperty.call(next, "x")) next.x = px;
    if (!Object.prototype.hasOwnProperty.call(next, "y")) next.y = py;
  }
  return next;
}

function buildPoints(opts) {
  const { points, width } = opts;

  if (points) {
    // 用户传入绝对坐标数组，转换为 Excalidraw 的元素本地坐标
    // （Excalidraw 的 points 是相对于元素 x,y 的偏移量）
    if (Array.isArray(points[0])) {
      const ox = points[0][0];
      const oy = points[0][1];
      return points.map(([px, py]) => [px - ox, py - oy]);
    }
    return points;
  }

  // 默认：水平线，长度 = width || 200
  const len = width ?? 200;
  return [[0, 0], [len, 0]];
}

/**
 * 直线
 * @param {object} opts
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number[][]} [opts.points]  点坐标数组（绝对坐标，自动转换）
 * @param {number} [opts.width=200]   若无 points 则决定默认线段长度
 */
export function line(opts = {}) {
  opts = withLinearOrigin(opts);
  const pts = buildPoints(opts);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs) || 0;
  const h = Math.max(...ys) - Math.min(...ys) || 0;

  const base = baseElement("line", {
    width: w,
    height: h,
    ...opts,
    roundness: null,
  });

  return {
    ...base,
    points: pts,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
  };
}

/**
 * 箭头
 * @param {object} opts
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number[][]} [opts.points]
 * @param {number} [opts.width=200]
 * @param {string|null} [opts.startArrowhead=null]  "arrow"|"bar"|"circle"|"triangle"|"diamond"|null
 * @param {string|null} [opts.endArrowhead="arrow"]
 * @param {string} [opts.label]       箭头标签文字
 */
export function arrow(opts = {}) {
  opts = withLinearOrigin(opts);
  const {
    startArrowhead = null,
    endArrowhead = "arrow",
    label: labelOpts,
    ...rest
  } = opts;

  const pts = buildPoints(rest);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs) || 0;
  const h = Math.max(...ys) - Math.min(...ys) || 0;

  const base = baseElement("arrow", {
    width: w,
    height: h,
    ...rest,
    roundness: null,
  });

  const el = {
    ...base,
    points: pts,
    startBinding: null,
    endBinding: null,
    startArrowhead,
    endArrowhead,
    elbowed: false,
  };

  return _withLabel(el, labelOpts);
}

// ── 帧（Frame）───────────────────────────────────────────────────────────────

/**
 * 帧容器（可包含多个其他元素）
 * @param {object} opts
 * @param {string[]} opts.children  子元素 ID 列表
 * @param {string}  [opts.name]
 */
export function frame(opts = {}) {
  const { children = [], name = null, ...rest } = opts;
  const base = baseElement("frame", {
    width: 400,
    height: 300,
    ...rest,
    strokeColor: "#bbb",
    fillStyle: "solid",
    roughness: 0,
    roundness: null,
  });
  return { ...base, name };
  // children 的 frameId 由 Drawing 层设置
}

// ── 内部：为形状添加标签文字 ──────────────────────────────────────────────────

/**
 * 给形状元素附加一个文本标签（containerId 绑定）
 * 返回 [shapeElement, textElement]（顺序：形状在前）
 */
function _withLabel(shapeEl, labelOpts) {
  if (!labelOpts) return shapeEl;

  const {
    text: content = "",
    fontSize = DEFAULT_FONT_SIZE,
    fontFamily = DEFAULT_FONT_FAMILY,
    textAlign = "center",
    verticalAlign = "middle",
    strokeColor = DEFAULT_ELEMENT_PROPS.strokeColor,
  } = typeof labelOpts === "string" ? { text: labelOpts } : labelOpts;

  const lines = content.split("\n").length;
  const charsPerLine = content.split("\n").reduce((m, l) => Math.max(m, l.length), 0) || 1;
  const estWidth = charsPerLine * fontSize * 0.6;
  const estHeight = lines * fontSize * 1.25;

  const textEl = {
    ...baseElement("text", {
      x: shapeEl.x + shapeEl.width / 2 - estWidth / 2,
      y: shapeEl.y + shapeEl.height / 2 - estHeight / 2,
      width: estWidth,
      height: estHeight,
      roughness: 0,
      strokeColor,
    }),
    text: content,
    originalText: content,
    fontSize,
    fontFamily,
    textAlign,
    verticalAlign,
    containerId: shapeEl.id,
    autoResize: true,
    lineHeight: 1.25,
  };

  // 让形状知道自己绑定了文字
  const updatedShape = {
    ...shapeEl,
    boundElements: [
      ...(shapeEl.boundElements ?? []),
      { id: textEl.id, type: "text" },
    ],
  };

  return [updatedShape, textEl];
}
