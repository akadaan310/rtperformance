import { existsSync, readFileSync } from "node:fs";

for (const file of [".env.test.local", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}
