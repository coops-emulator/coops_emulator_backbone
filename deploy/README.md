# Deployment configs

Every config in this folder does exactly one thing: set
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless` on every response. That's what
makes a page cross-origin isolated, which is what unlocks
`SharedArrayBuffer` in the browser — required only for **PSP**, whose only
available EmulatorJS core build (`ppsspp-thread-wasm.data`) needs it. Every
other system in this project's registry works without these headers. See
the main README's "Cross-origin isolation" section for the full explanation
and `src/core-registry.js`'s `systemsRequiringThreads()` for the
programmatic check this engine itself does before booting PSP.

You only need **one** of these, matching whatever's actually hosting the
page:

| Folder | Use if you're deploying to |
|---|---|
| `cloudflare-pages/_headers` | Cloudflare Pages |
| `netlify/netlify.toml` | Netlify |
| `nginx/coop-coep.conf` | Your own server behind nginx |
| `express/coop-coep-middleware.js` | A Node/Express server |

## Why `credentialless`, not `require-corp` (updated 2026-08-26)

An earlier version of every config in this folder used
`Cross-Origin-Embedder-Policy: require-corp` instead, with this section
honestly flagging that I hadn't been able to verify from a sandboxed
environment whether `cdn.emulatorjs.org` sends the `Cross-Origin-Resource-Policy`
header `require-corp` needs from every cross-origin resource.

That's now been verified — the hard way, in production. ROM Player by Coops
(the live app this wrapper's tuning is ported from) shipped `require-corp`
and it broke immediately: `cdn.emulatorjs.org` and `cdn.jsdelivr.net` do
**not** send back `Cross-Origin-Resource-Policy`, so `require-corp` silently
killed every fetch to them (`net::ERR_FAILED` with no HTTP status — looks
like a CDN outage, isn't one). This broke every core's boot, not just PSP's.

`credentialless` still yields `crossOriginIsolated === true` (all PSP needs)
without requiring third-party CORP cooperation, and does not have this
failure mode. Every config in this folder now uses it. If you've
independently confirmed your own CDN mirror or self-hosted `/data/` setup
sends proper CORP headers on every resource, `require-corp` is marginally
stricter and would also work — but `credentialless` is the safer default
and the one actually proven in production.

## What's verified vs. what to double-check yourself

I verified the *syntax* of each config against that platform's own docs
(linked in each file's comments) — the `_headers` file format, TOML header
block shape, nginx directive syntax, and Express middleware pattern are all
standard, documented mechanisms for that platform, and the header
value/behavior above is confirmed against a real production incident, not
just documentation.

What I still can't verify generally (this varies by what you're actually
hosting): if you're self-hosting EmulatorJS's `/data/` folder yourself
rather than using the public CDN, and you serve it from a *different origin*
than your app, you're back to needing that origin to cooperate with COEP one
way or another. Serving self-hosted data from the *same* origin as your app
(the common case) sidesteps this entirely, since same-origin resources
always satisfy COEP regardless of which mode you pick.

## If you're not hosting on one of these four

The requirement is platform-agnostic — any HTTP server that lets you set
arbitrary response headers can do this. Search your host's docs for
"custom headers" or "response headers" and set the same two header/value
pairs shown in any file above.
