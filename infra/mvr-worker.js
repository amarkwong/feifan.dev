export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/mvr") {
      url.pathname = "/mvr/";
      return Response.redirect(url.toString(), 308);
    }
    if (!url.pathname.startsWith("/mvr/")) return new Response("Not found", {status: 404});
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return new Response("Sign in through the Lounge", {status: 401});
    url.hostname = "mvr-origin.feifan.dev";
    url.pathname = url.pathname.slice(4);
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    headers.set("Cf-Access-Jwt-Assertion", token);
    // Stream the upload; origin validates the signature, issuer, audience and expiry.
    return fetch(new Request(url, {
      method: request.method, headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    }));
  }
};
