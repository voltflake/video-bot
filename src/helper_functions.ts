import util from 'node:util';
import { exec } from 'node:child_process';

const promisified_exec = util.promisify(exec);

export async function easySpawn(command: string) {
    const { stdout, stderr } = await promisified_exec(command);
    return { stdout: stdout, stderr: stderr};
}

export async function validateAndGetContentLength(url: string): Promise<number> {
    let response;
    try {
        response = await fetch(url, { method: "HEAD" });
    } catch (error) {
        throw new Error(`HEAD request failed`);
    }
    if (response.status !== 200)
        throw new Error(`extracted video url is broken ->\n${response.status} ${response.statusText}`);
    const content_length = response.headers.get("content-length");
    if (content_length == undefined) throw new Error("content-length header is missing");
    return parseInt(content_length);
}