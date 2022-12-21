import * as cp from "child_process";
import { join } from "path";
import { createGzip } from "zlib";
import { IImport } from "./types";

export interface ISize {
  compressed: number;
  original: number;
}

export async function measureModuleSize(cwd: string, esbuildDir: string, imp: IImport) {
  const esbuildPath = join(
    esbuildDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "esbuild.cmd" : "esbuild"
  );
  const proc = cp.spawn(esbuildPath, ["--platform=node", "--bundle", "--minify"], {
    cwd,
    stdio: "pipe",
  });

  let str = "";
  if (imp.members === "all") {
    str = `import * as foo`;
  } else if (imp.members === "default") {
    str = `import foo`;
  } else {
    str = `import { ${imp.members.join(", ")} }`;
  }
  proc.stdin.end(`${str} from ${JSON.stringify(imp.name)}`);

  let stderr: Buffer[] = [];
  proc.stderr.on("data", (c) => stderr.push(c));

  const sizes = new Promise<ISize>((resolve) => {
    let compressed = 0;
    let original = 0;

    proc.stdout
      .on("data", (c) => (original += c.length))
      .pipe(createGzip())
      .on("data", (c) => (compressed += c.length))
      .on("end", () => resolve({ compressed, original }));
  });

  await new Promise<void>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const output = Buffer.concat(stderr).toString();
        reject(new Error(`esbuild exited with code ${code}: ${output}`));
      }
    });
  });

  return sizes;
}
