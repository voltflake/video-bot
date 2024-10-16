import { getContentLength, type Item } from "./util.ts";

export async function extractTiktokContent(url: string): Promise<Item[]> {
    try {
        return await tiktokscraper7(url);
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("tiktokscraper7() failed. Stack trace -->");
            console.error(error.stack);
        } else {
            throw new Error("unreachable");
        }
    }
    throw new Error("All TikTok APIs failed");
}

type Tiktokscraper7Response = {
    msg: string;
    data: { play: string; wmplay: string; images: string[] };
};

// https://rapidapi.com/tikwm-tikwm-default/api/tiktok-scraper7
async function tiktokscraper7(url: string): Promise<Item[]> {
    const key = Deno.env.get("RAPIDAPI_KEY");
    if (!key) {
        throw new Error("RapidAPI key not found");
    }

    const urlParams = {
        url: url,
        hd: "0",
    };
    const urlParamsStr = new URLSearchParams(urlParams).toString();
    const apiUrl = `https://tiktok-scraper7.p.rapidapi.com/?${urlParamsStr}`;
    const options = {
        method: "GET",
        headers: {
            "X-RapidAPI-Key": key,
            "X-RapidAPI-Host": "tiktok-scraper7.p.rapidapi.com",
        },
    };

    const response = await fetch(apiUrl, options);
    const json: Tiktokscraper7Response = await response.json();

    // Probably a live video or a bad link
    if (json.msg !== "success") {
        throw new Error(`API returned an error: ${json.msg}. URL: ${url}`);
    }

    // Default video
    if (!json.data.images) {
        try {
            const size = await getContentLength(json.data.play);
            return [{ type: "video", url: json.data.play, size: size }];
        } catch {
            console.error(`tiktokscraper7: failed to validate "play" variant`);
        }

        try {
            const size = await getContentLength(json.data.wmplay);
            return [{ type: "video", url: json.data.wmplay, size: size }];
        } catch {
            console.error(`tiktokscraper7: failed to validate "wmplay" variant`);
        }

        throw new Error("Both play and wmplay variants failed to validate");
    }

    // Slideshow post
    if (json.data.images) {
        const result: Item[] = [];
        try {
            const size = await getContentLength(json.data.play);
            result.push({ type: "audio", url: json.data.play, size: size });
        } catch {
            throw new Error("Failed to validate audio URL from slideshow post");
        }
        for (const image_url of json.data.images) {
            try {
                const size = await getContentLength(json.data.wmplay);
                result.push({ type: "image", url: image_url, size: size });
            } catch {
                throw new Error("Failed to validate one of slideshow post images");
            }
        }
        return result;
    }

    throw new Error("Provided URL is not a video nor a slideshow post");
}
