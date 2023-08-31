import { easySpawn, validateAndGetContentLength } from "../../helper_functions.js";
import { BackendResponse } from "../../types.js";

export default async function ytdlp(youtube_url: string) {
    const process = await easySpawn(`yt-dlp -f mp4 --print urls ${youtube_url}`);
    let links = process.stdout.split("\n");
    if (links == undefined) throw new Error("(yt-dlp) no content links were found");
    const result: BackendResponse = { images: [], videos: [] };
    result.videos.push({ url: links[0], size: (await validateAndGetContentLength(links[0])) });
    return result;
}