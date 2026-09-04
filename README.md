# exdraw

每个基础绘图操作都是一条 CLI 命令。指定位置和样式，结果追加写入同一个 `.excalidraw` 文件。

元素字段对齐官方 schema：<https://docs.excalidraw.com/docs/codebase/json-schema>

## 快速上手

```bash
node bin/exdraw.js new -f test.excalidraw
node bin/exdraw.js rect -f test.excalidraw --id browser --x 100 --y 80 --width 200 --height 50 --label Browser
node bin/exdraw.js rect -f test.excalidraw --id web --x 100 --y 200 --width 200 --height 50 --label Web
node bin/exdraw.js arrow -f test.excalidraw --from browser --to web --label HTTP
node bin/exdraw.js inspect test.excalidraw -v
```

`--points` 在 zsh 里必须加引号，否则分号会被当成命令分隔符。

## 子命令

### 形状

| 命令 | 说明 | 关键参数 |
|---|---|---|
| `rect` / `rectangle` | 矩形（默认圆角） | `--x --y --width --height --label --sharp` |
| `square` | 正方形 | `--size` 或 `--width` |
| `diamond` | 菱形 | `--x --y --width --height --label` |
| `oval` / `ellipse` | 椭圆 | `--width --height` |
| `circle` | 圆 | `--r` / `--diameter`，`--cx --cy` 或 `--x --y` |

### 线与箭头

| 命令 | 说明 | 关键参数 |
|---|---|---|
| `line` | 直线 / 折线 | `--points "0,0;100,50"` `--rounded` `--polygon` |
| `arrow` | 箭头 | `--points` 或 `--from/--to` `--elbow` `--label` |
| `freedraw` / `draw` | 手绘 | `--points`（必填） |

### 文字与媒体

| 命令 | 说明 | 关键参数 |
|---|---|---|
| `text` | 文字 | `--text` `--font-size` `--font-family` |
| `image` / `img` | 本地图片 | `--src ./a.png` |
| `embed` | 嵌入网页 | `--link https://...` |

### 结构与文件

| 命令 | 说明 |
|---|---|
| `frame` | Frame 容器，`--children id1,id2` |
| `group` | 编组，`--ids id1,id2` |
| `background` | 画布背景色 |
| `new` | 新建空白文件 |
| `inspect` | 查看元素概要 |

```bash
node bin/exdraw.js rect --help
node bin/exdraw.js arrow --help
node bin/exdraw.js circle --help
```

## 通用参数

| 参数 | 说明 |
|---|---|
| `-f, --file` | 要写入的 `.excalidraw` 文件 |
| `--x --y` | 左上角 |
| `--width --height` | 宽高 |
| `--stroke` / `--fill` | 描边 / 填充 |
| `--stroke-width` | `1` / `2` / `4` |
| `--stroke-style` | `solid` / `dashed` / `dotted` |
| `--fill-style` | `solid` / `hachure` / `cross-hatch` / `zigzag` |
| `--roughness` | `0` / `1` / `2` |
| `--opacity` | `0`-`100` |
| `--angle` | 旋转（度） |
| `--id` | 自定义 id，供 `--from/--to` 使用 |
| `--rounded` / `--sharp` | 圆角或直角 |
| `--from --to` | 箭头绑到已有形状 |
| `--from-side --to-side` | `left` `right` `top` `bottom` `center` |
| `--elbow` | 直角折线箭头 |
| `--link` | 超链接 |
| `--locked` | 锁定 |

## 作为库使用

```js
import { Drawing } from "./src/index.js";

const d = new Drawing();
d.rect({ id: "a", x: 0, y: 0, width: 160, height: 60, label: "Browser" });
d.circle({ cx: 280, cy: 30, r: 28, label: "DB" });
d.arrow({ from: "a", to: "DB的id", label: "SQL" });
await d.save("out.excalidraw");
```

## 运行测试

```bash
npm test
```
