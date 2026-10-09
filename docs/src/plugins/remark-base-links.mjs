const ATTRIBUTES = new Set(["href", "link"]);

export function remarkBaseLinks({ base }) {
  const prefix = base.replace(/\/$/, "");
  const shouldPrefix = (url) =>
    typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.startsWith(`${prefix}/`);

  const visit = (node) => {
    if (node.type === "link" && shouldPrefix(node.url)) node.url = prefix + node.url;
    if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
      for (const attribute of node.attributes ?? []) {
        if (ATTRIBUTES.has(attribute.name) && shouldPrefix(attribute.value)) {
          attribute.value = prefix + attribute.value;
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };

  return (tree) => visit(tree);
}
