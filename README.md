# excalidraw-lib

每个基础绘图能力都是一条 CLI 命令。指定位置和样式参数，结果追加写入同一个 `.excalidraw` 文件，不用手写冗长 JSON。

## 快速上手

Node.js ≥ 18，无额外依赖。

```bash
node bin/exdraw.js new  -f test.excalidraw
node bin/exdraw.js text -f test.excalidraw --x 100 --y 20 --text "集群模式"
node bin/exdraw.js rect -f test.excalidraw --x 100 --y 80 --width 320 --height 50 --label Browser --rounded
node bin/exdraw.js arrow -f test.excalidraw --points "260,130;260,200" --label HTTP
node bin/exdraw.js inspect test.excalidraw -v
```

生成的文件可以直接用 [Excalidraw](https://excalidraw.com) 打开。

## 绘图命令

每条命令都要带 `-f <file.excalidraw>`。文件不存在会自动创建；多次调用会往同一个文件里追加元素。

| 命令 | 作用 | 示例 |
|---|---|---|
| `text` | 写文字 | `exdraw text -f t.excalidraw --x 10 --y 20 --text "标题"` |
| `rect` | 矩形（别名 `rectangle`） | `exdraw rect -f t.excalidraw --x 10 --y 80 --width 200 --height 50 --label Browser --rounded` |
| `oval` | 椭圆（别名 `ellipse`） | `exdraw oval -f t.excalidraw --x 10 --y 160 --width 160 --height 70 --label Node` |
| `diamond` | 菱形 | `exdraw diamond -f t.excalidraw --x 10 --y 250 --width 200 --height 90 --label "条件？"` |
| `line` | 直线 / 折线 | `exdraw line -f t.excalidraw --points "10,360;210,360"` |
| `arrow` | 箭头 | `exdraw arrow -f t.excalidraw --points "110,130;110,200" --label HTTP` |
| `frame` | Frame 容器 | `exdraw frame -f t.excalidraw --x 0 --y 0 --width 400 --height 300 --name Compute` |
| `background` | 画布背景色 | `exdraw background -f t.excalidraw --color "#f8f9fa"` |

查看某条命令的全部参数：

```bash
node bin/exdraw.js text --help
node bin/exdraw.js rect --help
node bin/exdraw.js arrow --help
```

文字内容和框内标签也可以写成位置参数：

```bash
node bin/exdraw.js text -f test.excalidraw --x 100 --y 20 "集群模式"
node bin/exdraw.js rect -f test.excalidraw --x 100 --y 80 --width 320 --height 50 Browser
```

## 通用参数

| 参数 | 说明 |
|---|---|
| `-f, --file` | 要写入的 `.excalidraw` 文件 |
| `--x` `--y` | 左上角坐标 |
| `--width` `--height` | 宽高 |
| `--stroke` / `--color` | 描边颜色 |
| `--fill` / `--bg` | 填充颜色 |
| `--stroke-width` | `1` / `2` / `4` |
| `--stroke-style` | `solid` / `dashed` / `dotted` |
| `--fill-style` | `solid` / `hachure` / `cross-hatch` / `zigzag` |
| `--roughness` | `0` / `1` / `2` |
| `--opacity` | `0`-`100` |
| `--rounded` | 矩形圆角 |
| `--label` | 形状或箭头上的文字 |
| `--points` | 点列，必须加引号：`"0,0;100,50"` 或 `"[[0,0],[100,50]]"`。不写 `--x --y` 时，第一个点就是起点 |
| `--font-size` `--font-family` `--text-align` | 文本样式 |
| `--start-arrowhead` `--end-arrowhead` | `none` / `arrow` / `bar` / `circle` / `triangle` / `diamond` |
| `-q, --quiet` | 少打印 |

## 文件命令

```bash
node bin/exdraw.js new -f test.excalidraw
node bin/exdraw.js inspect test.excalidraw -v
```

## 作为 Node.js 库使用

```js
import { Drawing } from "./src/index.js";

const d = new Drawing();
d.rect({ x: 0, y: 0, width: 200, height: 100, label: "Box" });
d.arrow({ points: [[200, 50], [300, 50]] });
await d.save("output.excalidraw");
```

## 运行测试

```bash
npm test
```
