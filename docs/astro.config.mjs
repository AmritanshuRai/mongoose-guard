import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLlmsTxt from "starlight-llms-txt";
import { pageIndex } from "./src/plugins/page-index.mjs";
import { remarkBaseLinks } from "./src/plugins/remark-base-links.mjs";

const site = "https://amritanshurai.github.io";
const base = "/mongoose-guard";
const repo = "https://github.com/AmritanshuRai/mongoose-guard";
const description =
  "mongoose-guard validates request bodies against your existing Mongoose schemas, with a per-route allowlist of fields, strict type checks without casting, and your schema's own validation rules.";

const sidebar = [
  {
    label: "Start here",
    items: ["introduction", "installation", "quick-start", "when-to-use"],
  },
  {
    label: "Concepts",
    items: [
      "concepts/validation-pipeline",
      "concepts/allowlist",
      "concepts/strict-types",
      "concepts/results-and-issues",
    ],
  },
  {
    label: "Guides",
    items: [
      "guides/express",
      "guides/web-request",
      "guides/without-a-framework",
      "guides/partial-updates",
      "guides/strip-mode",
      "guides/nested-data",
      "guides/custom-errors",
      "guides/typescript",
      "guides/testing",
    ],
  },
  {
    label: "Reference",
    items: [
      "reference/api",
      "reference/options",
      "reference/issue-codes",
      "reference/type-rules",
      "reference/allowlist-paths",
    ],
  },
  {
    label: "Understand",
    items: [
      "understand/comparison",
      "understand/security",
      "understand/how-it-works",
      "understand/limitations",
    ],
  },
  {
    label: "Help",
    items: ["faq", "troubleshooting", "changelog"],
  },
];

export default defineConfig({
  site,
  base,
  trailingSlash: "always",
  markdown: { remarkPlugins: [[remarkBaseLinks, { base }]] },
  integrations: [
    starlight({
      title: "mongoose-guard",
      description,
      logo: { src: "./src/assets/logo.svg", replacesTitle: false },
      favicon: "/favicon.svg",
      social: [
        { icon: "github", label: "GitHub", href: repo },
        { icon: "npm", label: "npm", href: "https://www.npmjs.com/package/mongoose-guard" },
      ],
      editLink: { baseUrl: `${repo}/edit/main/docs/` },
      lastUpdated: true,
      routeMiddleware: "./src/route-data.ts",
      customCss: ["./src/styles/custom.css"],
      head: [
        { tag: "meta", attrs: { property: "og:image", content: `${site}${base}/og.png` } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "msvalidate.01", content: "CC29AB4E1AB958E9D5FDDC9D6334181C" } },
        { tag: "meta", attrs: { name: "twitter:image", content: `${site}${base}/og.png` } },
        {
          tag: "link",
          attrs: { rel: "alternate", type: "text/plain", title: "llms.txt", href: `${base}/llms.txt` },
        },
      ],
      sidebar,
      plugins: [
        starlightLlmsTxt({
          projectName: "mongoose-guard",
          description,
          details: [
            "Key facts:",
            "",
            "- npm package `mongoose-guard`, MIT licensed, for Node.js 20+ with Mongoose 8 or 9.",
            "- It reads an existing Mongoose model. You do not write a second schema.",
            "- Each route declares an `allow` list of dot paths. Fields outside the list are rejected (or stripped with `unknown: \"strip\"`).",
            "- Types are checked strictly. `\"25\"` is not accepted for a Number field.",
            "- Imports: `mongoose-guard` (core), `mongoose-guard/express` (Express 4 and 5 middleware), `mongoose-guard/web` (standard `Request`, for Next.js, Hono, Remix, SvelteKit).",
            "- It does not validate query strings, route params or headers, and it does not run on edge runtimes such as Cloudflare Workers.",
            "",
            pageIndex({ sidebar, siteUrl: `${site}${base}/` }),
          ].join("\n"),
          promote: ["index*", "introduction*", "quick-start*", "when-to-use*"],
          demote: ["changelog*"],
        }),
      ],
    }),
  ],
});
