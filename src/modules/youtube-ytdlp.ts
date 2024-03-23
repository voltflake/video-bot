// supports shorts and default videos

import { easySpawn, validateAndGetContentLength } from "../helper_functions.js";
import { processSingleVideo } from "../handle_single_video.js";
import type { Job } from "../types.js";

export default async function ytdlp(job: Job) {
    const process = await easySpawn(`yt-dlp -f mp4 --print urls ${job.href}`);
    const links = process.stdout.split("\n");
    if (links.length === 0) throw new Error();
    const url = links[0];
    const size = await validateAndGetContentLength(url);
    await processSingleVideo(url, size, job);
}
