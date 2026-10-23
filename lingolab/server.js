import express from "express";
import { createServer } from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import wisp from "wisp-server-node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

// USERS="alex:pw1,sam:pw2,jo:pw3"  (defaults to fun:funfunfun for testing; CHANGE IT)
const USERS = new Map(
  (process.env.USERS || "fun:funfunfun").split(",").map((p) => {
    const i = p.indexOf(":");
    return [p.slice(0, i), p.slice(i + 1)];
  })
);

const sign = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("hex");
const makeToken = (user) => {
  const body = `${user}.${Date.now() + 12 * 3600e3}`;
  return `${body}.${sign(body)}`;
};
const validToken = (t) => {
  if (!t) return false;
  const parts = t.split(".");
  if (parts.length < 3) return false;
  const sig = parts.pop();
  const exp = Number(parts[parts.length - 1]);
  const a = Buffer.from(sig), b = Buffer.from(sign(parts.join(".")));
  return a.length === b.length && crypto.timingSafeEqual(a, b) && exp > Date.now();
};
const cookieOf = (req) =>
  (req.headers.cookie || "").split(";").map((c) => c.trim())
    .find((c) => c.startsWith("ll_session="))?.slice(11);
const authed = (req) => validToken(cookieOf(req));

// crude brute-force limiter: 8 tries / 10 min / IP
const tries = new Map();
const limited = (ip) => {
  const now = Date.now();
  const arr = (tries.get(ip) || []).filter((t) => now - t < 600e3);
  tries.set(ip, arr);
  return arr.length >= 8;
};

const app = express();
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false }));

app.post("/api/login", (req, res) => {
  const ip = req.ip;
  if (limited(ip)) return res.status(429).redirect("/login.html?e=1");
  const { username = "", password = "" } = req.body;
  const real = USERS.get(username);
  const ok = real !== undefined &&
    real.length === password.length &&
    crypto.timingSafeEqual(Buffer.from(real), Buffer.from(password));
  if (!ok) {
    tries.get(ip).push(Date.now());
    return res.redirect("/login.html?e=1");
  }
  res.setHeader("Set-Cookie",
    `ll_session=${makeToken(username)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200` +
    (req.secure ? "; Secure" : ""));
  res.redirect("/learn/");
});

// Gate: anyone not logged in sees a plain 404 for the proxy paths
const gate = (req, res, next) => {
  if (authed(req)) return next();
  if (req.path.startsWith("/learn")) return res.redirect("/login.html");
  res.status(404).send("Not found");
};
app.use(["/uv", "/baremux", "/epoxy", "/service", "/sw.js", "/learn"], gate);

// our own UV config (must come before the uvPath static)
app.get("/uv/uv.config.js", (_req, res) => res.sendFile(path.join(__dirname, "private/uv.config.js")));
app.get("/sw.js", (_req, res) => res.sendFile(path.join(__dirname, "private/sw.js")));
app.use("/learn", express.static(path.join(__dirname, "private/learn")));
app.use("/uv", express.static(uvPath));
app.use("/baremux", express.static(baremuxPath));
app.use("/epoxy", express.static(epoxyPath));

// public decoy site
app.use(express.static(path.join(__dirname, "public")));
app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, "public/404.html")));

const server = createServer(app);
server.on("upgrade", (req, socket, head) => {
  if (req.url.endsWith("/wisp/") && authed(req)) wisp.routeRequest(req, socket, head);
  else socket.destroy();
});
server.listen(PORT, () => console.log(`Lingo Lab running on :${PORT}`));
