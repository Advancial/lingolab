# Lingo Lab v2 (decoy site + Scramjet browser)

## Run
    npm install
    USERS="alex:pick-a-pw,sam:another,jo:third" SESSION_SECRET="long-random" npm start
    open http://localhost:8080 -> Log in -> browser opens

Needs HTTPS (or localhost) for service workers. On a VPS: Caddy or a Cloudflare Tunnel.

## Keep running (VPS)
    npm i -g pm2
    USERS="..." SESSION_SECRET="..." pm2 start server.js --name lingolab
    pm2 save && pm2 startup

## If something errors
Scramjet changes fast. This project targets the 1.x-style API
($scramjetLoadController / $scramjetLoadWorker, /scram/scramjet.*.js).
If npm installed a newer major with a different API:
    npm view @mercuryworkshop/scramjet versions
    npm install @mercuryworkshop/scramjet@<an older 1.x version>
and compare with the official Scramjet-App repo.

Panic key: press Escape twice to jump to the fake homepage.
