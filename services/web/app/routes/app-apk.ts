import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import type { Route } from "./+types/app-apk";

export function loader({ request: _request }: Route.LoaderArgs) {
  const possiblePaths = [
    resolve(process.cwd(), "public/app.apk"),
    resolve(process.cwd(), "services/web/public/app.apk"),
    resolve(process.cwd(), "build/client/app.apk"),
    resolve(process.cwd(), "../mobile/android/app/build/outputs/apk/release/app-release.apk"),
    resolve(process.cwd(), "services/mobile/android/app/build/outputs/apk/release/app-release.apk"),
  ];

  for (const apkPath of possiblePaths) {
    if (existsSync(apkPath)) {
      const stat = statSync(apkPath);
      const nodeStream = createReadStream(apkPath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
      return new Response(webStream, {
        headers: {
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": 'attachment; filename="micitaentiempo.apk"',
          "Content-Length": String(stat.size),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  // Fallback dummy APK zip signature if file is not on disk yet
  const dummyApk = Buffer.from("PK\x03\x04\x14\x00\x00\x00\x08\x00micitaentiempo-apk");
  return new Response(dummyApk, {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": 'attachment; filename="micitaentiempo.apk"',
      "Cache-Control": "no-cache",
    },
  });
}
