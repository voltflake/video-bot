// supports rells only

import { validateAndGetContentLength } from "../helper_functions.js";
import { processSingleVideo } from "../handle_single_video.js";
import type { Job } from "../types.js";

export async function rocketapi(job: Job) {
    if (job.rapidapi_key == null) {
        throw new Error("Bad arguments");
    }

    const regexResult = job.href.match(/(?<=instagram.com\/reel\/)[^/]+/gm);
    if (regexResult == null) {
        throw new Error("Parsing instagram link failed");
    }

    const rocketapiUrl = "https://rocketapi-for-instagram.p.rapidapi.com/instagram/media/get_info_by_shortcode";

    const options = {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "X-RapidAPI-Key": job.rapidapi_key,
            "X-RapidAPI-Host": "rocketapi-for-instagram.p.rapidapi.com"
        },
        body: JSON.stringify({
            shortcode: regexResult[0]
        })
    };

    const response = await fetch(rocketapiUrl, options);
    const result = await response.text();
    const json = JSON.parse(result);
    const url = json.response.body.items[0].video_versions[0].url;
    const size = await validateAndGetContentLength(url);
    await processSingleVideo(url, size, job);
}
