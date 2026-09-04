/**
 * 序列化模块
 * .excalidraw 文档格式见 https://docs.excalidraw.com/docs/codebase/json-schema
 *
 * 不要写入 `index`：自造的 a10、b1 不是合法 fractional-indexing 键。
 * VS Code 扩展（@excalidraw/excalidraw 0.18.1）在 restore 时调用
 * generateNKeysBetween，遇到非法键会抛错，表现为
 * “Failed to load Document: Error: Unable to load initial data”。
 * 官网较新，会自行修复，所以同一文件能在官网打开。
 * 能在扩展里打开的文件也不带 index，交给编辑器打开时分配。
 */
import { EXCALIDRAW_VERSION, EXCALIDRAW_SOURCE } from "./constants.js";

const DEFAULT_APP_STATE = {
  gridSize: 20,
  gridStep: 5,
  gridModeEnabled: false,
  viewBackgroundColor: "#ffffff",
};

/**
 * 写成与 VS Code 扩展兼容的元素：去掉 index；line 仅在 polygon 为 true 时写出。
 * @param {object} element
 */
function toSerializableElement(element) {
  const { index: _index, ...rest } = element;
  if (rest.polygon === false) {
    const { polygon: _polygon, ...withoutPolygon } = rest;
    return withoutPolygon;
  }
  return rest;
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
    elements: elements.map(toSerializableElement),
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
