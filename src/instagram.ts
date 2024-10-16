import { getContentLength, type Item } from "./util.ts";

export async function extractInstagramContent(url: string): Promise<Item[]> {
    try {
        return await rocketapi(url);
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("rocketapi() failed. Stack trace -->");
            console.error(error.stack);
        } else {
            throw new Error("unreachable");
        }
    }
    throw new Error("All Instagram APIs failed");
}

type RocketapiResponse = {
    response: {
        body: {
            items: {
                image_versions2: { candidates: { url: string }[] };
                video_versions: { url: string }[];
                music_metadata: { music_info: { music_asset_info: { progressive_download_url: string } } };
                code: number;
                product_type: "carousel_container" | "feed" | "clips";
                carousel_media: {
                    media_type: number;
                    image_versions2: { candidates: { url: string }[] };
                    video_versions: { url: string }[];
                }[];
            }[];
        };
    };
};

async function rocketapi(url: string): Promise<Item[]> {
    const key = Deno.env.get("RAPIDAPI_KEY");
    if (!key) {
        throw new Error("RapidAPI key not found");
    }

    const shortcode = url.match(/(?<=instagram.com\/(p|reel)\/)[^/]+/);
    if (!shortcode) {
        throw new Error("Failed to extract shortcode from URL");
    }

    const apiUrl = "https://rocketapi-for-instagram.p.rapidapi.com/instagram/media/get_info_by_shortcode";
    const options = {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "X-RapidAPI-Key": key,
            "X-RapidAPI-Host": "rocketapi-for-instagram.p.rapidapi.com",
        },
        body: JSON.stringify({
            shortcode: shortcode[0],
        }),
    };

    const response = await fetch(apiUrl, options);
    const json: RocketapiResponse = await response.json();

    const info = json.response.body.items[0];
    if (info.product_type === "carousel_container") {
        return handleCarouselCase(info);
    }
    if (info.product_type === "feed") {
        return handleFeedCase(info);
    }
    if (info.product_type === "clips") {
        return handleClipsCase(info);
    }
    throw new Error(`Encountered unknown product_type. type: ${info.product_type} shortcode: ${info.code}`);
}
// Post with multiple items.
async function handleCarouselCase(info: RocketapiResponse["response"]["body"]["items"][number]): Promise<Item[]> {
    const result: Item[] = [];

    // Add items from post to result.
    for (const item of info.carousel_media) {
        // Item is an image.
        if (item.media_type === 1) {
            const url = item.image_versions2.candidates[0].url;
            const size = await getContentLength(url);
            result.push({ type: "image", url: url, size: size });
            continue;
        }
        // Item is an video.
        if (item.media_type === 2) {
            const url = item.video_versions[0].url;
            const size = await getContentLength(url);
            result.push({ type: "video", url: url, size: size });
            continue;
        }
        throw new Error(`encountered unknown media_type. code: ${item.media_type} shortcode: ${info.code}`);
    }

    // Add music from post, if it's provided.
    if (info.music_metadata.music_info) {
        if (result.find((item) => item.type === "video")) {
            console.error(`rocketapi: music item was provided in carousel post with video item. Shortcode is: ${info.code}`);
        }
        const url = info.music_metadata.music_info.music_asset_info.progressive_download_url;
        const size = await getContentLength(url);
        result.push({ type: "audio", url: url, size: size });
    }

    return result;
}

// Post with single photo. With or without music.
async function handleFeedCase(info: RocketapiResponse["response"]["body"]["items"][number]): Promise<Item[]> {
    const result: Item[] = [];

    // Add image to result.
    const url = info.image_versions2.candidates[0].url;
    const size = await getContentLength(url);
    result.push({ type: "image", url: url, size: size });

    // Add music to result, if it's provided.
    if (info.music_metadata.music_info) {
        const url = info.music_metadata.music_info.music_asset_info.progressive_download_url;
        const size = await getContentLength(url);
        result.push({ type: "audio", url: url, size: size });
    }

    return result;
}

// Post with a single video. (reel)
async function handleClipsCase(info: RocketapiResponse["response"]["body"]["items"][number]): Promise<Item[]> {
    const url = info.video_versions[0].url;
    const size = await getContentLength(url);
    return [{ type: "video", url: url, size: size }];
}
