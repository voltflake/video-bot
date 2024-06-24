// supports shorts and default videos

import { easySpawn, validateAndGetContentLength } from "../helper_functions.js";
import { processSingleVideo } from "../handle_single_video.js";
import type { Job } from "../types.js";

export async function ytdlp(job: Job) {
    const process = await easySpawn(`yt-dlp -f mp4 --print urls ${job.href}`);
    const links = process.stdout.split("\n");
    if (links[0] == null) {
        throw new Error("parsing yt-dlp output failed");
    }
    const url = links[0];
    const size = await validateAndGetContentLength(url);
    await processSingleVideo(url, size, job);
}
