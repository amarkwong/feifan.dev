export default {
  async fetch(request) {
    const destination = new URL(request.url);
    destination.hostname = "discounts.feifan.dev";

    return new Response(null, {
      status: 308,
      headers: {
        Location: destination.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
};
