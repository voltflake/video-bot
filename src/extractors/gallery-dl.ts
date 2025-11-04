import { type Item, runCommand } from "../util.js";
import { mkdir } from "node:fs/promises";

export async function extractWithGallerydl(url: URL): Promise<Item[]> {
    await mkdir("downloads", { recursive: true });

    let target_href = url.href;
    if (url.pathname.startsWith("/share/")) {
        if (!(url.pathname.startsWith("/share/p/") || url.pathname.startsWith("/share/reel/"))) {
            target_href = url.href.replace("/share/", "/share/p/");
        }
    }

    let { stdout } = await runCommand(["gallery-dl", "--cookies", "../cookies.txt", "-d", ".", "-o", 'filename="{filename}.{extension}"', "--filesize-max", "50M", target_href], "downloads");

    const filepaths = stdout.split("\n").map(line => line.trim()).filter(line => line);
    if (!filepaths.length) throw new Error("Invalid output from gallery-gl");

    const result_items: Item[] = [];
    for (const filepath_raw of filepaths) {
        // remove "./" prefix
        const filepath = filepath_raw.startsWith("# ./") ? filepath_raw.slice(2) : filepath_raw;
        if (filepath.endsWith(".jpg") || filepath.endsWith(".png") || filepath.endsWith(".jpeg")) {
            result_items.push({ filepath: `downloads/${filepath}`, type: "image" });
            continue;
        }
        if (filepath.endsWith(".mp4")) {
            result_items.push({ filepath: `downloads/${filepath}`, type: "video" });
            continue;
        }
        if (filepath.endsWith(".mp3") || filepath.endsWith(".m4a")) {
            result_items.push({ filepath: `downloads/${filepath}`, type: "audio" });
        }
    }

    return result_items;
}
