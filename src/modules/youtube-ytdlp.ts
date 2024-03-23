// supports shorts and default videos

import { easySpawn, validateAndGetContentLength } from "../helper_functions.js";
import { Job } from "../types.js";
import { processSingleVideo } from "../common.js";

export default async function ytdlp(job: Job) {
    const process = await easySpawn(`yt-dlp -f mp4 --print urls ${job.href}`);
    let links = process.stdout.split("\n");
    if (links == undefined) {
        throw new Error();
    }
    const url = links[0];
    const size = await validateAndGetContentLength(url);
    await processSingleVideo(url, size, job)
}
