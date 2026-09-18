/**
 * 序列化模块
 * .excalidraw 文档格式见 https://docs.excalidraw.com/docs/codebase/json-schema
 *
 * 合法的 `index` 使用 fractional-indexing 生成并保留；新文件仍可省略
 * index，非法或损坏的旧 index 不会原样写回。VS Code 扩展在 restore
 * 时会校验 fractional index，不能写入自造的 a10、b1 之类的键。
 */
import { EXCALIDRAW_VERSION, EXCALIDRAW_SOURCE } from "./constants.js";
import { prepareOrderIndexes } from "./order.js";

const DEFAULT_APP_STATE = {
  gridSize: 20,
  gridStep: 5,
  gridModeEnabled: false,
  viewBackgroundColor: "#ffffff",
};

// Loaded elements may contain explicit legacy fields which should survive a
// load/edit/save round trip. Symbol properties are ignored by JSON.stringify,
// but enumerable symbols are copied by object spread in edit operations.
const LOADED_ELEMENT = Symbol("exdraw.loadedElement");

function markLoadedElement(element) {
  Object.defineProperty(element, LOADED_ELEMENT, {
    value: true,
    enumerable: true,
    configurable: true,
  });
  return element;
}

/**
 * 写成与 VS Code 扩展兼容的元素：保留合法 index，省略 null/非法 index；
 * 新建 line 的默认 polygon:false 仍保持紧凑输出。
 * @param {object} element
 */
function toSerializableElement(element) {
  const rest = { ...element };
  if (rest.index == null) delete rest.index;
  // Keep explicit `polygon: false` from an existing document, while retaining
  // the old compact output for newly-created line elements.
  if (rest.polygon === false && !element[LOADED_ELEMENT]) {
    delete rest.polygon;
  }
  return rest;
}

/**
 * @param {object[]} elements
 * @param {object} [appState]
 * @param {object} [files]
 * @param {{ source?: string, version?: number }} [metadata]
 */
export function serialize(elements, appState = {}, files = {}, metadata = {}) {
  const orderedElements = prepareOrderIndexes(elements);
  const data = {
    type: "excalidraw",
    version: metadata.version ?? EXCALIDRAW_VERSION,
    source: metadata.source ?? EXCALIDRAW_SOURCE,
    elements: orderedElements.map(toSerializableElement),
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
    elements: (data.elements ?? []).map(markLoadedElement),
    appState: data.appState ?? {},
    files: data.files ?? {},
    version: data.version,
    source: data.source ?? EXCALIDRAW_SOURCE,
  };
}
