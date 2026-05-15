import type { Item } from "../util.js";
import { mkdir, writeFile } from "node:fs/promises";

export async function extractWithSavetik(url: URL): Promise<Item[]> {
    await mkdir("downloads", { recursive: true });

    const apiUrl = `https://savetik.net/api/action?url=${encodeURIComponent(url.href)}`;
    
    const response = await fetch(apiUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
            "Accept": "application/json"
        }
    });

    if (!response.ok) {
        throw new Error(`Savetik API failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { video_link?: string; status_code?: number };

    if (data.status_code !== 0 || !data.video_link) {
        throw new Error("Failed to extract video link from Savetik");
    }

    const videoUrl = data.video_link;

    // Download the video
    const dlRes = await fetch(videoUrl);
    if (!dlRes.ok) {
        throw new Error(`Failed to download video from Savetik link: ${dlRes.status} ${dlRes.statusText}`);
    }

    const filename = `tiktok_${Date.now()}.mp4`;
    const filepath = `downloads/${filename}`;

    const buffer = Buffer.from(await dlRes.arrayBuffer());
    await writeFile(filepath, buffer);

    return [{ filepath, type: "video" }];
}
