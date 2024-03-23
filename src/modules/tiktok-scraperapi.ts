// supports default videos only

import { validateAndGetContentLength } from "../helper_functions.js";
import { Job } from "../types.js";
import { processSingleVideo } from "../common.js";

export default async function scraperapi(job: Job) {

    const api_url = "https://tiktok-scraper7.p.rapidapi.com/?" + new URLSearchParams({ url: job.href, hd: "1" }).toString();
    const options = {
        method: 'GET',
        headers: {
            'X-RapidAPI-Key': '483548264amsh763f4afc0f7f6a0p11fa4djsn66827132bf45',
            'X-RapidAPI-Host': 'tiktok-scraper7.p.rapidapi.com'
        }
    };

    const response = await fetch(api_url, options);
    const result = await response.text();
    const json = JSON.parse(result)
    const url = json.data.play
    const size = json.data.size;
    await processSingleVideo(url, size, job)
}
