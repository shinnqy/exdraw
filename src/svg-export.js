/**
 * 在 Node CLI 中调用官方 Excalidraw SVG 导出器。
 *
 * @excalidraw/utils 的渲染器面向浏览器，Node 没有 document、FontFace 和
 * devicePixelRatio。这里集中提供最小 DOM 运行时，CLI 其余部分不需要感知
 * jsdom 或官方包的具体调用约定。
 */
import { JSDOM } from "jsdom";

let domRuntime = null;
let exportToSvgPromise = null;

class NodeFontFace {
  constructor(family, source, descriptors = {}) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
    this.style = descriptors.style ?? "normal";
    this.weight = descriptors.weight ?? "normal";
    this.stretch = descriptors.stretch ?? "normal";
    this.unicodeRange = descriptors.unicodeRange ?? "";
    this.variant = descriptors.variant ?? "normal";
    this.display = descriptors.display ?? "auto";
    this.featureSettings = descriptors.featureSettings ?? "normal";
    this.variationSettings = descriptors.variationSettings ?? "normal";
    this.status = "unloaded";
  }

  async load() {
    this.status = "loaded";
    return this;
  }

  get loaded() {
    return Promise.resolve(this);
  }
}

function installGlobal(name, value) {
  globalThis[name] = value;
}

function ensureDomRuntime() {
  if (domRuntime) return domRuntime;

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;

  installGlobal("window", window);
  installGlobal("document", window.document);
  installGlobal("DOMParser", window.DOMParser);
  installGlobal("XMLSerializer", window.XMLSerializer);
  installGlobal("SVGElement", window.SVGElement);
  installGlobal("HTMLElement", window.HTMLElement);
  installGlobal("Element", window.Element);
  installGlobal("Node", window.Node);
  installGlobal("Image", window.Image);
  installGlobal("getComputedStyle", window.getComputedStyle.bind(window));
  installGlobal("devicePixelRatio", 1);
  installGlobal("self", window);
  installGlobal("top", window);
  installGlobal("parent", window);

  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });

  const fontFace = NodeFontFace;
  installGlobal("FontFace", fontFace);
  window.FontFace = fontFace;
  if (!window.document.fonts) {
    Object.defineProperty(window.document, "fonts", {
      configurable: true,
      value: {
        add() {},
        delete() {},
        clear() {},
        check() { return true; },
        ready: Promise.resolve(),
        size: 0,
      },
    });
  }

  domRuntime = dom;
  return domRuntime;
}

async function getExportToSvg() {
  ensureDomRuntime();
  exportToSvgPromise ??= import("@excalidraw/utils").then((module) => module.exportToSvg);
  return exportToSvgPromise;
}

/**
 * @param {{ elements: object[], appState?: object, files?: object }} scene
 * @param {{ padding?: number }} [options]
 * @returns {Promise<string>}
 */
export async function exportSceneToSvg(scene, options = {}) {
  const exportToSvg = await getExportToSvg();
  const appState = {
    ...(scene.appState ?? {}),
    exportBackground: scene.appState?.exportBackground ?? true,
    exportWithDarkMode: scene.appState?.exportWithDarkMode ?? false,
    exportEmbedScene: scene.appState?.exportEmbedScene ?? false,
  };

  const svg = await exportToSvg({
    data: {
      type: scene.type ?? "excalidraw",
      version: scene.version ?? 2,
      source: scene.source ?? "https://excalidraw.com",
      elements: scene.elements ?? [],
      appState,
      files: scene.files ?? {},
    },
    config: {
      padding: options.padding ?? 10,
    },
  });

  if (!svg || typeof svg.outerHTML !== "string") {
    throw new Error("官方 SVG 导出器没有返回 SVGElement");
  }
  return svg.outerHTML;
}
