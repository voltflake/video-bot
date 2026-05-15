import type { Item } from "../util.js";
import { mkdir, writeFile } from "node:fs/promises";

export async function extractWithSsstik(url: URL): Promise<Item[]> {
    await mkdir("downloads", { recursive: true });

    const baseHeaders: Record<string, string> = {
        "Host": "ssstik.io",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,uk;q=0.8,ru;q=0.7",
        "Referer": "https://duckduckgo.com/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache"
    };

    const homepage = await (await fetch("https://ssstik.io/", { headers: baseHeaders })).text();
    // Detect Cloudflare JS/challenge page
    if (/Attention Required|cf-error|Cloudflare/.test(homepage)) {
        throw new Error("Cloudflare challenge detected when fetching ssstik.io.");
    }
    const s_tt_match = homepage.match(/s_tt\s*=\s*['"]([^'"]+)['"]/);
    const s_tt = s_tt_match?.[1];
    if (!s_tt) throw new Error("Failed to extract s_tt");

    const postResponse = await fetch("https://ssstik.io/abc?url=dl", {
        method: "POST",
        headers: { ...baseHeaders, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ id: url.href, locale: "en", tt: s_tt }).toString()
    });

    const postText = await postResponse.text();

    // Extract video URL from the HTML response
    const videoUrlMatch = postText.match(/href="(https:\/\/tikcdn\.io\/ssstik\/[^"]+)"/);
    if (!videoUrlMatch || !videoUrlMatch[1]) {
        throw new Error("Failed to extract video URL from response");
    }
    const videoUrl = videoUrlMatch[1];

    // Download the video
    const dlRes = await fetch(videoUrl);
    if (!dlRes.ok) {
        throw new Error(`Failed to download video: ${dlRes.status} ${dlRes.statusText}`);
    }

    // Get filename from content-disposition header or use default
    const contentDisposition = dlRes.headers.get("content-disposition");
    const filename = contentDisposition?.match(/filename="?([^"]+)"?/)?.[1] ?? `video_${Date.now()}.mp4`;
    const filepath = `downloads/${filename}`;
    
    const buffer = Buffer.from(await dlRes.arrayBuffer());
    await writeFile(filepath, buffer);

    return [{ filepath, type: "video" }];
}
