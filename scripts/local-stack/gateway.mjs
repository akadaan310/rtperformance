// Minimal stand-in for Supabase's API gateway (Kong) used by the Docker-free local stack.
// Routes /auth/v1/* → GoTrue and /rest/v1/* → PostgREST, mirroring the hosted URL layout so
// @supabase/supabase-js works unchanged. Development and CI only.
import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const routes = [
  { prefix: "/auth/v1", target: { host: "127.0.0.1", port: Number(process.env.AUTH_PORT ?? 9999) } },
  { prefix: "/rest/v1", target: { host: "127.0.0.1", port: Number(process.env.REST_PORT ?? 3001) } },
];

http
  .createServer((req, res) => {
    const route = routes.find((r) => req.url?.startsWith(r.prefix));
    if (!route) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "Not found" }));
      return;
    }
    const headers = { ...req.headers, host: `${route.target.host}:${route.target.port}` };
    // Supabase clients send the anon key as `apikey`; PostgREST needs it as a bearer token when absent.
    if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
    const upstream = http.request(
      { ...route.target, method: req.method, path: req.url.slice(route.prefix.length) || "/", headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "Upstream unavailable" }));
    });
    req.pipe(upstream);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`gateway listening on http://127.0.0.1:${PORT}`));
