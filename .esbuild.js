const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");
const minify = !watch || process.argv.includes("--minify");

// Build the editor provider
esbuild
	.build({
		entryPoints: ["src/extension.ts"],
		tsconfig: "./tsconfig.json",
		bundle: true,
		external: ["vscode"],
		sourcemap: watch,
		minify,
		watch,
    external: ['pnpapi', 'vscode'],
		platform: "node",
		outfile: "dist/extension.js",
	})
	.catch(() => process.exit(1));

esbuild
	.build({
		entryPoints: ["node_modules/piscina/dist/src/worker.js"],
		bundle: true,
		sourcemap: watch,
		minify,
		watch,
		platform: "node",
		outfile: "dist/worker.js",
	})
	.catch(() => process.exit(1));

esbuild
	.build({
		entryPoints: ["src/extract-worker/index.ts"],
		tsconfig: "./tsconfig.json",
		bundle: true,
		external: ["vscode"],
		sourcemap: watch,
		minify,
		watch,
		platform: "node",
		outfile: "dist/extract-worker.js",
	})
	.catch(() => process.exit(1));
