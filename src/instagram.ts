import { getContentLength, type Item, log } from "./util.ts";

export async function extractInstagramContent(url: string): Promise<Item[] | undefined> {
    const result = await rocketapi(url);
    if (result) {
        return result;
    }
    log("CRITICAL", "rocketapi failed.");
    return undefined;
}

async function rocketapi(url: string): Promise<Item[] | undefined> {
    const key = Deno.env.get("RAPIDAPI_KEY");
    if (!key) {
        log("CRITICAL", "rocketapi: RapidAPI key is not provided. Check bot configuration.");
        return undefined;
    }

    const shortcode = url.match(/(?<=instagram.com\/(p|reel)\/)[^/]+/);
    if (!shortcode) {
        log("CRITICAL", "rocketapi: failed to extract shortcode from URL.");
        return undefined;
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

    let json: {
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

    try {
        const response = await fetch(apiUrl, options);
        json = await response.json();
    } catch {
        log("CRITICAL", "rocketapi: API fetch() request failed.");
        return undefined;
    }

    const info = json.response.body.items[0];
    switch (info.product_type) {
        case "carousel_container": {
            return handleCarouselCase(info);
        }
        case "feed": {
            return handleFeedCase(info);
        }
        case "clips": {
            return handleClipsCase(info);
        }
        default: {
            log("CRITICAL", "rocketapi: encountered unknown product_type.");
        }
    }

    return undefined;

    // Post with multiple items.
    async function handleCarouselCase(info: (typeof json.response.body.items)[number]): Promise<Item[] | undefined> {
        const result: Item[] = [];

        // Add items from post to result.
        for (const item of info.carousel_media) {
            switch (item.media_type) {
                // Item is an image.
                case 1: {
                    const url = item.image_versions2.candidates[0].url;
                    const size = await getContentLength(url);
                    if (!size) {
                        log("FAULT", "rocketapi: failed to validate image item from carousel.");
                        continue;
                    }
                    result.push({ type: "image", url: url, size: size });
                    continue;
                }
                // Item is a video.
                case 2: {
                    const url = item.video_versions[0].url;
                    const size = await getContentLength(url);
                    if (!size) {
                        log("FAULT", "rocketapi: failed to validate video item from carousel.");
                        continue;
                    }
                    result.push({ type: "video", url: url, size: size });
                    continue;
                }
                default: {
                    log("FAULT", `rocketapi: Unknown media type in instagram carousel. Number: ${item.media_type}, shortcode is: ${info.code}`);
                    continue;
                }
            }
        }

        // Add music from post, if it's provided.
        if (info.music_metadata.music_info) {
            if (
                result.find((item) => {
                    return item.type === "video";
                })
            ) {
                log("INFO", `rocketapi: Music item was provided in carousel post with video item. Shortcode is: ${info.code}`);
            }
            const url = info.music_metadata.music_info.music_asset_info.progressive_download_url;
            const size = await getContentLength(url);
            if (size) {
                result.push({ type: "audio", url: url, size: size });
            } else {
                log("FAULT", "rocketapi: failed to validate audio item from carousel post.");
            }
        }

        return result;
    }

    // Post with single photo. With or without music.
    async function handleFeedCase(info: (typeof json.response.body.items)[number]): Promise<Item[] | undefined> {
        const result: Item[] = [];

        // Add image to result.
        const url = info.image_versions2.candidates[0].url;
        const size = await getContentLength(url);
        if (!size) {
            log("CRITICAL", "rocketapi: failed to validate image item from single image post.");
            return undefined;
        }
        result.push({ type: "image", url: url, size: size });

        // Add music to result, if it's provided.
        if (info.music_metadata.music_info) {
            const url = info.music_metadata.music_info.music_asset_info.progressive_download_url;
            const size = await getContentLength(url);
            if (size) {
                result.push({ type: "audio", url: url, size: size });
            } else {
                log("CRITICAL", "rocketapi: failed to validate audio item from single image post.");
            }
        }

        return result;
    }

    // Post with a single video. (reel)
    async function handleClipsCase(info: (typeof json.response.body.items)[number]): Promise<Item[] | undefined> {
        const url = info.video_versions[0].url;
        const size = await getContentLength(url);
        if (!size) {
            log("CRITICAL", "rocketapi: failed to validate video item from single video post.");
            return undefined;
        }
        return [{ type: "video", url: url, size: size }];
    }
}
