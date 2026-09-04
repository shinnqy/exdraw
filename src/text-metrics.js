/**
 * 估算 Excalidraw 文本宽高。
 *
 * CLI 跑在 Node 里，没有 Excalifont / Xiaolai，不能 canvas.measureText。
 * 官方 App 打开后若 width 偏小，文字会被裁切；双击失焦才会按真实字体重算。
 *
 * 实测（fontFamily=5 Excalifont，fontSize=20）：
 *   "集群模式"  估 4×20×0.6=48  → 实际自适应 80 = 4×fontSize
 * 因此：CJK/全角按 1em，拉丁按约 0.6em。
 */

export const LATIN_ADVANCE = 0.6;

function isWideCodePoint(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3040 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1aff0 && cp <= 0x1b16f) ||
    (cp >= 0x1f200 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x2fffd) ||
    (cp >= 0x30000 && cp <= 0x3fffd)
  );
}

function lineAdvance(line, fontSize) {
  let w = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0);
    if (ch === " ") w += fontSize * 0.3;
    else if (isWideCodePoint(cp)) w += fontSize;
    else w += fontSize * LATIN_ADVANCE;
  }
  return w;
}

/**
 * @param {string} content
 * @param {{ fontSize?: number, lineHeight?: number }} [opts]
 * @returns {{ width: number, height: number }}
 */
export function measureText(content, opts = {}) {
  const fontSize = opts.fontSize ?? 20;
  const lineHeight = opts.lineHeight ?? 1.25;
  const lines = String(content ?? "").split("\n");
  const width = lines.reduce((max, line) => Math.max(max, lineAdvance(line, fontSize)), 0);
  const height = Math.max(lines.length, 1) * fontSize * lineHeight;
  return { width, height };
}
