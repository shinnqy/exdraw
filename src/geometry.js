/**
 * 形状锚点 / 箭头绑定几何
 */

export function sidePoint(el, side = "center") {
  const { x, y, width, height } = el;
  switch (side) {
    case "left":
      return { x, y: y + height / 2, fp: [0, 0.5] };
    case "right":
      return { x: x + width, y: y + height / 2, fp: [1, 0.5] };
    case "top":
      return { x: x + width / 2, y, fp: [0.5, 0] };
    case "bottom":
      return { x: x + width / 2, y: y + height, fp: [0.5, 1] };
    default:
      return { x: x + width / 2, y: y + height / 2, fp: [0.5, 0.5] };
  }
}

export function autoSides(a, b) {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ["right", "left"] : ["left", "right"];
  }
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

export function makeBinding(elementId, fixedPoint) {
  return {
    elementId,
    focus: 0,
    gap: 1,
    fixedPoint,
    mode: "orbit",
  };
}

export function elbowPoints(start, end, fromSide) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 || dy === 0) {
    return [[start.x, start.y], [end.x, end.y]];
  }
  const horizFirst = fromSide === "left" || fromSide === "right";
  if (horizFirst) {
    return [[start.x, start.y], [end.x, start.y], [end.x, end.y]];
  }
  return [[start.x, start.y], [start.x, end.y], [end.x, end.y]];
}
