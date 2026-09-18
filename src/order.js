/**
 * Excalidraw 的元素顺序使用 fractional indexing。
 *
 * 新文件可以省略 index；一旦已有场景带有合法 index，序列化时就必须
 * 保留它们，并为后来追加的元素生成位于正确位置的合法键。
 */
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

export function isValidOrderIndex(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    // 生成后继键会校验输入键的 head、长度和 fractional 部分。
    generateKeyBetween(value, null);
    return true;
  } catch {
    return false;
  }
}

function hasValidIndexedScene(elements) {
  return elements.some((element) => isValidOrderIndex(element.index));
}

function isStrictlyOrdered(elements) {
  const keys = elements.map((element) => element.index);
  if (keys.some((key) => !isValidOrderIndex(key))) return false;
  if (new Set(keys).size !== keys.length) return false;
  return keys.every((key, index) => index === 0 || keys[index - 1] < key);
}

function stripIndexes(elements) {
  return elements.map((element) => {
    const { index: _index, ...rest } = element;
    return rest;
  });
}

/**
 * 保留已有合法顺序键；对带有顺序元数据但缺少 index 的新元素补键。
 * 若已有键损坏或顺序与数组不一致，则按当前数组顺序整体重建。
 */
export function prepareOrderIndexes(elements) {
  if (!elements.length || !hasValidIndexedScene(elements)) {
    return stripIndexes(elements);
  }

  if (!isStrictlyOrdered(elements.filter((element) => element.index != null))) {
    const keys = generateNKeysBetween(null, null, elements.length);
    return elements.map((element, index) => ({ ...element, index: keys[index] }));
  }

  const result = elements.map((element) => ({ ...element }));
  for (let i = 0; i < result.length; i++) {
    if (isValidOrderIndex(result[i].index)) continue;

    let previous = null;
    for (let p = i - 1; p >= 0; p--) {
      if (isValidOrderIndex(result[p].index)) {
        previous = result[p].index;
        break;
      }
    }

    let next = null;
    for (let n = i + 1; n < result.length; n++) {
      if (isValidOrderIndex(result[n].index)) {
        next = result[n].index;
        break;
      }
    }

    result[i].index = generateKeyBetween(previous, next);
  }
  return result;
}

/**
 * 为一组已经移动到目标位置的元素分配连续顺序键。
 * 没有任何合法 index 的新场景保持无 index 的兼容格式。
 */
export function assignMovedIndexes(elements, movedIds) {
  if (!hasValidIndexedScene(elements) || !movedIds.size) return elements;

  const moved = elements.filter((element) => movedIds.has(element.id));
  const firstMovedIndex = elements.findIndex((element) => movedIds.has(element.id));
  if (firstMovedIndex < 0) return elements;

  let previous = null;
  for (let i = firstMovedIndex - 1; i >= 0; i--) {
    if (!movedIds.has(elements[i].id) && isValidOrderIndex(elements[i].index)) {
      previous = elements[i].index;
      break;
    }
  }

  let next = null;
  for (let i = firstMovedIndex + moved.length; i < elements.length; i++) {
    if (!movedIds.has(elements[i].id) && isValidOrderIndex(elements[i].index)) {
      next = elements[i].index;
      break;
    }
  }

  const keys = generateNKeysBetween(previous, next, moved.length);
  let keyIndex = 0;
  return elements.map((element) => {
    if (!movedIds.has(element.id)) return element;
    return { ...element, index: keys[keyIndex++] };
  });
}
