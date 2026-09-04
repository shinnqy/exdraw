/**
 * 序列化模块
 * 将元素数组 + appState 组合成合法的 .excalidraw JSON
 */
import { EXCALIDRAW_VERSION, EXCALIDRAW_SOURCE } from "./constants.js";

const DEFAULT_APP_STATE = {
  gridSize: null,
  viewBackgroundColor: "#ffffff",
};

/**
 * 为有序元素分配分数索引（a1, a2, ... b1, b2 ...）
 * @param {object[]} elements
 */
function assignFractionalIndices(elements) {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return elements.map((el, i) => {
    const letterIdx = Math.floor(i / 100);
    const num = (i % 100) + 1;
    return {
      ...el,
      index: `${letters[Math.min(letterIdx, letters.length - 1)]}${num}`,
    };
  });
}

/**
 * 序列化为 JSON 字符串
 * @param {object[]} elements   已展开的元素数组
 * @param {object}  [appState]  可选的 appState 覆盖
 * @returns {string}
 */
export function serialize(elements, appState = {}) {
  const indexed = assignFractionalIndices(elements);

  const data = {
    type: "excalidraw",
    version: EXCALIDRAW_VERSION,
    source: EXCALIDRAW_SOURCE,
    elements: indexed,
    appState: {
      ...DEFAULT_APP_STATE,
      ...appState,
    },
    files: {},
  };

  return JSON.stringify(data, null, 2);
}

/**
 * 反序列化 .excalidraw JSON 字符串 → { elements, appState, files }
 * @param {string} json
 */
export function deserialize(json) {
  const data = JSON.parse(json);
  if (data.type !== "excalidraw") {
    throw new Error(`不是合法的 excalidraw 文件（type="${data.type}"）`);
  }
  return {
    elements: data.elements ?? [],
    appState: data.appState ?? {},
    files: data.files ?? {},
    version: data.version,
  };
}
