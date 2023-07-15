import { spawnSync } from "node:child_process";

function spawnSyncWrapper(command: string) {
    const argument_tokens = command.split(" ");
    const application = argument_tokens.shift();
    if (application == undefined) throw new Error("Bad command passed to spawnSyncWrapper()");
    return spawnSync(application, argument_tokens);
}

export default async function youtubeDL(youtube_url: string) {
    const yt_dlp = spawnSyncWrapper(`yt-dlp -f mp4 --print urls ${youtube_url}`);
    if (yt_dlp.status != 0) throw "yt-dlp exited with bad code";
    const links = new TextDecoder("utf-8").decode(yt_dlp.stdout).split("\n");
    if (links == undefined) throw "yt-dlp couldn't find any links";
    return links[0];
}
