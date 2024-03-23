import util from "node:util";
import { exec } from "node:child_process";

const promisified_exec = util.promisify(exec);
export async function easySpawn(command: string) {
    const { stdout, stderr } = await promisified_exec(command);
    return { stdout, stderr };
}

export async function validateAndGetContentLength(url: string): Promise<number> {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) {
        throw new Error();
    }
    const content_length = response.headers.get("content-length");
    if (content_length == null) {
        throw new Error();
    }
    return Number.parseInt(content_length);
}
