# Lingo Lab (decoy site + Ultraviolet proxy)

## Run locally
    npm install
    USERS="alex:pick-a-pw,sam:another,jo:third" npm start
    open http://localhost:8080  ->  Log in

## Deploy (Render / Fly / any VPS with Node 18+)
- Build: `npm install`   Start: `npm start`
- Env vars: USERS (name:pw pairs, comma-separated), SESSION_SECRET (any long random string)
- Needs HTTPS (Render/Fly give it free) or service workers won't register.

## Tips
- Panic key: press Escape twice to bounce to the fake homepage.
- If install/start errors mention missing exports, compare server.js and the
  <script> setup in private/learn/index.html with the official Ultraviolet-App
  README; the UV/bare-mux packages change their APIs between releases.
