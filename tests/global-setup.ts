import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const databaseUrl = "file:test.sqlite";

export default function setup(): void {
  rmSync("prisma/test.sqlite", { force: true });
  rmSync("prisma/test.sqlite-journal", { force: true });
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}
