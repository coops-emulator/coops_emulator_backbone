// Express middleware for the same COOP/COEP requirement described in
// ../cloudflare-pages/_headers. Usage:
//
//   import express from "express";
//   import { coopCoepMiddleware } from "./deploy/express/coop-coep-middleware.js";
//
//   const app = express();
//   app.use(coopCoepMiddleware);
//   app.use(express.static("."));
//
// Order matters: register this before express.static (or whatever serves
// your HTML/JS/wasm-data files) so it runs on every response, not just some.

export function coopCoepMiddleware(req, res, next) {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
}
