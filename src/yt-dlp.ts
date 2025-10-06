import { type Content, runCommand } from "./util.ts";
import { mkdir } from "node:fs/promises";

export async function extractWithYtdlp(url: URL): Promise<Content | undefined> {
    try {
        await mkdir("downloads", { recursive: true });
        const { stdout } = await runCommand(["yt-dlp", "--quiet", "--no-warnings", "--print", "after_move:%(filepath)s", "--max-filesize", "100M", "--cookies", "../cookies.txt", url.href], "downloads");
        const filepath = stdout.split("\n")[0]?.trim();
        if (!filepath) return undefined;
        if (filepath === "NA") return undefined;
        return { type: "video", items: [{ filepath: filepath, type: "video" }] };
    } catch (error) {
        return undefined;
    }
}