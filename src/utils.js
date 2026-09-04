/**
 * 工具函数：ID 生成、随机数、分数索引等
 */
import { randomBytes } from "node:crypto";

// ── ID ────────────────────────────────────────────────────────────────────────
/**
 * 生成与 Excalidraw 相同格式的随机 ID（nanoid 风格，21 字符）
 */
const ALPHABET =
  "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

export function randomId(size = 21) {
  const bytes = randomBytes(size);
  let id = "";
  for (let i = 0; i < size; i++) {
    id += ALPHABET[bytes[i] & 63];
  }
  return id;
}

/**
 * 生成随机整数（用于 seed / versionNonce）
 */
export function randomInteger() {
  return Math.floor(Math.random() * 2 ** 31);
}

// ── 分数索引（fractional index）────────────────────────────────────────────────
/**
 * 为有序元素列表生成简单的分数索引字符串序列
 * 格式：a1、a2、a3 … a9、b1、b2 …（与 rocicorp/fractional-indexing 一致）
 * @param {number} count - 需要的索引数量
 * @param {string} [after=""] - 起始位置（空串表示从头开始）
 */
export function generateFractionalIndices(count, after = "") {
  const indices = [];
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let letterIdx = after ? letters.indexOf(after[0]) : 0;
  let num = after ? parseInt(after.slice(1) || "0", 10) + 1 : 1;

  for (let i = 0; i < count; i++) {
    if (num > 999) {
      letterIdx++;
      num = 1;
    }
    if (letterIdx >= letters.length) {
      // 超出范围时 fallback 到更长的前缀
      letterIdx = 0;
    }
    indices.push(`${letters[letterIdx]}${String(num).padStart(1, "0")}`);
    num++;
  }
  return indices;
}

// ── 杂项 ─────────────────────────────────────────────────────────────────────
export function getUpdatedTimestamp() {
  return Date.now();
}

/**
 * 深合并两个对象（只处理纯对象；数组直接覆盖）
 */
export function merge(base, override) {
  if (!override) return { ...base };
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const v = override[key];
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = merge(result[key], v);
    } else {
      result[key] = v;
    }
  }
  return result;
}
