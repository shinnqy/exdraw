/**
 * 命令行参数解析：把 argv 拆成 command / positionals / flags
 *
 * 支持：
 *   --key value
 *   --key=value
 *   --bool
 *   --no-bool
 *   -f file  -o file  -v  -q  -h
 */

const SHORT_FLAGS = {
  f: "file",
  o: "output",
  v: "verbose",
  q: "quiet",
  h: "help",
};

export function kebabToCamel(key) {
  return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export function parseArgv(argv) {
  const positionals = [];
  const flags = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (token.startsWith("--no-") && token.length > 5 && !token.includes("=")) {
      flags[kebabToCamel(token.slice(5))] = false;
      continue;
    }

    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags[kebabToCamel(body.slice(0, eq))] = body.slice(eq + 1);
        continue;
      }
      const key = kebabToCamel(body);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
      continue;
    }

    if (token.startsWith("-") && token.length === 2) {
      const mapped = SHORT_FLAGS[token[1]] ?? token[1];
      if (mapped === "help" || mapped === "verbose" || mapped === "quiet") {
        flags[mapped] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        flags[mapped] = true;
      } else {
        flags[mapped] = next;
        i++;
      }
      continue;
    }

    positionals.push(token);
  }

  const command = positionals.shift() ?? null;
  return { command, positionals, flags };
}

export function parsePoints(value) {
  if (Array.isArray(value)) return value;
  const raw = String(value).trim();
  if (!raw) return [];
  if (raw.startsWith("[")) return JSON.parse(raw);
  return raw
    .split(/[;|]+/)
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const parts = pair.split(",").map((n) => Number(n.trim()));
      if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) {
        throw new Error(`无法解析坐标点 "${pair}"，请用 0,0;100,50 这种格式`);
      }
      return parts;
    });
}

export function parseList(value) {
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function coerce(value, type) {
  if (value === undefined) return undefined;
  if (type === "number") {
    if (typeof value === "number") return value;
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error(`期望数字，得到 "${value}"`);
    return n;
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    const s = String(value).toLowerCase();
    if (["1", "true", "yes", "on"].includes(s)) return true;
    if (["0", "false", "no", "off"].includes(s)) return false;
    throw new Error(`期望布尔值，得到 "${value}"`);
  }
  if (type === "points") return parsePoints(value);
  if (type === "list") return parseList(value);
  if (value === true) return "";
  return String(value);
}
