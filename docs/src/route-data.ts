import { defineRouteMiddleware } from "@astrojs/starlight/route-data";

const SITE_URL = "https://amritanshurai.github.io/mongoose-guard/";
const REPO_URL = "https://github.com/AmritanshuRai/mongoose-guard";
const BUILD_DATE = new Date();

const author = {
  "@type": "Person",
  "@id": `${SITE_URL}#author`,
  name: "Amritanshu Rai",
  url: "https://github.com/AmritanshuRai",
};

const software = {
  "@type": "SoftwareSourceCode",
  "@id": `${SITE_URL}#software`,
  name: "mongoose-guard",
  description:
    "A TypeScript library that validates HTTP request bodies against existing Mongoose schemas, with per-route field allowlists and strict type checks.",
  url: SITE_URL,
  codeRepository: REPO_URL,
  programmingLanguage: ["TypeScript", "JavaScript"],
  runtimePlatform: "Node.js 20+",
  license: "https://opensource.org/licenses/MIT",
  author: { "@id": author["@id"] },
  keywords: [
    "mongoose",
    "validation",
    "express",
    "mass assignment",
    "request validation",
    "allowlist",
  ],
  softwareRequirements: ["mongoose >= 8", "node >= 20"],
};

const website = {
  "@type": "WebSite",
  "@id": `${SITE_URL}#website`,
  url: SITE_URL,
  name: "mongoose-guard documentation",
  inLanguage: "en",
  publisher: { "@id": author["@id"] },
  about: { "@id": software["@id"] },
};

function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^:::.*$/gm, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function faqEntries(body: string) {
  return body
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const newline = section.indexOf("\n");
      return {
        question: plainText(section.slice(0, newline)),
        answer: plainText(section.slice(newline + 1).replace(/\s*\[[^\]]+]\([^)]*\)\.\s*$/, "")),
      };
    })
    .filter(({ question, answer }) => question.endsWith("?") && answer.length > 0)
    .map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    }));
}

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  const { entry, lastUpdated } = route;
  if (entry.id === "404") {
    route.head.push({ tag: "meta", attrs: { name: "robots", content: "noindex" } });
    return;
  }
  const pageUrl = new URL(context.url.pathname, SITE_URL).href;
  const isHome = entry.id === "index";

  const page = {
    "@type": isHome ? "WebPage" : "TechArticle",
    "@id": `${pageUrl}#page`,
    url: pageUrl,
    headline: entry.data.title,
    name: entry.data.title,
    description: entry.data.description,
    inLanguage: "en",
    dateModified: (lastUpdated ?? BUILD_DATE).toISOString(),
    author: { "@id": author["@id"] },
    publisher: { "@id": author["@id"] },
    isPartOf: { "@id": website["@id"] },
    about: { "@id": software["@id"] },
  };

  const graph: object[] = [website, software, author, page];

  if (!isHome) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "mongoose-guard", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: entry.data.title, item: pageUrl },
      ],
    });
  }

  if (entry.id === "faq" && entry.body) {
    graph.push({ "@type": "FAQPage", "@id": `${pageUrl}#faq`, mainEntity: faqEntries(entry.body) });
  }

  route.head.push({
    tag: "script",
    attrs: { type: "application/ld+json" },
    content: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(
      /</g,
      "\\u003c",
    ),
  });
});
