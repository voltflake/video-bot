import type { Content } from "./util.ts";
import { mkdir } from "node:fs/promises";

export async function extractWithYtdlp(url: URL): Promise<Content | undefined> {
    try {
        await mkdir("downloads", { recursive: true });
        const process = Bun.spawn(
            ["yt-dlp", "--quiet", "--no-warnings", "--print", "after_move:%(filepath)s", "--max-filesize", "100M", url.href],
            { cwd: "downloads" }
        );
        if (await process.exited !== 0) return undefined;
        const output = await new Response(process.stdout).text();
        const filepath = output.split("\n")[0]?.trim();
        if (!filepath) return undefined;
        if (filepath === "NA") return undefined;
        return { type: "video", items: [{ filepath: filepath, type: "video" }] };
    } catch (error) {
        return undefined;
    }
}