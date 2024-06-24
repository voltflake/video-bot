// Supports default videos only

import type { Job } from "../types.js";
import { processSingleVideo } from "../handle_single_video.js";

export async function scraperapi(job: Job) {
    if (job.rapidapi_key == null) {
        throw new Error("Bad arguments");
    }

    const urlParams = {
        url: job.href,
        hd: "1"
    };
    const urlParamsStr = new URLSearchParams(urlParams).toString();
    const apiUrl = `https://tiktok-scraper7.p.rapidapi.com/?${urlParamsStr}`;
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
