// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as cp from "child_process";
import { CachedInputFileSystem, ResolverFactory } from "enhanced-resolve";
import { promises as fs, readFileSync } from "fs";
import { dirname, join } from "path";
import Piscina from "piscina";
import * as vscode from "vscode";
import { Cache } from "./cache";
import { debounce, once } from "./fn";
import { measureModuleSize } from "./measureModuleSize";
import { ICachedRecord, IImport, Target } from "./types";

/** Languages the plugin will try to detect on. */
const detectedLanguages: ReadonlySet<string> = new Set([
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
]);

/** How long to wait before */
const lastUsedThresholdMs = 1000 * 60 * 60 * 24 * 14;

/** Decoration type for bundle sizes */
const decorationType = vscode.window.createTextEditorDecorationType({});

export function activate(context: vscode.ExtensionContext) {
  const esbuildPath = join(context.globalStorageUri.fsPath, "esbuild");
  const installEsbuildOnce = once(() => installEsbuild(esbuildPath));

  const cachePath = join(context.globalStorageUri.fsPath, "cache.bin");
  const cache = once(() => {
    try {
      return Cache.deserialize(readFileSync(cachePath));
    } catch {
      return new Cache();
    }
  });
  const saveCache = debounce(30_000, async () => {
    await fs.writeFile(
      cachePath,
      await cache().serialize(new Date(Date.now() - lastUsedThresholdMs))
    );
  });

  const resolvedModules = new Map<
    /* module name */ string,
    { main: string; pkgJson: { version: string } }
  >();
  const resolveModule = async (target: Target, name: string, cwd: string) => {
    const cached = resolvedModules.get(name);
    if (cached) {
      return cached;
    }

    let resolved: string;
    try {
      resolved = await resolve(cwd, name, target);
    } catch (e) {
      throw e;
    }
    let pkgPath = dirname(resolved);
    while (true) {
      try {
        const path = join(pkgPath, "package.json");
        await fs.stat(path);
        pkgPath = path;
        break;
      } catch {
        pkgPath = dirname(pkgPath);
        continue;
      }
    }

    const pkgJson = JSON.parse(await fs.readFile(pkgPath, "utf8"));
    const rec = { main: resolved, pkgJson };
    resolvedModules.set(name, rec);
    return rec;
  };

  const extractWorker = new Piscina({
    filename: join(context.extensionPath, "dist/extract-worker.js"),
    minThreads: 0,
  });

  interface IEditorState {
    version: number;
    aborter: AbortController;
  }

  let lastEditors = new Map<vscode.TextEditor, IEditorState>();
  function syncEditors(editors: readonly vscode.TextEditor[]) {
    editors = editors.filter((e) => detectedLanguages.has(e.document.languageId));

    const nextEditors = new Map<vscode.TextEditor, IEditorState>();
    for (const editor of editors) {
      const prev = lastEditors.get(editor);
      if (editor.document.version === prev?.version) {
        nextEditors.set(editor, prev);
        continue;
      }

      prev?.aborter.abort();

      const aborter = new AbortController();
      extractWorker.run(editor.document.getText() /*{ signal: aborter.signal }*/).then(
        (imports: IImport[]) => {
          if (aborter.signal.aborted) {
            return;
          }

          let decorations: vscode.DecorationOptions[] = [];
          aborter.signal.addEventListener("abort", () => editor.setDecorations(decorationType, []));
          imports
            .filter((i) => !i.name.startsWith("."))
            .map(async (imp) => {
              try {
                await installEsbuildOnce();
                const mod = await resolveModule(
                  Target.browser,
                  imp.name,
                  editor.document.uri.fsPath
                );
                if (!mod) {
                  return;
                }

                const size = await cache().getOrReplace(
                  Target.browser,
                  `${mod.main}@${mod.pkgJson}`,
                  imp.members,
                  async () => {
                    const size = await measureModuleSize(
                      dirname(editor.document.uri.fsPath),
                      esbuildPath,
                      imp
                    );
                    saveCache(); // debounced
                    return {
                      compressed: size.compressed,
                      original: size.original,
                      lastUsed: new Date(),
                    };
                  }
                );

                if (aborter.signal.aborted) {
                  return;
                }

                decorations.push({
                  renderOptions: getDecoration(size),
                  range: new vscode.Range(
                    new vscode.Position(imp.range.start.line - 1, 0),
                    new vscode.Position(imp.range.end.line - 1, Number.MAX_SAFE_INTEGER)
                  ),
                });
                editor.setDecorations(decorationType, decorations);
              } catch {
                // ignored, probably does not exist
              }
            });
        },
        (err) => {
          if (!aborter.signal.aborted) {
            console.error(`faster-import-cost: error extracting from ${editor.document.uri}`, err);
          }
        }
      );
    }
  }

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((e) => syncEditors(e)),
    // vscode.workspace.onDidChangeTextDocument((e) => )
    vscode.commands.registerCommand("faster-import-cost.installEsbuild", async () =>
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: "Installing esbuild..." },
        async () => {
          installEsbuildOnce.forget();
          if (await installEsbuildOnce()) {
            vscode.window.showInformationMessage(
              `faster-import-cost: esbuild successfully installed`
            );
          }
        }
      )
    )
  );

  syncEditors(vscode.window.visibleTextEditors);
}

export function deactivate() {}

async function installEsbuild(esbuildPath: string): Promise<boolean> {
  await fs.mkdir(esbuildPath, { recursive: true });
  await fs.writeFile(
    join(esbuildPath, "package.json"),
    JSON.stringify({
      dependencies: {
        esbuild: "latest",
      },
    })
  );

  return new Promise((resolve) =>
    cp.exec("npm install", { cwd: esbuildPath }, (err, stdout, stderr) => {
      if (err) {
        vscode.window.showErrorMessage(
          `faster-import-cost: error installing esbuild: ${stderr || stdout}`
        );
        resolve(false);
      } else {
        resolve(true);
      }
    })
  );
}

const nodeResolver = once(() =>
  ResolverFactory.createResolver({
    fileSystem: new CachedInputFileSystem(require("fs"), 4000),
    conditionNames: ["import", "node"],
  })
);

const browserResolver = once(() =>
  ResolverFactory.createResolver({
    fileSystem: new CachedInputFileSystem(require("fs"), 4000),
    mainFields: ["browser", "module", "main"],
    conditionNames: ["browser", "import"],
  })
);

const resolve = (cwd: string, path: string, target: Target) =>
  new Promise<string>((resolve, reject) =>
    (target === Target.browser ? browserResolver() : nodeResolver()).resolve(
      {},
      cwd,
      path,
      {},
      (err, res) => (err ? reject(err) : resolve(res as string))
    )
  );

const formatSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${(bytes / 1024).toFixed(2)} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
};

const getDecoration = (size: ICachedRecord): vscode.DecorationRenderOptions => {
  const configuration = vscode.workspace.getConfiguration("fasterImportCost");
  const colorSize =
    configuration.bundleSizeColoring === "minified" ? size.compressed : size.original;

  const sizeInKB = colorSize / 1024;
  let color;
  if (sizeInKB < configuration.smallPackageSize) {
    color = {
      dark: { after: { color: configuration.smallPackageDarkColor } },
      light: { after: { color: configuration.smallPackageLightColor } },
    };
  } else if (sizeInKB < configuration.mediumPackageSize) {
    color = {
      dark: { after: { color: configuration.mediumPackageDarkColor } },
      light: { after: { color: configuration.mediumPackageLightColor } },
    };
  } else {
    color = {
      dark: { after: { color: configuration.largePackageDarkColor } },
      light: { after: { color: configuration.largePackageLightColor } },
    };
  }

  return {
    ...color,
    after: {
      contentText: `${formatSize(size.original)} (${formatSize(size.compressed)} gzip)`,
      margin: "0 0 0 1.5rem",
    },
  };
};
