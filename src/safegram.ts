import type { Content, Item } from "./util.js";
import { mkdir, writeFile } from "node:fs/promises";

export async function extractWithSavegram(url: URL): Promise<Content> {
    await mkdir("downloads", { recursive: true });

    const response = await (await fetch("https://savegram.app/en/instagram-video-downloader")).text();

    const k_exp = response.match(/k_exp="([^"]+)"/)![1];
    const k_token = response.match(/k_token="([^"]+)"/)![1];
    const t = "media";
    const lang = "en";
    const v = "v2";
    const q = url.href;
    if (k_exp === undefined || k_token === undefined) {
        throw new Error("Failed to extract k_exp or k_token");
    }

    //make a POST request to https://savegram.app/en/instagram-video-downloader with form data k_exp, k_token, t, lang, v, q in formdata format
    const postResponse = await fetch("https://savegram.app/api/ajaxSearch", {
    method: "POST",
        headers: {
        "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
        k_exp,
        k_token,
        q,
        t,
        lang,
        v,
    })
    });

    const data = await postResponse.text();

    const regex = /download-items__btn(?:.*?)(?:href=\\")(.*?)(?:\\")/g;
    let result;
    let filepaths: string[] = [];
    while (result = regex.exec(data)) {
        if (!result[1]) continue;
        const res = await fetch(result[1]);
        const header_filename = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1];
        if (!header_filename) continue;
        const filename = "downloads/" + header_filename;
        filepaths.push(filename);
        const fileBuffer = await res.arrayBuffer();
        await writeFile(filename, Buffer.from(fileBuffer));
    }

    const result_items: Item[] = [];
    for (const filepath_raw of filepaths) {
        // remove "./" prefix
        const filepath = filepath_raw.startsWith("# ./") ? filepath_raw.slice(2) : filepath_raw;
        if (filepath.endsWith(".jpg") || filepath.endsWith(".png") || filepath.endsWith(".jpeg")) {
            result_items.push({ filepath: `${filepath}`, type: "image" });
            continue;
        }
        if (filepath.endsWith(".mp4")) {
            result_items.push({ filepath: `${filepath}`, type: "video" });
            continue;
        }
        if (filepath.endsWith(".mp3") || filepath.endsWith(".m4a")) {
            result_items.push({ filepath: `${filepath}`, type: "audio" });
        }
    }

    if (result_items.length === 1 && result_items.find(item => item.type === "video")) {
        return { type: "video", items: result_items };
    } else {
        return { type: "gallery", items: result_items };
    }
}
