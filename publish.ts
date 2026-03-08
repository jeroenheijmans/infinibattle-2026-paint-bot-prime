import { $, Glob } from "bun";
import { mkdir } from "node:fs/promises";
import { zip } from "compressing";

const ROOT = process.cwd();
const PUB = `${ROOT}/publish`;

await mkdir(PUB, { recursive: true });

const targets = [
  "intermediary/*.md",
  "*.ts",
  "*.json",
  "*.md",
  "bun.lock"
];

for (const pattern of targets) {
  const globber = new Glob(pattern);
  const files = await Array.fromAsync(globber.scan("."));
  
  if (files.length > 0) {
    await $`cp ${files} ${PUB}`.nothrow();
  }
}

await zip.compressDir(PUB, `${ROOT}/publish.zip`, { ignoreBase: true });