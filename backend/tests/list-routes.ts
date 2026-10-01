import { createApp } from "../src/app.js";

export type RouteInfo = { method: string; path: string };

const unmount = (layer: any) => {
  const source: string = layer.regexp.source;
  if (layer.regexp.fast_slash) return "";
  return source
    .replace("^\\/", "/").replace(/\\\/\?\(\?=\\\/\|\$\)$/, "").replaceAll("\\/", "/").replaceAll("(?:/([^/]+?))", "/:param");
};

function walk(stack: any[], prefix: string, out: RouteInfo[]) {
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) out.push({ method: method.toUpperCase(), path: (prefix + layer.route.path).replace(/:[A-Za-z]+/g, ":param").replace(/\/$/, "") || "/" });
    } else if (layer.name === "router" && layer.handle.stack) walk(layer.handle.stack, prefix + unmount(layer), out);
  }
}

export function listRoutes(): RouteInfo[] {
  const app: any = createApp();
  const out: RouteInfo[] = [];
  walk(app._router.stack, "", out);
  return out;
}
