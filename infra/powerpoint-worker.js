export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ppt") {
      url.pathname = "/ppt/";
      return Response.redirect(url.toString(), 308);
    }
    if (!url.pathname.startsWith("/ppt/")) return new Response("Not found", {status: 404});
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return new Response("Sign in through the Lounge", {status: 401});
    url.hostname = "ppt-origin.feifan.dev";
    url.pathname = url.pathname.slice(4);
    // The origin verifies the signature, issuer, expiry and Lounge audience.
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    headers.set("Cf-Access-Jwt-Assertion", token);
    return fetch(new Request(url, {method: request.method, headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual"}));
  }
};
