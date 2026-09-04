/**
 * Excalidraw 官方常量镜像（来自 packages/common/src/constants.ts + colors.ts）
 * 保持与官方默认值一致，确保生成的文件在 Excalidraw App 中打开表现正确
 */

export const EXCALIDRAW_VERSION = 2;
export const EXCALIDRAW_SOURCE = "https://excalidraw.com";

// ── 字体 ──────────────────────────────────────────────────────────────────────
export const FONT_FAMILY = {
  Excalifont: 5,   // 手写风格（官方默认）
  Nunito: 6,       // 普通字体
  "Comic Shanns": 8, // 代码字体
  Virgil: 1,       // 旧版手写（Legacy）
  Helvetica: 2,
  Cascadia: 3,
};

export const DEFAULT_FONT_FAMILY = FONT_FAMILY.Excalifont;
export const DEFAULT_FONT_SIZE = 20;
export const DEFAULT_TEXT_ALIGN = "left";     // "left" | "center" | "right"
export const DEFAULT_VERTICAL_ALIGN = "top";  // "top" | "middle" | "bottom"

// ── 颜色 ──────────────────────────────────────────────────────────────────────
export const COLOR_PALETTE = {
  transparent: "transparent",
  black: "#1e1e1e",
  white: "#ffffff",
  gray: ["#f8f9fa", "#e9ecef", "#ced4da", "#868e96", "#343a40"],
  red: ["#fff5f5", "#ffc9c9", "#ff8787", "#fa5252", "#e03131"],
  pink: ["#fff0f6", "#fcc2d7", "#f783ac", "#e64980", "#c2255c"],
  grape: ["#f8f0fc", "#eebefa", "#da77f2", "#be4bdb", "#9c36b5"],
  violet: ["#f3f0ff", "#d0bfff", "#9775fa", "#7950f2", "#6741d9"],
  blue: ["#e7f5ff", "#a5d8ff", "#4dabf7", "#228be6", "#1971c2"],
  cyan: ["#e3fafc", "#99e9f2", "#3bc9db", "#15aabf", "#0c8599"],
  teal: ["#e6fcf5", "#96f2d7", "#38d9a9", "#12b886", "#099268"],
  green: ["#ebfbee", "#b2f2bb", "#69db7c", "#40c057", "#2f9e44"],
  yellow: ["#fff9db", "#ffec99", "#ffd43b", "#fab005", "#f08c00"],
  orange: ["#fff4e6", "#ffd8a8", "#ffa94d", "#fd7e14", "#e8590c"],
};

// ── 描边/填充样式 ─────────────────────────────────────────────────────────────
/** 填充方式 */
export const FILL_STYLE = {
  solid: "solid",
  hachure: "hachure",
  "cross-hatch": "cross-hatch",
  zigzag: "zigzag",
};

/** 描边样式 */
export const STROKE_STYLE = {
  solid: "solid",
  dashed: "dashed",
  dotted: "dotted",
};

/** 描边宽度 */
export const STROKE_WIDTH = {
  thin: 1,
  medium: 2,
  bold: 4,
};

/** 粗糙度（Roughness） */
export const ROUGHNESS = {
  architect: 0,
  artist: 1,
  cartoonist: 2,
};

/** 圆角类型 */
export const ROUNDNESS = {
  LEGACY: 1,
  PROPORTIONAL_RADIUS: 2,
  ADAPTIVE_RADIUS: 3,  // 矩形默认
};

// ── 元素默认属性（与官方 DEFAULT_ELEMENT_PROPS 完全一致）─────────────────────
export const DEFAULT_ELEMENT_PROPS = {
  strokeColor: COLOR_PALETTE.black,   // "#1e1e1e"
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: STROKE_WIDTH.medium,   // 2
  strokeStyle: "solid",
  roughness: ROUGHNESS.artist,        // 1
  opacity: 100,
  locked: false,
};

// ── 箭头头部 ──────────────────────────────────────────────────────────────────
export const ARROWHEAD = {
  none: null,
  arrow: "arrow",
  bar: "bar",
  circle: "circle",
  triangle: "triangle",
  diamond: "diamond",
};
