// supports rells only

import { validateAndGetContentLength } from "../helper_functions.js";
import { processSingleVideo } from "../handle_single_video.js";
import type { Job } from "../types.js";

export default async function rocketapi(job: Job) {
    if (job.rapidapi_key == null) throw new Error("Bad arguments");

    const regex_result = job.href.match(/(?<=instagram.com\/reel\/)[^/]+/gm);
    if (regex_result == null) throw new Error("Parsing instagram link failed");

    const rocketapi_url = "https://rocketapi-for-instagram.p.rapidapi.com/instagram/media/get_info_by_shortcode";

    const options = {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "X-RapidAPI-Key": job.rapidapi_key,
            "X-RapidAPI-Host": "rocketapi-for-instagram.p.rapidapi.com"
        },
        body: JSON.stringify({
            shortcode: regex_result[0]
        })
    };

    const response = await fetch(rocketapi_url, options);
    const result = await response.text();
    const json = JSON.parse(result);
    const url = json.response.body.items[0].video_versions[0].url;
    const size = await validateAndGetContentLength(url);
    await processSingleVideo(url, size, job);
}
