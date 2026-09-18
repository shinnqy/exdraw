/**
 * 元素工厂：按官方 Excalidraw element schema 补全必填字段
 * 参考：
 *   https://docs.excalidraw.com/docs/codebase/json-schema
 *   packages/element/src/types.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import {
  DEFAULT_ELEMENT_PROPS,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_VERTICAL_ALIGN,
  ROUNDNESS,
  IMAGE_MIME,
} from "./constants.js";
import { randomId, randomInteger, getUpdatedTimestamp } from "./utils.js";
import { measureText } from "./text-metrics.js";

function resolveAngle(opts) {
  if (opts.angleDeg != null) return (Number(opts.angleDeg) * Math.PI) / 180;
  return opts.angle ?? 0;
}

function resolveRoundness(type, opts) {
  if (opts.roundness && typeof opts.roundness === "object") return opts.roundness;
  if (opts.sharp) return null;
  if (opts.rounded === false) return null;
  if (type === "rectangle") {
    return opts.rounded === false ? null : { type: ROUNDNESS.ADAPTIVE_RADIUS };
  }
  if (type === "diamond" || type === "ellipse") {
    return { type: ROUNDNESS.PROPORTIONAL_RADIUS };
  }
  if (type === "line" || type === "arrow") {
    return opts.rounded ? { type: ROUNDNESS.PROPORTIONAL_RADIUS } : null;
  }
  return null;
}

function baseElement(type, opts) {
  const {
    x = 0,
    y = 0,
    width = 100,
    height = 100,
    strokeColor = DEFAULT_ELEMENT_PROPS.strokeColor,
    backgroundColor = DEFAULT_ELEMENT_PROPS.backgroundColor,
    fillStyle = DEFAULT_ELEMENT_PROPS.fillStyle,
    strokeWidth = DEFAULT_ELEMENT_PROPS.strokeWidth,
    strokeStyle = DEFAULT_ELEMENT_PROPS.strokeStyle,
    roughness = DEFAULT_ELEMENT_PROPS.roughness,
    opacity = DEFAULT_ELEMENT_PROPS.opacity,
    groupIds = [],
    frameId = null,
    boundElements = null,
    link = null,
    locked = DEFAULT_ELEMENT_PROPS.locked,
    id = randomId(),
    seed = randomInteger(),
    version = 1,
    versionNonce = randomInteger(),
    created = Date.now(),
  } = opts;

  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: resolveAngle(opts),
    strokeColor,
    backgroundColor,
    fillStyle,
    strokeWidth,
    strokeStyle,
    roughness,
    opacity,
    groupIds,
    frameId,
    index: null,
    roundness: resolveRoundness(type, opts),
    seed,
    version,
    versionNonce,
    isDeleted: false,
    boundElements,
    updated: getUpdatedTimestamp(),
    created,
    link,
    locked,
  };
}

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
    if (Array.isArray(points[0])) {
      const ox = points[0][0];
      const oy = points[0][1];
      return points.map(([px, py]) => [px - ox, py - oy]);
    }
    return points;
  }
  return [[0, 0], [width ?? 200, 0]];
}

function bboxOfPoints(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    width: Math.max(...xs) - Math.min(...xs) || 0,
    height: Math.max(...ys) - Math.min(...ys) || 0,
  };
}

function normalizeLabel(labelOpts) {
  if (!labelOpts) return null;
  return typeof labelOpts === "string" ? { text: labelOpts } : labelOpts;
}

/**
 * 矩形。官方 UI 默认圆角（roundness.type = 3）；--sharp 取消圆角
 */
export function rectangle(opts = {}) {
  const el = baseElement("rectangle", {
    width: 100,
    height: 100,
    ...opts,
  });
  return _withLabel(el, opts.label);
}

/** 正方形 */
export function square(opts = {}) {
  const size = opts.size ?? opts.width ?? opts.height ?? 100;
  return rectangle({ ...opts, width: size, height: size });
}

/**
 * 椭圆。参考图与官方新元素默认 roundness.type = 2
 */
export function ellipse(opts = {}) {
  const el = baseElement("ellipse", { width: 100, height: 100, ...opts });
  return _withLabel(el, opts.label);
}

/**
 * 圆（等宽高椭圆）
 * --r / --radius / --diameter，或 --cx --cy 表示圆心
 */
export function circle(opts = {}) {
  const radius = opts.radius ?? opts.r ?? (opts.diameter != null ? opts.diameter / 2 : null);
  const size = radius != null ? radius * 2 : (opts.width ?? opts.height ?? 120);
  const next = { ...opts, width: size, height: size };
  if (opts.cx != null) next.x = opts.cx - size / 2;
  if (opts.cy != null) next.y = opts.cy - size / 2;
  return ellipse(next);
}

/** 菱形。参考图默认 roundness.type = 2 */
export function diamond(opts = {}) {
  const el = baseElement("diamond", { width: 100, height: 100, ...opts });
  return _withLabel(el, opts.label);
}

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

  const { width: estWidth, height: estHeight } = measureText(content, { fontSize, lineHeight });

  const base = baseElement("text", {
    width: estWidth,
    height: estHeight,
    roughness: 0,
    sharp: true,
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

/**
 * 直线 / 折线。schema 需要 points、lastCommittedPoint、bindings、arrowheads、polygon
 */
export function line(opts = {}) {
  opts = withLinearOrigin(opts);
  let pts = buildPoints(opts);
  const polygon = Boolean(opts.polygon);
  if (polygon && pts.length >= 2) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      pts = [...pts, [first[0], first[1]]];
    }
  }
  const { width, height } = bboxOfPoints(pts);
  const base = baseElement("line", {
    ...opts,
    width,
    height,
  });

  return {
    ...base,
    points: pts,
    lastCommittedPoint: null,
    startBinding: opts.startBinding ?? null,
    endBinding: opts.endBinding ?? null,
    startArrowhead: opts.startArrowhead ?? null,
    endArrowhead: opts.endArrowhead ?? null,
    polygon,
  };
}

/**
 * 箭头。schema 需要 elbowed；折线箭头再带 fixedSegments / startIsSpecial / endIsSpecial
 */
export function arrow(opts = {}) {
  opts = withLinearOrigin(opts);
  const {
    startArrowhead = null,
    endArrowhead = "arrow",
    label: labelOpts,
    startBinding = null,
    endBinding = null,
  } = opts;
  const elbowed = Boolean(opts.elbowed ?? opts.elbow);
  const pts = buildPoints(opts);
  const { width, height } = bboxOfPoints(pts);
  const base = baseElement("arrow", {
    ...opts,
    width,
    height,
    rounded: elbowed ? false : opts.rounded !== false && !opts.sharp,
    sharp: elbowed || opts.sharp,
  });

  const el = {
    ...base,
    points: pts,
    lastCommittedPoint: null,
    startBinding,
    endBinding,
    startArrowhead,
    endArrowhead,
    elbowed,
  };

  if (elbowed) {
    el.fixedSegments = opts.fixedSegments ?? null;
    el.startIsSpecial = opts.startIsSpecial ?? false;
    el.endIsSpecial = opts.endIsSpecial ?? false;
  }

  return _withLabel(el, labelOpts);
}

export function frame(opts = {}) {
  const { name = null, ...rest } = opts;
  const base = baseElement("frame", {
    width: 400,
    height: 300,
    strokeColor: "#bbb",
    fillStyle: "solid",
    roughness: 0,
    ...rest,
    sharp: true,
  });
  return { ...base, name };
}

/**
 * 手绘。schema：points / pressures / simulatePressure
 */
export function freedraw(opts = {}) {
  opts = withLinearOrigin(opts);
  const pts = buildPoints({ ...opts, width: opts.width ?? 0 });
  const { width, height } = bboxOfPoints(pts);
  const base = baseElement("freedraw", {
    ...opts,
    width,
    height,
    sharp: true,
  });
  return {
    ...base,
    points: pts,
    pressures: opts.pressures ?? pts.map(() => 0.5),
    simulatePressure: opts.simulatePressure !== false,
    strokeOptions: opts.strokeOptions ?? {
      variability: "variable",
      streamline: 0.5,
    },
  };
}

function readPngSize(buf) {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return null;
}

/**
 * 图片。返回 { element, file }，file 写入文档的 files 表
 */
export function image(opts = {}) {
  let { fileId, dataURL, mimeType, width, height, src } = opts;
  let file = null;

  if (src) {
    const buf = readFileSync(src);
    mimeType = mimeType ?? IMAGE_MIME[extname(src).toLowerCase()] ?? "image/png";
    fileId = fileId ?? createHash("sha1").update(buf).digest("hex");
    dataURL = `data:${mimeType};base64,${buf.toString("base64")}`;
    const png = readPngSize(buf);
    if (png) {
      width = width ?? png.width;
      height = height ?? png.height;
    }
    file = {
      mimeType,
      id: fileId,
      dataURL,
      created: Date.now(),
      lastRetrieved: Date.now(),
    };
  }

  const base = baseElement("image", {
    width: width ?? 200,
    height: height ?? 200,
    ...opts,
    sharp: true,
  });

  const element = {
    ...base,
    fileId: fileId ?? null,
    status: opts.status ?? (fileId ? "saved" : "pending"),
    scale: opts.scale ?? [1, 1],
    crop: opts.crop ?? null,
  };

  return { element, file };
}

/**
 * 嵌入网页（embeddable）
 */
export function embeddable(opts = {}) {
  const base = baseElement("embeddable", {
    width: 400,
    height: 300,
    ...opts,
    sharp: true,
  });
  return { ...base, link: opts.link ?? opts.url ?? null };
}

function _withLabel(shapeEl, labelOpts) {
  const label = normalizeLabel(labelOpts);
  if (!label) return shapeEl;

  const {
    text: content = "",
    fontSize = DEFAULT_FONT_SIZE,
    fontFamily = DEFAULT_FONT_FAMILY,
    textAlign = "center",
    verticalAlign = "middle",
    strokeColor = shapeEl.strokeColor ?? DEFAULT_ELEMENT_PROPS.strokeColor,
  } = label;

  const { width: estWidth, height: estHeight } = measureText(content, { fontSize, lineHeight: 1.25 });

  let tx = shapeEl.x + shapeEl.width / 2 - estWidth / 2;
  let ty = shapeEl.y + shapeEl.height / 2 - estHeight / 2;
  if ((shapeEl.type === "arrow" || shapeEl.type === "line") && Array.isArray(shapeEl.points)) {
    const first = shapeEl.points[0];
    const last = shapeEl.points[shapeEl.points.length - 1];
    tx = shapeEl.x + (first[0] + last[0]) / 2 - estWidth / 2;
    ty = shapeEl.y + (first[1] + last[1]) / 2 - estHeight / 2;
  }

  const textEl = {
    ...baseElement("text", {
      x: tx,
      y: ty,
      width: estWidth,
      height: estHeight,
      roughness: 0,
      sharp: true,
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

  const updatedShape = {
    ...shapeEl,
    boundElements: [
      ...(shapeEl.boundElements ?? []),
      { id: textEl.id, type: "text" },
    ],
  };

  return [updatedShape, textEl];
}

export function flattenCreated(created) {
  if (created && created.element) return [created.element];
  return Array.isArray(created) ? created : [created];
}
