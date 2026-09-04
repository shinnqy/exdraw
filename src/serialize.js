/**
 * 序列化模块
 * .excalidraw 文档格式见 https://docs.excalidraw.com/docs/codebase/json-schema
 */
import { EXCALIDRAW_VERSION, EXCALIDRAW_SOURCE } from "./constants.js";

const DEFAULT_APP_STATE = {
  gridSize: 20,
  gridStep: 5,
  gridModeEnabled: false,
  viewBackgroundColor: "#ffffff",
};

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
 * @param {object[]} elements
 * @param {object} [appState]
 * @param {object} [files]
 */
export function serialize(elements, appState = {}, files = {}) {
  const data = {
    type: "excalidraw",
    version: EXCALIDRAW_VERSION,
    source: EXCALIDRAW_SOURCE,
    elements: assignFractionalIndices(elements),
    appState: {
      ...DEFAULT_APP_STATE,
      ...appState,
    },
    files: files ?? {},
  };

  return JSON.stringify(data, null, 2);
}

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
