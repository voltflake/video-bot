import process from "node:process";
import { getContentLength, type Item, log } from "./util.ts";

export async function extractYoutubeContent(url: string): Promise<Item[] | undefined> {
    for (let i = 0; i < 3; i++) {
        const result = await ytapi(url);
        if (result) {
            return result;
        }
        log("CRITICAL", "ytapi failed.");
    }
    return undefined;
}

// https://rapidapi.com/ytjar/api/yt-api
async function ytapi(url: string): Promise<Item[] | undefined> {
    const key = process.env["RAPIDAPI_KEY"];
    if (!key) {
        log("CRITICAL", "ytapi: RapidAPI key is not provided. Check bot configuration.");
        return undefined;
    }

    const target_id = url.match(/[a-zA-Z0-9]{11}/);
    if (!target_id) {
        log("CRITICAL", "ytapi: failed to extract video ID from URL.");
        return undefined;
    }

    const urlParams = {
        id: target_id[0],
    };
    const urlParamsStr = new URLSearchParams(urlParams).toString();
    const apiUrl = `https://yt-api.p.rapidapi.com/dl?${urlParamsStr}`;
    const options = {
        method: "GET",
        headers: {
            "X-RapidAPI-Key": key,
            "x-rapidapi-host": "yt-api.p.rapidapi.com",
        },
    };

    let json: {
        status: string;
        formats: {
            itag: number;
            url: string;
        }[];
    };

    try {
        const response = await fetch(apiUrl, options);
        json = await response.json();
    } catch {
        log("CRITICAL", "ytapi: API request failed.");
        return undefined;
    }

    if (json.status !== "OK") {
        log("CRITICAL", `ytapi: API returned an error: ${json.status}. URL: ${url}`);
        return undefined;
    }

    let formats_string = "";
    for (const [index, format] of json.formats.entries()) {
        formats_string += `${format.itag}${index === json.formats.length - 1 ? "" : ","}`;
    }
    log("INFO", `ytapi: found ${json.formats.length} formats for ${url} These formats are: ${formats_string}`);

    // default video
    let result: undefined | Item[];
    for (const format of json.formats) {
        const size = await getContentLength(format.url);
        if (!size) {
            log("FAULT", "ytapi: failed to validate format (mp4 video url).");
            continue;
        }
        result = [{ type: "video", url: format.url, size: size }];
        break;
    }

    if (!result) {
        log("CRITICAL", "ytapi: failed to find working format.");
        return undefined;
    }

    return result;
}
