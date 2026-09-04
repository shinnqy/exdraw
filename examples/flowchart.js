/**
 * 示例：用 Drawing API 画一个简单流程图
 * 运行: node bin/exdraw.js run examples/flowchart.js -o examples/flowchart.excalidraw
 */

/** @param {import('../src/Drawing.js').Drawing} d */
export default function(d) {
  d.background("#f8f9fa");

  // ── 开始节点（圆角矩形）
  d.rect({
    x: 300, y: 50,
    width: 160, height: 60,
    rounded: true,
    backgroundColor: "#a5d8ff",
    strokeColor: "#1971c2",
    strokeWidth: 2,
    label: { text: "开始", textAlign: "center", verticalAlign: "middle", fontSize: 20 },
  });

  // ── 判断节点（菱形）
  d.diamond({
    x: 250, y: 180,
    width: 260, height: 100,
    backgroundColor: "#ffec99",
    strokeColor: "#f08c00",
    strokeWidth: 2,
    label: { text: "条件判断？", textAlign: "center", verticalAlign: "middle", fontSize: 18 },
  });

  // ── 处理节点 A（是）
  d.rect({
    x: 80, y: 360,
    width: 180, height: 60,
    rounded: true,
    backgroundColor: "#b2f2bb",
    strokeColor: "#099268",
    strokeWidth: 2,
    label: { text: "处理 A", textAlign: "center", verticalAlign: "middle", fontSize: 18 },
  });

  // ── 处理节点 B（否）
  d.rect({
    x: 500, y: 360,
    width: 180, height: 60,
    rounded: true,
    backgroundColor: "#ffc9c9",
    strokeColor: "#e03131",
    strokeWidth: 2,
    label: { text: "处理 B", textAlign: "center", verticalAlign: "middle", fontSize: 18 },
  });

  // ── 结束节点
  d.rect({
    x: 300, y: 500,
    width: 160, height: 60,
    rounded: true,
    backgroundColor: "#868e96",
    strokeColor: "#343a40",
    strokeWidth: 2,
    label: { text: "结束", textAlign: "center", verticalAlign: "middle", fontSize: 20, strokeColor: "#ffffff" },
  });

  // ── 箭头：开始 → 判断
  d.arrow({
    x: 380, y: 110,
    points: [[0, 0], [0, 70]],
    strokeColor: "#495057",
    strokeWidth: 2,
  });

  // ── 箭头：判断 → 处理A（是）
  d.arrow({
    x: 250, y: 230,
    points: [[0, 0], [-80, 0], [-80, 130]],
    strokeColor: "#099268",
    strokeWidth: 2,
    label: "是",
  });

  // ── 箭头：判断 → 处理B（否）
  d.arrow({
    x: 510, y: 230,
    points: [[0, 0], [80, 0], [80, 130]],
    strokeColor: "#e03131",
    strokeWidth: 2,
    label: "否",
  });

  // ── 箭头：处理A → 结束
  d.arrow({
    x: 170, y: 420,
    points: [[0, 0], [0, 40], [210, 40], [210, 80]],
    strokeColor: "#495057",
    strokeWidth: 2,
  });

  // ── 箭头：处理B → 结束
  d.arrow({
    x: 590, y: 420,
    points: [[0, 0], [0, 40], [-210, 40], [-210, 80]],
    strokeColor: "#495057",
    strokeWidth: 2,
  });

  // ── 标题文字
  d.text({
    x: 240, y: 10,
    text: "简单流程图示例",
    fontSize: 24,
    strokeColor: "#343a40",
  });
}
