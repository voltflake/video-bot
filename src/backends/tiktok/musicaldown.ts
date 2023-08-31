// Scrapes video using musicaldown.com service
// Feel free to submit pull requests if you want to improve/fix this

import { BackendResponse } from "../../types.js";
import { validateAndGetContentLength } from "../../helper_functions.js";

// Possible Errors to use in this file
const backendErrors = {
    CookieFail: "(backend/musicaldown.com) Getting cookie data failed",
    VideoReqFail: "(backend/musicaldown.com) Posting a video request failed",
    VideoParseFail: "(backend/musicaldown.com) Parsing response of a video request failed",
    SlideshowReqFail: "(backend/musicaldown.com) Submiting slideshow request failed",
    SlideshowParseFail: "(backend/musicaldown.com) Parsing response of a slideshow request failed",
    Unavailable: "(backend/CDN) Resource is not available or request got rejected",
} as const;

// TODO: add better support for slideshow tiktoks
export default async function musicaldown(request_url: string) {
    const html = await submitRequestToService(request_url);

    let video_URL: string;
    if (!html.includes("Convert Video Now")) {
        video_URL = extractDefaultVideoURL(html);
    } else {
        const slideshow_URL = getSlideshowRequestURL(html);
        video_URL = await requestVideoFromSlideshow(slideshow_URL);
    }

    try {
        return {
            videos: [
                { url: video_URL, size: (await validateAndGetContentLength(video_URL)) }
            ],
            images: []
        } as BackendResponse;
    } catch (error) {
        throw backendErrors.Unavailable;
    }
}

// Gets html with links from service
async function submitRequestToService(tiktok_url: string): Promise<string> {
    // collect cookies & tokens to submit a POST request
    let init_response: Response, init_response_data: string, cookies: string;
    try {
        init_response = await fetch("https://musicaldown.com/en", {
            headers: {
                Accept: "*/*",
                Referer: "https://musicaldown.com",
                Origin: "https://musicaldown.com",
            },
        });
        init_response_data = await init_response.text();
    } catch (error) {
        throw backendErrors.CookieFail;
    }
    const new_cookies = init_response.headers.get("set-cookie")?.toString().match(/session_data=[^;]+(?=;)/g);
    if (new_cookies == undefined) throw backendErrors.CookieFail;
    cookies = new_cookies[0];

    const inputs = init_response_data.match(/<input[^>]+>/g);
    if (inputs == undefined) throw backendErrors.CookieFail;
    if (inputs.length < 2) throw backendErrors.CookieFail;

    const link_key = inputs[0].match(/(?<=name=")[^"]+(?=")/g)?.[0];
    const session_key = inputs[1].match(/(?<=name=")[^"]+(?=")/g)?.[0];
    const session_value = inputs[1].match(/(?<=value=")[^"]+(?=")/g)?.[0];
    if (link_key == undefined) throw backendErrors.CookieFail;
    if (session_key == undefined) throw backendErrors.CookieFail;
    if (session_value == undefined) throw backendErrors.CookieFail;

    // create and submit the request
    const form_data = new FormData();
    form_data.append("verify", "1");
    form_data.append(link_key, tiktok_url);
    form_data.append(session_key, session_value);
    const main_request = new Request("https://musicaldown.com/download", {
        method: "POST",
        headers: {
            "Origin": "https://musicaldown.com",
            "Referer": "https://musicaldown.com/en",
            "Cookie": cookies,
        },
        body: form_data,
    });

    try {
        const results_page = await fetch(main_request);
        const html = await results_page.text();
        return html;
    } catch (error) {
        throw backendErrors.VideoReqFail;
    }
}

// Extract link from results page
// TODO: extraction is too unreliable, should be using button text insted of blindly extracted links
function extractDefaultVideoURL(html: string) {
    const link_pattern = /https:\/\/[^"]+\/video\/[^&]+/g;
    const links_regex = html.match(link_pattern);
    if (links_regex != undefined) {
        for (let i = 0; i < links_regex.length; i++) {
            const element = links_regex[i];
            if (/video/g.test(element)) return element;
        }
    }
    throw backendErrors.VideoParseFail;
}

function getSlideshowRequestURL(html: string) {
    const link_pattern = /data:\s*{\s*data:\s*'(?<data>[^']+)/g;
    for (const match of html.matchAll(link_pattern)) {
        if (match?.groups?.data == undefined) continue;
        return match.groups.data;
    }
    throw backendErrors.SlideshowParseFail;
}

async function requestVideoFromSlideshow(data: string) {
    const form = new FormData();
    form.append("data", data);
    const request = new Request("https://mddown.xyz/slider", {
        method: "POST",
        headers: {
            "Origin": "https://musicaldown.com",
            "Referer": "https://musicaldown.com/en"
        },
        body: form,
    });
    const response = await fetch(request);
    const response_json = await response.json();
    if (response_json.url == undefined) throw backendErrors.SlideshowReqFail;
    return response_json.url;
}
