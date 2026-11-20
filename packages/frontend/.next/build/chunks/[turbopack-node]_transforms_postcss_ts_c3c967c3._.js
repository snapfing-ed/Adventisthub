module.exports = [
"[turbopack-node]/transforms/postcss.ts { CONFIG => \"[project]/projects/mu_pcm/packages/frontend/postcss.config.mjs [postcss] (ecmascript)\" } [postcss] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "chunks/1a258_31615d12._.js",
  "chunks/[root-of-the-server]__be74402c._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[turbopack-node]/transforms/postcss.ts { CONFIG => \"[project]/projects/mu_pcm/packages/frontend/postcss.config.mjs [postcss] (ecmascript)\" } [postcss] (ecmascript)");
    });
});
}),
];