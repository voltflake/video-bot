// Supports default videos only

import type { Job } from "../types.js";
import { processSingleVideo } from "../handle_single_video.js";

export default async function scraperapi(job: Job) {
    if (job.rapidapi_key == null) throw new Error("Bad arguments");

    const url_params = {
        url: job.href,
        hd: "1"
    };
    const url_params_str = new URLSearchParams(url_params).toString();
    const apiUrl = `https://tiktok-scraper7.p.rapidapi.com/?${url_params_str}`;
    const options = {
        method: "GET",
        headers: {
            "X-RapidAPI-Key": job.rapidapi_key,
            "X-RapidAPI-Host": "tiktok-scraper7.p.rapidapi.com"
        }
    };

    const response = await fetch(apiUrl, options);
    const result = await response.text();
    const json = JSON.parse(result);
    const url = json.data.play;
    const size = json.data.size;
    await processSingleVideo(url, size, job);
}
