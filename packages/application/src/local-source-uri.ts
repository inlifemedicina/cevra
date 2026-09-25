import { fileURLToPath } from "node:url";

// Local source V1 accepts local file URLs and absolute filesystem paths already
// understood by the managed media runtime. Network/provider and UNC paths are
// separate source capabilities.
export function localSourceProbeInput(uri: string): string | undefined {
  if (uri !== uri.trim() || /[\0\r\n]/u.test(uri)) return undefined;
  if (/^[A-Za-z]:[\\/]/u.test(uri)) return uri;
  if (uri.startsWith("/") && !uri.startsWith("//")) return uri;
  if (!uri.startsWith("file://")) return undefined;
  try {
    const parsed = new URL(uri);
    const local = parsed.protocol === "file:"
      && (parsed.hostname === "" || parsed.hostname === "localhost")
      && parsed.username === ""
      && parsed.password === ""
      && parsed.port === ""
      && parsed.search === ""
      && parsed.hash === ""
      && parsed.pathname.startsWith("/")
      && !parsed.pathname.startsWith("//");
    return local ? fileURLToPath(parsed) : undefined;
  } catch {
    return undefined;
  }
}
