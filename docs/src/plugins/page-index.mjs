import { readFileSync } from "node:fs";

const CONTENT_DIR = new URL("../content/docs/", import.meta.url);

function frontmatter(slug) {
  const source = readFileSync(new URL(`${slug}.mdx`, CONTENT_DIR), "utf8");
  const block = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const field = (name) => block.match(new RegExp(`^${name}: (.*)$`, "m"))?.[1]?.trim() ?? "";
  return { title: field("title"), description: field("description") };
}

export function pageIndex({ sidebar, siteUrl }) {
  return sidebar
    .map(({ label, items }) => {
      const links = items.map((slug) => {
        const { title, description } = frontmatter(slug);
        return `- [${title}](${siteUrl}${slug}/): ${description}`;
      });
      return [`${label}:`, "", ...links].join("\n");
    })
    .join("\n\n");
}
