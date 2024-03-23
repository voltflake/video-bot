// supports rells only

import { validateAndGetContentLength } from "../helper_functions.js";
import { Job } from "../types.js";
import { processSingleVideo } from "../common.js";

export default async function rocketapi(job: Job) {

    const regex_result = job.href.match(/(?<=instagram.com\/reel\/)[^\/]+/gm)
    if (regex_result == null) {
        throw new Error("");
    }

    const rocketapi_url = 'https://rocketapi-for-instagram.p.rapidapi.com/instagram/media/get_info_by_shortcode';

    const options = {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'X-RapidAPI-Key': '483548264amsh763f4afc0f7f6a0p11fa4djsn66827132bf45',
            'X-RapidAPI-Host': 'rocketapi-for-instagram.p.rapidapi.com'
        },
        body: JSON.stringify({
            shortcode: regex_result[0]
        })
    };

    const response = await fetch(rocketapi_url, options);
    const result = await response.text();
    const json = JSON.parse(result)
    const url = json.response.body.items[0].video_versions[0].url
    const size = await validateAndGetContentLength(url);
    await processSingleVideo(url, size, job)
}
