/**
 * 工具函数：ID 生成、随机数、时间戳
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
