import util from "node:util";
import { exec } from "node:child_process";

const promisifiedExec = util.promisify(exec);
export async function easySpawn(command: string) {
  const { stdout, stderr } = await promisifiedExec(command);
  return { stdout, stderr };
}

export async function validateAndGetContentLength(url: string): Promise<number> {
  const response = await fetch(url, { method: "HEAD" });
  if (!response.ok) {
    throw new Error();
  }
  let contentLength = response.headers.get("content-length");
  if (contentLength == null) {
    contentLength = response.headers.get("Content-Length");
  }
  if (contentLength == null) {
    throw new Error("No content length provided.");
  }
  return Number.parseInt(contentLength);
}
