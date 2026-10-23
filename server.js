import express from "express";
import { createServer } from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

// Locate Scramjet's static files regardless of how this version exports them
let scramjetPath;
try {
  const m = await import("@mercuryworkshop/scramjet/path");
  if (typeof m.scramjetPath === "string") scramjetPath = m.scramjetPath;
} catch {}
if (!scramjetPath) scramjetPath = path.join(__dirname, "node_modules/@mercuryworkshop/scramjet/dist");
console.log("Scramjet files:", scramjetPath, fs.existsSync(scramjetPath) ? fs.readdirSync(scramjetPath).join(", ") : "(missing)");
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

// brute-force limiter: 8 failed tries / 10 min / IP
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
  if (limited(ip)) return res.redirect("/login.html?e=1");
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

// Gate: not logged in -> proxy paths look like they don't exist
const gate = (req, res, next) => {
  if (authed(req)) return next();
  if (req.path.startsWith("/learn")) return res.redirect("/login.html");
  res.status(404).send("Not found");
};
app.use(["/scram", "/baremux", "/libcurl", "/service", "/sw.js", "/learn"], gate);

app.get("/sw.js", (_req, res) => {
  res.setHeader("Service-Worker-Allowed", "/");
  res.sendFile(path.join(__dirname, "private/sw.js"));
});
app.get("/learn/diag", (_req, res) =>
  res.json({ dir: scramjetPath, files: fs.existsSync(scramjetPath) ? fs.readdirSync(scramjetPath) : [] }));
app.use("/learn", express.static(path.join(__dirname, "private/learn")));
app.use("/scram", express.static(scramjetPath));
app.use("/baremux", express.static(baremuxPath));
app.use("/libcurl", express.static(libcurlPath));

// public decoy site
app.use(express.static(path.join(__dirname, "public")));
app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, "public/404.html")));

const server = createServer(app);
server.on("upgrade", (req, socket, head) => {
  if (req.url.endsWith("/wisp/") && authed(req)) wisp.routeRequest(req, socket, head);
  else socket.destroy();
});
server.listen(PORT, () => console.log(`Lingo Lab running on :${PORT}`));
