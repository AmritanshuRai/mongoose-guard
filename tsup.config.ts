import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    express: "src/adapters/express.ts",
    web: "src/adapters/web.ts",
  },
  format: ["esm", "cjs"],
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
  clean: true,
  sourcemap: true,
  target: "node20",
  splitting: true,
  treeshake: true,
});
