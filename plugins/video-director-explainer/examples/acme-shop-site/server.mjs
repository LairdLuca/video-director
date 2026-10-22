#!/usr/bin/env node
// A fictional acme-shop back office on 127.0.0.1, to try shots.mjs capture:
// a login form, an order list with data that must be covered (customer
// names, emails, IBANs, one email in a shadow root and one in an iframe), an
// order page, two requests to other hosts and a redirect to another host
// (/leave) that the capture must block. Every name and number is invented.
import http from "node:http";

const port = Number(process.argv[2] ?? 4317);
const USER = "demo";
const PASSWORD = "demo-only-password";

const orders = [
  { id: 2041, customer: "Mara Fenwick", email: "mara.fenwick@example.com", iban: "IT00X0000000000000000123456", total: "84.00", status: "paid" },
  { id: 2042, customer: "Olek Brandt", email: "olek.brandt@example.com", iban: "DE00000000000000000000", total: "129.90", status: "failed" },
  { id: 2043, customer: "Ines Calloway", email: "ines.c@example.org", iban: "FR0000000000000000000000000", total: "42.50", status: "paid" },
  { id: 2044, customer: "Tobi Marsh", email: "tobi.marsh@example.net", iban: "NL00ACME0000000000", total: "17.20", status: "retrying" },
];

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} - acme-shop</title>
<script src="https://cdn.example.net/analytics.js"></script>
<style>
body{margin:0;font:16px system-ui,sans-serif;background:#f4f5f7;color:#1d2330}
header{display:flex;align-items:center;gap:24px;background:#1d2330;color:#fff;padding:14px 28px}
header b{font-size:20px} nav a{color:#c9d1e3;margin-right:18px;text-decoration:none} nav a.on{color:#fff;border-bottom:2px solid #ffb020}
main{padding:28px} .card{background:#fff;border-radius:10px;padding:22px;box-shadow:0 2px 8px #0001;margin-bottom:20px}
table{border-collapse:collapse;width:100%} th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #e6e8ee}
.badge{padding:3px 10px;border-radius:12px;font-size:13px;font-weight:600}
.paid{background:#e3f6e8;color:#1c7a3a}.failed{background:#fde6e6;color:#b42318}.retrying{background:#fff4d6;color:#8a5a00}
button{font:inherit;padding:8px 18px;border-radius:8px;border:0;background:#2f5bea;color:#fff;cursor:pointer}
input{font:inherit;padding:8px 10px;border:1px solid #c9ced8;border-radius:8px}
.banner{background:#fde6e6;color:#b42318;padding:14px 18px;border-radius:8px;margin-bottom:16px;font-weight:600}
.user{margin-left:auto;font-size:14px;color:#c9d1e3}
</style></head><body>${body}</body></html>`;

const shell = (active, inner) =>
  page(
    active,
    `<header><b>acme-shop</b><nav id="menu"><a href="/orders" class="${active === "Orders" ? "on" : ""}">Orders</a><a href="#">Payments</a><a href="#">Customers</a></nav>
<span class="user">signed in as ${USER}</span><img src="https://images.example.org/avatar.png" width="1" height="1" alt=""></header><main>${inner}</main>`,
  );

const list = (q) => {
  const rows = orders
    .filter((o) => !q || String(o.id).includes(q) || o.status.includes(q))
    .map(
      (o) => `<tr><td><a href="/orders/${o.id}">#${o.id}</a></td><td class="customer">${o.customer}</td><td class="email">${o.email}</td><td>${o.iban}</td><td>${o.total} EUR</td><td><span class="badge ${o.status}" id="status-${o.id}">${o.status}</span></td></tr>`,
    )
    .join("");
  return shell(
    "Orders",
    `<div class="card"><form method="get" action="/orders"><input id="q" name="q" value="${q ?? ""}" placeholder="order or status"> <button id="search">Search</button></form></div>
<div class="card"><table id="orders"><thead><tr><th>Order</th><th>Customer</th><th>Email</th><th>IBAN</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="card" id="contacts"><acme-support></acme-support> <iframe id="billing" src="/frame" title="billing" style="border:0;height:40px;width:520px;vertical-align:middle"></iframe></div>
<script>customElements.define("acme-support", class extends HTMLElement { connectedCallback() { this.attachShadow({ mode: "open" }).innerHTML = "Support: support@acme-shop.example"; } });</script>`,
  );
};

const detail = (o) =>
  shell(
    "Orders",
    `${o.status === "failed" ? '<div class="banner" id="error">Payment declined: the card has expired</div>' : ""}
<div class="card" id="summary"><h2>Order #${o.id}</h2><p>Customer: <span class="customer">${o.customer}</span> (${o.email})</p><p>Total: <b>${o.total} EUR</b></p>
<p>Status: <span class="badge ${o.status}" id="status">${o.status}</span></p><button id="retry">Retry payment</button></div>`,
  );

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const signedIn = /(?:^|;\s*)session=ok/.test(req.headers.cookie ?? "");
  const send = (code, html, headers = {}) => {
    res.writeHead(code, { "content-type": "text/html; charset=utf-8", ...headers });
    res.end(html);
  };
  if (url.pathname === "/login" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const f = new URLSearchParams(body);
      if (f.get("user") === USER && f.get("password") === PASSWORD) send(302, "", { location: "/orders", "set-cookie": "session=ok; HttpOnly; SameSite=Strict" });
      else send(401, page("Sign in", '<main><div class="card">Wrong user or password</div></main>'));
    });
    return;
  }
  if (url.pathname === "/login") {
    return send(
      200,
      page("Sign in", `<main><div class="card" style="max-width:360px;margin:80px auto"><h2>acme-shop back office</h2>
<form method="post" action="/login"><p><input id="user" name="user" placeholder="user"></p><p><input id="password" name="password" type="password" placeholder="password"></p>
<button id="signin" type="submit">Sign in</button></form></div></main>`),
    );
  }
  // A redirect to another host, which a capture must refuse.
  if (url.pathname === "/leave") return send(302, "", { location: "https://leak.example.com/" });
  if (!signedIn) return send(302, "", { location: "/login" });
  if (url.pathname === "/frame") return send(200, '<body style="margin:0;font:16px system-ui">Billing: billing@acme-shop.example</body>');
  if (url.pathname === "/" || url.pathname === "/orders") return send(200, list(url.searchParams.get("q")));
  const m = url.pathname.match(/^\/orders\/(\d+)$/);
  const o = m && orders.find((x) => x.id === Number(m[1]));
  if (o) return send(200, detail(o));
  send(404, page("Not found", "<main>Not found</main>"));
});

server.listen(port, "127.0.0.1", () => console.log(`acme-shop on http://127.0.0.1:${port} (user ${USER}; Ctrl+C to stop)`));
