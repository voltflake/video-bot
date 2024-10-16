import { getContentLength, type Item } from "./util.ts";

export async function extractYoutubeContent(url: string): Promise<Item[]> {
    for (let i = 0; i < 3; i++) {
        try {
            // deno-lint-ignore no-await-in-loop
            return await ytapi(url);
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error("ytapi() failed. Stack trace -->");
                console.error(error.stack);
            } else {
                throw new Error("unreachable");
            }
        }
    }
    throw new Error("All YouTube APIs failed");
}

type YtapiResponse = {
    status: string;
    formats: {
        itag: number;
        url: string;
    }[];
};

// https://rapidapi.com/ytjar/api/yt-api
async function ytapi(url: string): Promise<Item[]> {
    const key = Deno.env.get("RAPIDAPI_KEY");
    if (!key) {
        throw new Error("RapidAPI key not found");
    }

    const video_id = url.match(/[a-zA-Z0-9]{11}/);
    if (!video_id) {
        throw new Error("Failed to extract video ID from URL");
    }

    const urlParams = {
        id: video_id[0],
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

    const response = await fetch(apiUrl, options);
    const json: YtapiResponse = await response.json();

    if (json.status !== "OK") {
        throw new Error(`API returned an error: ${json.status}. URL: ${url}`);
    }

    let formats_string = "";
    for (const [index, format] of json.formats.entries()) {
        formats_string += `${format.itag}${index === json.formats.length - 1 ? "" : ","}`;
    }
    console.info(`ytapi: found ${json.formats.length} formats for ${url}`);
    console.info(`These formats are: ${formats_string}`);

    // default video
    for (const format of json.formats) {
        try {
            const size = await getContentLength(format.url);
            return [{ type: "video", url: format.url, size: size }];
        } catch {
            console.error("ytapi: failed to validate format (mp4 video url)");
        }
    }

    throw new Error("Failed to find working format");
}
