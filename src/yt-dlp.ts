import { type Content, type Item, runCommand } from "./util.js";
import { mkdir } from "node:fs/promises";

export async function extractWithYtdlp(url: URL): Promise<Content> {
    await mkdir("downloads", { recursive: true });
    const { stdout } = await runCommand(["yt-dlp", "--quiet", "--no-warnings", "--print", "after_move:%(filepath)s", "--max-filesize", "100M", "--cookies", "../cookies.txt", url.href], "downloads");
    const filepaths = stdout.split("\n");
    const result: Item[] = [];
    for (const filepath of filepaths) {
        if (filepath.endsWith("NA") || filepath === "") continue;
        if (filepath.endsWith(".mp4") || filepath.endsWith(".webm")) result.push({ filepath, type: "video" });
        else if (filepath.endsWith(".jpg") || filepath.endsWith(".png") || filepath.endsWith(".webp")) result.push({ filepath, type: "image" });
    }
    if (result.length === 0) throw new Error("No downloadable content found");
    if (result.length === 1) return { type: "video", items: result };
    return { type: "gallery", items: result };
}