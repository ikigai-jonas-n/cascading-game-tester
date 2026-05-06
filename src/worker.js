export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const newResponse = new Response(response.body, response);
    const versionId = env.CF_VERSION_METADATA?.id;
    if (versionId) {
      newResponse.headers.set('X-Worker-Version-Id', versionId);
    }
    return newResponse;
  },
};
