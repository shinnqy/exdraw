/**
 * 示例：所有基础元素的一览
 * 运行: node bin/exdraw.js run examples/primitives.js -o examples/primitives.excalidraw
 */

/** @param {import('../src/Drawing.js').Drawing} d */
export default function(d) {
  // 矩形（hachure 填充）
  d.rect({
    x: 20, y: 20, width: 120, height: 80,
    backgroundColor: "#a5d8ff",
    fillStyle: "hachure",
    strokeColor: "#1971c2",
    roughness: 2,
  });

  // 带圆角的矩形
  d.rect({
    x: 180, y: 20, width: 120, height: 80,
    rounded: true,
    backgroundColor: "#b2f2bb",
    strokeColor: "#099268",
  });

  // 椭圆
  d.oval({
    x: 340, y: 20, width: 120, height: 80,
    backgroundColor: "#ffec99",
    fillStyle: "cross-hatch",
    strokeColor: "#f08c00",
  });

  // 菱形
  d.diamond({
    x: 500, y: 20, width: 120, height: 80,
    backgroundColor: "#ffc9c9",
    strokeColor: "#e03131",
    roughness: 0,
  });

  // 带标签的矩形
  d.rect({
    x: 20, y: 140, width: 160, height: 70,
    rounded: true,
    backgroundColor: "#d0bfff",
    strokeColor: "#6741d9",
    label: { text: "带标签", textAlign: "center", verticalAlign: "middle", fontSize: 18 },
  });

  // 文本
  d.text({ x: 220, y: 150, text: "Hello Excalidraw!", fontSize: 24, strokeColor: "#1e1e1e" });
  d.text({ x: 220, y: 185, text: "多行\n文本", fontSize: 18, strokeColor: "#495057" });

  // 直线
  d.line({ x: 20, y: 260, points: [[0,0],[200,0]], strokeColor: "#343a40", strokeWidth: 2 });

  // 虚线
  d.line({
    x: 20, y: 285,
    points: [[0,0],[200,0]],
    strokeStyle: "dashed",
    strokeColor: "#868e96",
    strokeWidth: 2,
  });

  // 箭头（无头）
  d.arrow({
    x: 250, y: 260, points: [[0,0],[150,0]],
    startArrowhead: null, endArrowhead: "arrow",
    strokeColor: "#1971c2", strokeWidth: 2,
  });

  // 双向箭头
  d.arrow({
    x: 250, y: 285, points: [[0,0],[150,0]],
    startArrowhead: "arrow", endArrowhead: "arrow",
    strokeColor: "#e03131", strokeWidth: 2,
  });

  // 带标签箭头
  d.arrow({
    x: 450, y: 260, points: [[0,0],[150,50]],
    strokeColor: "#099268", strokeWidth: 2,
    label: "标签箭头",
  });

  // 折线箭头
  d.arrow({
    x: 20, y: 320,
    points: [[0,0],[100,0],[100,60],[200,60]],
    strokeColor: "#9c36b5", strokeWidth: 2,
    strokeStyle: "dotted",
  });

  // 标题
  d.text({ x: 280, y: -20, text: "基础元素一览", fontSize: 28, strokeColor: "#1e1e1e" });
}
