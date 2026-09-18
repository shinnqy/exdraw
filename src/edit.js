/**
 * 已有 Excalidraw 场景的关系感知编辑操作。
 *
 * 这里不负责 CLI 参数解析，只处理元素数组、appState 和 files 的一致性：
 * - 修改元素时维护 version/versionNonce/updated；
 * - 修改容器、文本、箭头时维护双向引用；
 * - 删除时解除绑定，默认采用 Excalidraw 的软删除语义；
 * - 移动/缩放绑定容器时同步标签和线性元素端点。
 */
import { randomInteger, getUpdatedTimestamp } from "./utils.js";
import { measureText } from "./text-metrics.js";
import { autoSides, sidePoint, makeBinding, elbowPoints } from "./geometry.js";
import { text as makeText } from "./elements.js";
import { assignMovedIndexes, isValidOrderIndex } from "./order.js";

const TEXT_UPDATE_FIELDS = new Set([
  "text",
  "originalText",
  "fontSize",
  "fontFamily",
  "textAlign",
  "verticalAlign",
  "autoResize",
  "lineHeight",
  "baseFontSize",
  "labelPosition",
]);

const TEXT_STYLE_FIELDS = new Set([
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "angle",
  "link",
  "locked",
  "groupIds",
  "frameId",
]);

const COMMON_UPDATE_FIELDS = new Set([
  "x",
  "y",
  "width",
  "height",
  "angle",
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "roundness",
  "link",
  "locked",
  "frameId",
  "groupIds",
  "customData",
  "hasTextLink",
  "name",
  "status",
  "scale",
  "crop",
  "fileId",
  "startArrowhead",
  "endArrowhead",
  "elbowed",
  "fixedSegments",
  "startIsSpecial",
  "endIsSpecial",
  "polygon",
  "pressures",
  "simulatePressure",
  "strokeOptions",
]);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Excalidraw 的标准元素更新：只有真的发生变化时才递增版本。
 */
export function mutateElement(element, updates, { force = false } = {}) {
  const changed = force || Object.entries(updates).some(
    ([key, value]) => !valuesEqual(element[key], value)
  );
  if (!changed) return element;

  const next = { ...element, ...updates };
  next.version = updates.version ?? (Number(element.version) || 0) + 1;
  next.versionNonce = updates.versionNonce ?? randomInteger();
  next.updated = getUpdatedTimestamp();
  return next;
}

export function elementById(elements, id) {
  return elements.find((element) => element.id === id) ?? null;
}

export function requireElement(elements, id) {
  const element = elementById(elements, id);
  if (!element) throw new Error(`找不到元素 id="${id}"`);
  return element;
}

function requireIds(elements, ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length || list.some((id) => !id)) throw new Error("缺少元素 id");
  for (const id of list) requireElement(elements, id);
  return [...new Set(list)];
}

function isLinear(element) {
  return element?.type === "line" || element?.type === "arrow";
}

function isText(element) {
  return element?.type === "text";
}

function isContainer(element) {
  return Boolean(element && [
    "rectangle",
    "diamond",
    "ellipse",
    "text",
    "image",
    "embeddable",
    "frame",
    "magicframe",
    "arrow",
  ].includes(element.type));
}

function withElement(elements, id, updater) {
  let changed = false;
  const result = elements.map((element) => {
    if (element.id !== id) return element;
    const next = updater(element);
    changed ||= next !== element;
    return next;
  });
  return changed ? result : elements;
}

function addBoundReference(element, reference) {
  const list = element.boundElements ?? [];
  if (list.some((item) => item.id === reference.id && item.type === reference.type)) {
    return element;
  }
  return mutateElement(element, {
    boundElements: [...list, reference],
  });
}

function removeBoundReference(element, id, type = null) {
  if (!Array.isArray(element.boundElements)) return element;
  const next = element.boundElements.filter((item) =>
    item.id !== id || (type != null && item.type !== type)
  );
  return mutateElement(element, { boundElements: next });
}

function absolutePoints(element) {
  return (element.points ?? []).map(([x, y]) => [element.x + x, element.y + y]);
}

function boundsOfPoints(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function normalizeAbsolutePoints(points) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error("线/箭头至少需要两个坐标点");
  }
  const origin = points[0];
  if (!Array.isArray(origin) || origin.length !== 2) {
    throw new Error("坐标点必须是 [x, y]");
  }
  const normalized = points.map((point) => {
    if (!Array.isArray(point) || point.length !== 2 || point.some((value) => !Number.isFinite(value))) {
      throw new Error("坐标点必须是 [x, y] 数字数组");
    }
    return [point[0] - origin[0], point[1] - origin[1]];
  });
  const bounds = boundsOfPoints(points);
  return {
    x: origin[0],
    y: origin[1],
    width: bounds.width,
    height: bounds.height,
    points: normalized,
  };
}

function linearGeometryUpdates(element, points) {
  const next = normalizeAbsolutePoints(points);
  return {
    x: next.x,
    y: next.y,
    width: next.width,
    height: next.height,
    points: next.points,
  };
}

function bindingFixedPoint(binding) {
  if (Array.isArray(binding?.fixedPoint) && binding.fixedPoint.length === 2) {
    return binding.fixedPoint;
  }
  return [0.5, 0.5];
}

function pointForBinding(target, binding) {
  const [fx, fy] = bindingFixedPoint(binding);
  return {
    x: target.x + target.width * fx,
    y: target.y + target.height * fy,
  };
}

function sideForBinding(binding) {
  const [fx, fy] = bindingFixedPoint(binding);
  if (fx <= 0.25) return "left";
  if (fx >= 0.75) return "right";
  if (fy <= 0.25) return "top";
  if (fy >= 0.75) return "bottom";
  return "center";
}

function updateLinearGeometry(element, elements) {
  if (!isLinear(element)) return element;
  const byId = new Map(elements.map((candidate) => [candidate.id, candidate]));
  const startTarget = element.startBinding
    ? byId.get(element.startBinding.elementId)
    : null;
  const endTarget = element.endBinding
    ? byId.get(element.endBinding.elementId)
    : null;
  if (!startTarget && !endTarget) return element;

  const points = absolutePoints(element);
  if (startTarget) points[0] = [
    pointForBinding(startTarget, element.startBinding).x,
    pointForBinding(startTarget, element.startBinding).y,
  ];
  if (endTarget) {
    points[points.length - 1] = [
      pointForBinding(endTarget, element.endBinding).x,
      pointForBinding(endTarget, element.endBinding).y,
    ];
  }

  if (element.type === "arrow" && element.elbowed && startTarget && endTarget) {
    const start = pointForBinding(startTarget, element.startBinding);
    const end = pointForBinding(endTarget, element.endBinding);
    const elbow = elbowPoints(start, end, sideForBinding(element.startBinding));
    const updates = {
      ...linearGeometryUpdates(element, elbow),
      fixedSegments: null,
      startIsSpecial: false,
      endIsSpecial: false,
    };
    return mutateElement(element, updates);
  }

  return mutateElement(element, linearGeometryUpdates(element, points));
}

function syncBoundLinearElements(elements, targetIds) {
  if (!targetIds.size) return elements;
  const current = [...elements];
  const byId = new Map(current.map((element) => [element.id, element]));
  return current.map((element) => {
    if (!isLinear(element)) return element;
    const affectsStart = element.startBinding && targetIds.has(element.startBinding.elementId);
    const affectsEnd = element.endBinding && targetIds.has(element.endBinding.elementId);
    if (!affectsStart && !affectsEnd) return element;
    return updateLinearGeometry(element, [...byId.values()]);
  });
}

function textDimensions(element, updates = {}) {
  const content = updates.text ?? element.text ?? "";
  const fontSize = updates.fontSize ?? element.fontSize ?? 20;
  const lineHeight = updates.lineHeight ?? element.lineHeight ?? 1.25;
  return measureText(content, { fontSize, lineHeight });
}

function relayoutText(textElement, beforeContainer, afterContainer, { remeasure = false } = {}) {
  let width = textElement.width;
  let height = textElement.height;
  if (remeasure || textElement.autoResize !== false) {
    const dimensions = textDimensions(textElement);
    width = dimensions.width;
    height = dimensions.height;
  }

  if (isLinear(afterContainer)) {
    const points = absolutePoints(afterContainer);
    const first = points[0] ?? [afterContainer.x, afterContainer.y];
    const last = points.at(-1) ?? first;
    return {
      x: (first[0] + last[0]) / 2 - width / 2,
      y: (first[1] + last[1]) / 2 - height / 2,
      width,
      height,
    };
  }

  const oldRightGap = beforeContainer.x + beforeContainer.width - (textElement.x + textElement.width);
  const oldBottomGap = beforeContainer.y + beforeContainer.height - (textElement.y + textElement.height);
  let x = afterContainer.x + (textElement.x - beforeContainer.x);
  let y = afterContainer.y + (textElement.y - beforeContainer.y);

  if (textElement.textAlign === "center") {
    x = afterContainer.x + (afterContainer.width - width) / 2;
  } else if (textElement.textAlign === "right") {
    x = afterContainer.x + afterContainer.width - oldRightGap - width;
  }

  if (textElement.verticalAlign === "middle") {
    y = afterContainer.y + (afterContainer.height - height) / 2;
  } else if (textElement.verticalAlign === "bottom") {
    y = afterContainer.y + afterContainer.height - oldBottomGap - height;
  }

  return { x, y, width, height };
}

function updateTextElement(elements, id, patch, { keepPosition = false } = {}) {
  const current = requireElement(elements, id);
  if (!isText(current)) throw new Error(`元素 id="${id}" 不是 text`);

  const textUpdates = {};
  for (const key of TEXT_UPDATE_FIELDS) {
    if (hasOwn(patch, key)) textUpdates[key] = patch[key];
  }
  if (hasOwn(patch, "text")) textUpdates.originalText = patch.text;
  if (hasOwn(patch, "originalText") && !hasOwn(patch, "text")) {
    textUpdates.text = patch.originalText;
  }
  for (const key of TEXT_STYLE_FIELDS) {
    if (hasOwn(patch, key)) textUpdates[key] = patch[key];
  }

  const dimensions = textDimensions(current, textUpdates);
  if (current.autoResize !== false || hasOwn(patch, "text") || hasOwn(patch, "fontSize") || hasOwn(patch, "lineHeight")) {
    textUpdates.width = dimensions.width;
    textUpdates.height = dimensions.height;
  }

  let next = withElement(elements, id, (element) => mutateElement(element, textUpdates));
  const updated = requireElement(next, id);
  if (updated.containerId && !keepPosition) {
    const container = elementById(next, updated.containerId);
    if (container) {
      const layout = relayoutText(updated, container, container);
      next = withElement(next, id, (element) => mutateElement(element, layout));
    }
  }
  return next;
}

export function addLabel(elements, containerId, options = {}) {
  const container = requireElement(elements, containerId);
  if (!isContainer(container)) {
    throw new Error(`元素 id="${containerId}" 不能承载文本`);
  }
  const content = String(options.text ?? "");
  const existing = (container.boundElements ?? [])
    .map((reference) => elementById(elements, reference.id))
    .find((element) => isText(element) && element.containerId === containerId && !element.isDeleted);

  if (existing) {
    return updateTextElement(elements, existing.id, {
      ...options,
      text: content,
    });
  }

  const dimensions = measureText(content, {
    fontSize: options.fontSize ?? 20,
    lineHeight: options.lineHeight ?? 1.25,
  });
  let x = container.x + (container.width - dimensions.width) / 2;
  let y = container.y + (container.height - dimensions.height) / 2;
  if (isLinear(container)) {
    const points = absolutePoints(container);
    const first = points[0] ?? [container.x, container.y];
    const last = points.at(-1) ?? first;
    x = (first[0] + last[0]) / 2 - dimensions.width / 2;
    y = (first[1] + last[1]) / 2 - dimensions.height / 2;
  }

  const label = makeText({
    ...options,
    text: content,
    x,
    y,
    width: dimensions.width,
    height: dimensions.height,
    containerId,
    groupIds: container.groupIds ?? [],
    frameId: container.frameId ?? null,
  });
  let next = [...elements, label];
  next = withElement(next, containerId, (element) => addBoundReference(element, {
    id: label.id,
    type: "text",
  }));
  return next;
}

export function updateLinearPoints(elements, id, points) {
  const current = requireElement(elements, id);
  if (!isLinear(current) && current.type !== "freedraw") {
    throw new Error(`元素 id="${id}" 不是 line、arrow 或 freedraw`);
  }
  const updates = linearGeometryUpdates(current, points);
  let next = withElement(elements, id, (element) => mutateElement(element, updates));
  const changed = requireElement(next, id);
  if (changed.type === "arrow" && changed.elbowed) {
    next = withElement(next, id, (element) => mutateElement(element, {
      fixedSegments: null,
      startIsSpecial: false,
      endIsSpecial: false,
    }));
  }
  const target = elementById(next, id);
  if (target && target.boundElements?.some((reference) => reference.type === "text")) {
    for (const reference of target.boundElements) {
      const label = elementById(next, reference.id);
      if (label?.containerId === id) {
        const layout = relayoutText(label, target, target);
        next = withElement(next, label.id, (element) => mutateElement(element, layout));
      }
    }
  }
  return next;
}

export function updateElements(elements, id, patch = {}) {
  const current = requireElement(elements, id);
  let next = elements;

  const positionSpecified = hasOwn(patch, "x") || hasOwn(patch, "y");
  if (positionSpecified) {
    const dx = hasOwn(patch, "x") ? Number(patch.x) - current.x : 0;
    const dy = hasOwn(patch, "y") ? Number(patch.y) - current.y : 0;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("x/y 必须是数字");
    next = moveElements(next, [id], dx, dy);
  }

  const dimensionSpecified = hasOwn(patch, "width") || hasOwn(patch, "height");
  if (dimensionSpecified) {
    next = resizeElement(next, id, {
      width: hasOwn(patch, "width") ? patch.width : undefined,
      height: hasOwn(patch, "height") ? patch.height : undefined,
    });
  }

  let updated = elementById(next, id);
  if (!updated) return next;

  if (isText(updated) && [...TEXT_UPDATE_FIELDS].some((key) => hasOwn(patch, key))) {
    next = updateTextElement(next, id, patch, { keepPosition: positionSpecified });
    updated = elementById(next, id);
  }

  if (hasOwn(patch, "points")) {
    next = updateLinearPoints(next, id, patch.points);
    updated = elementById(next, id);
  }

  const changes = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "id" || key === "x" || key === "y" || key === "width" || key === "height" || key === "points") continue;
    if (TEXT_UPDATE_FIELDS.has(key)) continue;
    if (COMMON_UPDATE_FIELDS.has(key)) changes[key] = value;
  }
  if (Object.keys(changes).length) {
    next = withElement(next, id, (element) => mutateElement(element, changes));
  }

  const changedElement = elementById(next, id);
  if (changedElement && (dimensionSpecified || positionSpecified)) {
    const target = changedElement;
    for (const reference of target.boundElements ?? []) {
      const label = elementById(next, reference.id);
      if (!label || label.containerId !== id || !isText(label)) continue;
      const beforeContainer = current;
      const layout = relayoutText(label, beforeContainer, target);
      next = withElement(next, label.id, (element) => mutateElement(element, layout));
    }
    next = syncBoundLinearElements(next, new Set([id]));
  }
  return next;
}

export function moveElements(elements, ids, dx, dy) {
  const list = requireIds(elements, ids);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("dx/dy 必须是数字");
  if (dx === 0 && dy === 0) return elements;

  const movedIds = new Set(list);
  for (const element of elements) {
    if (movedIds.has(element.id) && element.type === "frame") {
      for (const child of elements) {
        if (child.frameId === element.id) movedIds.add(child.id);
      }
    }
  }
  for (const element of elements) {
    if (element.containerId && movedIds.has(element.containerId)) movedIds.add(element.id);
  }

  let next = elements.map((element) => {
    if (!movedIds.has(element.id)) return element;
    return mutateElement(element, { x: element.x + dx, y: element.y + dy });
  });
  next = syncBoundLinearElements(next, movedIds);
  return next;
}

function resizeLinear(element, width, height) {
  const oldWidth = element.width;
  const oldHeight = element.height;
  const sx = oldWidth === 0 ? 1 : width / oldWidth;
  const sy = oldHeight === 0 ? 1 : height / oldHeight;
  const points = (element.points ?? []).map(([x, y]) => [x * sx, y * sy]);
  return {
    width,
    height,
    points,
  };
}

export function resizeElement(elements, id, dimensions = {}) {
  const current = requireElement(elements, id);
  const width = dimensions.width ?? current.width;
  const height = dimensions.height ?? current.height;
  if (!Number.isFinite(Number(width)) || !Number.isFinite(Number(height))) {
    throw new Error("width/height 必须是数字");
  }
  if (Number(width) < 0 || Number(height) < 0) throw new Error("width/height 不能为负数");

  const numericWidth = Number(width);
  const numericHeight = Number(height);
  let next;
  if (isLinear(current)) {
    next = withElement(elements, id, (element) => mutateElement(
      element,
      resizeLinear(element, numericWidth, numericHeight)
    ));
  } else {
    next = withElement(elements, id, (element) => mutateElement(element, {
      width: numericWidth,
      height: numericHeight,
    }));
  }

  const after = requireElement(next, id);
  for (const reference of after.boundElements ?? []) {
    const label = elementById(next, reference.id);
    if (!label || !isText(label) || label.containerId !== id) continue;
    const layout = relayoutText(label, current, after);
    next = withElement(next, label.id, (element) => mutateElement(element, layout));
  }
  return syncBoundLinearElements(next, new Set([id]));
}

function compatibleBinding(previous, targetId, fixedPoint) {
  if (!previous) return makeBinding(targetId, fixedPoint);
  return {
    ...previous,
    elementId: targetId,
    fixedPoint,
  };
}

function normalizeBindingTarget(value) {
  if (value == null || value === "" || value === "none" || value === "null") return null;
  return String(value);
}

function resolveBindingPoint(target, previous, side, autoSide, keepPrevious) {
  if (side) return sidePoint(target, side).fp;
  if (keepPrevious && previous?.fixedPoint) return previous.fixedPoint;
  if (autoSide) return sidePoint(target, autoSide).fp;
  return [0.5, 0.5];
}

/**
 * 绑定或重绑定 line/arrow。from/to 只在属性显式传入时改变，否则保留原端点。
 */
export function bindElement(elements, id, options = {}) {
  const arrowElement = requireElement(elements, id);
  if (!isLinear(arrowElement)) throw new Error(`元素 id="${id}" 不是 line 或 arrow`);

  const hasFrom = hasOwn(options, "from");
  const hasTo = hasOwn(options, "to");
  if (!hasFrom && !hasTo && !options.recompute) throw new Error("bind 至少需要 --from 或 --to");

  const oldStart = arrowElement.startBinding ?? null;
  const oldEnd = arrowElement.endBinding ?? null;
  const fromId = hasFrom ? normalizeBindingTarget(options.from) : oldStart?.elementId ?? null;
  const toId = hasTo ? normalizeBindingTarget(options.to) : oldEnd?.elementId ?? null;
  const fromTarget = fromId ? requireElement(elements, fromId) : null;
  const toTarget = toId ? requireElement(elements, toId) : null;

  let autoFrom;
  let autoTo;
  if (fromTarget && toTarget && !options.fromSide && !options.toSide && (hasFrom || hasTo)) {
    [autoFrom, autoTo] = autoSides(fromTarget, toTarget);
  }
  const fromPoint = fromTarget
    ? resolveBindingPoint(fromTarget, oldStart, options.fromSide, autoFrom, !hasFrom || fromId === oldStart?.elementId)
    : null;
  const toPoint = toTarget
    ? resolveBindingPoint(toTarget, oldEnd, options.toSide, autoTo, !hasTo || toId === oldEnd?.elementId)
    : null;

  let next = elements;
  if (oldStart?.elementId && oldStart.elementId !== fromId) {
    next = withElement(next, oldStart.elementId, (element) => removeBoundReference(element, id, "arrow"));
  }
  if (oldEnd?.elementId && oldEnd.elementId !== toId && oldEnd.elementId !== oldStart?.elementId) {
    next = withElement(next, oldEnd.elementId, (element) => removeBoundReference(element, id, "arrow"));
  }

  let bindingUpdates = {
    startBinding: fromTarget ? compatibleBinding(oldStart, fromId, fromPoint) : null,
    endBinding: toTarget ? compatibleBinding(oldEnd, toId, toPoint) : null,
  };
  next = withElement(next, id, (element) => mutateElement(element, bindingUpdates));
  next = withElement(next, id, (element) => {
    if (!options.recompute) return element;
    return updateLinearGeometry(element, next);
  });

  if (fromTarget) {
    next = withElement(next, fromId, (element) => addBoundReference(element, { id, type: "arrow" }));
  }
  if (toTarget && toId !== fromId) {
    next = withElement(next, toId, (element) => addBoundReference(element, { id, type: "arrow" }));
  }
  return next;
}

export function unbindElement(elements, id, which = "both") {
  const current = requireElement(elements, id);
  if (!isLinear(current)) throw new Error(`元素 id="${id}" 不是 line 或 arrow`);
  const options = { recompute: false };
  if (which === "from" || which === "both") options.from = null;
  if (which === "to" || which === "both") options.to = null;
  return bindElement(elements, id, options);
}

export function deleteElements(elements, files, ids, { purge = false, cascade = true } = {}) {
  const selected = requireIds(elements, ids);
  const deleteIds = new Set(selected);
  const frameIds = new Set(
    selected.filter((id) => elementById(elements, id)?.type === "frame")
  );

  if (cascade) {
    for (const element of elements) {
      if (!element.containerId || !deleteIds.has(element.containerId)) continue;
      if (isText(element)) deleteIds.add(element.id);
    }
  }

  const next = [];
  for (const element of elements) {
    if (deleteIds.has(element.id)) {
      if (purge) continue;
      const deletedUpdates = { isDeleted: true };
      // 删除后的元素保留在数组中供恢复/协作使用，但不再保留会指向
      // 活动元素的关系，避免产生悬空 container/bound/binding。
      if (isText(element) && element.containerId) deletedUpdates.containerId = null;
      if (element.boundElements?.length) deletedUpdates.boundElements = [];
      next.push(mutateElement(element, deletedUpdates));
      continue;
    }

    const updates = {};
    if (frameIds.has(element.frameId)) updates.frameId = null;
    if (element.boundElements?.some((reference) => deleteIds.has(reference.id))) {
      updates.boundElements = element.boundElements.filter((reference) => !deleteIds.has(reference.id));
    }
    if (element.containerId && deleteIds.has(element.containerId) && !cascade) {
      updates.containerId = null;
    }
    if (isLinear(element)) {
      if (element.startBinding && deleteIds.has(element.startBinding.elementId)) updates.startBinding = null;
      if (element.endBinding && deleteIds.has(element.endBinding.elementId)) updates.endBinding = null;
    }
    next.push(Object.keys(updates).length ? mutateElement(element, updates) : element);
  }

  if (!purge) return { elements: next, files };

  const liveFileIds = new Set(
    next
      .filter((element) => !element.isDeleted && element.type === "image" && element.fileId)
      .map((element) => element.fileId)
  );
  const nextFiles = Object.fromEntries(
    Object.entries(files ?? {}).filter(([fileId]) => liveFileIds.has(fileId))
  );
  return { elements: next, files: nextFiles };
}

export function ungroupElements(elements, { groupId, ids } = {}) {
  const targetIds = groupId
    ? [String(groupId)]
    : requireIds(elements, ids).flatMap((id) => elementById(elements, id)?.groupIds ?? []);
  const groups = new Set(targetIds);
  if (!groups.size) throw new Error("找不到要解除的 group id");
  return elements.map((element) => {
    const groupIds = element.groupIds ?? [];
    const nextGroupIds = groupIds.filter((id) => !groups.has(id));
    return valuesEqual(groupIds, nextGroupIds)
      ? element
      : mutateElement(element, { groupIds: nextGroupIds });
  });
}

export function unframeElements(elements, { frameId, ids } = {}) {
  let targetIds = new Set(ids ?? []);
  if (frameId) {
    for (const element of elements) {
      if (element.frameId === frameId) targetIds.add(element.id);
    }
  }
  if (!targetIds.size) throw new Error("请提供 --ids 或 --frame-id");
  return elements.map((element) => targetIds.has(element.id) && element.frameId != null
    ? mutateElement(element, { frameId: null })
    : element);
}

export function reorderElements(elements, ids, options = {}) {
  const selectedIds = new Set(requireIds(elements, ids));
  const hasBefore = options.before != null;
  const hasAfter = options.after != null;
  const hasFront = Boolean(options.front);
  const hasBack = Boolean(options.back);
  if ([hasBefore, hasAfter, hasFront, hasBack].filter(Boolean).length !== 1) {
    throw new Error("order 需要且只能指定 --before、--after、--front 或 --back");
  }

  const selected = elements.filter((element) => selectedIds.has(element.id));
  const remaining = elements.filter((element) => !selectedIds.has(element.id));
  let index;
  if (hasFront) {
    index = 0;
  } else if (hasBack) {
    index = remaining.length;
  } else {
    const targetId = String(options.before ?? options.after);
    if (selectedIds.has(targetId)) throw new Error("order 的目标不能同时被移动");
    const targetIndex = remaining.findIndex((element) => element.id === targetId);
    if (targetIndex < 0) throw new Error(`找不到 order 目标 id="${targetId}"`);
    index = targetIndex + (hasAfter ? 1 : 0);
  }

  const reordered = [
    ...remaining.slice(0, index),
    ...selected,
    ...remaining.slice(index),
  ];
  const indexed = assignMovedIndexes(reordered, selectedIds);
  return indexed.map((element, i) => {
    const previous = reordered[i];
    if (element.id !== previous.id || !hasOwn(element, "index") || valuesEqual(element.index, previous.index)) {
      return previous;
    }
    return mutateElement(previous, { index: element.index });
  });
}

function hasReference(element, id, type) {
  return (element.boundElements ?? []).some((reference) => reference.id === id && reference.type === type);
}

/**
 * 校验关系、文件引用和 fractional index。返回报告，不修改场景。
 */
export function validateScene(elements, files = {}) {
  const errors = [];
  const warnings = [];
  const byId = new Map();
  for (const element of elements) {
    if (byId.has(element.id)) errors.push(`重复元素 id="${element.id}"`);
    byId.set(element.id, element);
  }

  for (const element of elements) {
    if (element.containerId) {
      const container = byId.get(element.containerId);
      if (!container) errors.push(`${element.id}.containerId 引用不存在的 ${element.containerId}`);
      else if (!hasReference(container, element.id, "text")) {
        errors.push(`${element.id}.containerId 与容器 ${container.id}.boundElements 不对称`);
      }
    }
    for (const reference of element.boundElements ?? []) {
      const target = byId.get(reference.id);
      if (!target) {
        errors.push(`${element.id}.boundElements 引用不存在的 ${reference.id}`);
        continue;
      }
      if (reference.type === "text" && target.containerId !== element.id) {
        errors.push(`${element.id}.boundElements 的文本 ${reference.id} 缺少反向 containerId`);
      }
      if (reference.type === "arrow" && target.startBinding?.elementId !== element.id && target.endBinding?.elementId !== element.id) {
        errors.push(`${element.id}.boundElements 的箭头 ${reference.id} 缺少反向 binding`);
      }
    }
    for (const key of ["startBinding", "endBinding"]) {
      const binding = element[key];
      if (!binding) continue;
      const target = byId.get(binding.elementId);
      if (!target) {
        errors.push(`${element.id}.${key} 引用不存在的 ${binding.elementId}`);
      } else if (!hasReference(target, element.id, "arrow")) {
        errors.push(`${element.id}.${key} 与目标 ${target.id}.boundElements 不对称`);
      }
    }
    if (element.type === "image" && element.fileId && !files[element.fileId]) {
      errors.push(`${element.id}.fileId 引用不存在的 files.${element.fileId}`);
    }
    if (element.frameId && !byId.has(element.frameId)) {
      errors.push(`${element.id}.frameId 引用不存在的 ${element.frameId}`);
    }
  }

  const indexed = elements.some((element) => isValidOrderIndex(element.index));
  if (indexed) {
    const indexes = elements.map((element) => element.index);
    if (indexes.some((index) => !isValidOrderIndex(index))) {
      errors.push("elements 中存在缺失或非法 fractional index");
    } else if (new Set(indexes).size !== indexes.length) {
      errors.push("elements 中存在重复 fractional index");
    } else if (!indexes.every((index, i) => i === 0 || indexes[i - 1] < index)) {
      errors.push("fractional index 与 elements 数组顺序不一致");
    }
  }

  const referencedFiles = new Set(
    elements.filter((element) => !element.isDeleted && element.type === "image" && element.fileId)
      .map((element) => element.fileId)
  );
  for (const fileId of Object.keys(files)) {
    if (!referencedFiles.has(fileId)) warnings.push(`files.${fileId} 没有被活动 image 引用`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      elements: elements.length,
      activeElements: elements.filter((element) => !element.isDeleted).length,
      files: Object.keys(files).length,
    },
  };
}
