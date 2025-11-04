import { promisify } from 'node:util';
import child_process from 'node:child_process';
const execFile = promisify(child_process.execFile);

export type FileType = "image" | "video" | "audio";

export type Item = {
    filepath: string;
    type: FileType;
};

export function toMbString(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(2)}MiB`;
}

export async function runCommand(cmd: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    if (cmd.length === 0) {
        throw new Error("runCommand requires at least one argument");
    }
    const binary = cmd[0];
    if (!binary) {
        throw new Error("runCommand requires a binary name");
    }
    const args = cmd.slice(1);

    let proc;
    if (cwd) {
        proc = await execFile(binary, args, { cwd });
    } else {
        proc = await execFile(binary, args);
    }

    return { stdout: proc.stdout, stderr: proc.stderr };
}
