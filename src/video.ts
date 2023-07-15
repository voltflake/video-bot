import { writeFile, readFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Message } from "discord.js";

import { Settings } from "./settings.js";

type VideoURL = {
    url: string;
    size: number;
};

type VideoJob = {
    message: Message,
    backend_to_use: Function,
    url: string,
    tries: number,
    skip_compression: boolean,
};

type CompressedVideo = {
    file: ArrayBufferLike,
    info: FFProbeInfo,
    original_info: FFProbeInfo,
    cbr_bitrate_error_percentage: number,
    ffmpeg_command: string,
};

type FFProbeInfo = {
    duration_in_seconds: number,
    video_bitrate: number,
    audio_bitrate: number,
};

export async function processVideoRequest(video_job: VideoJob, settings: Settings) {
    let video_data: VideoURL = {url: "", size: 0};
    for (let i = 0; i < video_job.tries; i++) {
        try {
            video_data.url = await video_job.backend_to_use(video_job.url);
            video_data.size = await validateAndGetContentLength(video_data.url);
            break;
        } catch (error) {
            if (i == video_job.tries - 1) {
                await video_job.message.reply({
                    content: `failed to extract video from \`${video_job.url}\` after ${video_job.tries + 1} tries.\n Last error was: ${error}`,
                    allowedMentions: { repliedUser: false }
                });
            }
            continue;
        }
    }

    const reply_with = await getVideoOrUrl(video_data, video_job.skip_compression, settings);

    if (reply_with == null) return;

    if (typeof reply_with == "string") {
        await video_job.message.reply({
            content: video_data.url,
            allowedMentions: { repliedUser: false }
        });
    }

    if (reply_with instanceof ArrayBuffer) {
        await video_job.message.reply({
            files: [{ attachment: Buffer.from(reply_with), name: "video.mp4" }],
            allowedMentions: { repliedUser: false }
        });
    }

    try {
        await video_job.message.suppressEmbeds(true);
    } catch {
        console.log("warning: bot has no permision to remove embeds, skipping...");
    }
}

async function getVideoOrUrl(video_data: VideoURL, skip_compression: boolean, settings: Settings) {

    function warnIfVideoIsTooBigForEmbed() {
        if (video_data.size > 50*1024*1024) {
            console.log("warning: sending url of video larger than 50MB, discord will not show embed");
        }
        return video_data.url;
    }

    if (settings!.embeded_mode) return warnIfVideoIsTooBigForEmbed();
    const response = await fetch(video_data.url);
    const original_video = await response.arrayBuffer();
    if (original_video.byteLength <= 25*1024*1024) return original_video;
    if (skip_compression) return null;
    if (!settings!.enable_compression) return warnIfVideoIsTooBigForEmbed();
    try {
        const compressed_video = await compressVideo(original_video, settings.codec_to_use);
        const cv = compressed_video;
        // some telemetry to help pick better compression settings for each codec in future
        const log_entry = `ffmpeg cmd: ${compressed_video.ffmpeg_command}\n` +
        `video duration: ${cv.info.duration_in_seconds.toFixed(2)}s\n` +
        `original file size: ${(original_video.byteLength / (1024*1024)).toFixed(2)}MB\n` +
        `original video stream: bitrate=${cv.original_info.video_bitrate} ` +
        `size=${(cv.original_info.video_bitrate * cv.original_info.duration_in_seconds / (8*1024*1024)).toFixed(2)}MB\n` +
        `original audio stream: bitrate=${cv.original_info.audio_bitrate} ` +
        `size=${(cv.original_info.audio_bitrate * cv.original_info.duration_in_seconds / (8*1024*1024)).toFixed(2)}MB\n` +
        `resulted file size: ${(compressed_video.file.byteLength / (1024*1024)).toFixed(2)}MB\n` +
        `resulted video stream: bitrate=${cv.info.video_bitrate} ` +
        `size=${(cv.info.video_bitrate * cv.info.duration_in_seconds / (8*1024*1024)).toFixed(2)}MB\n` +
        `resulted audio stream: bitrate=${cv.info.audio_bitrate} ` +
        `size=${(cv.info.audio_bitrate * cv.info.duration_in_seconds / (8*1024*1024)).toFixed(2)}MB\n` +
        `ffmpeg cbr error: ${compressed_video.cbr_bitrate_error_percentage > 0 ? "+" : "-"}` +
        `${Math.abs(compressed_video.cbr_bitrate_error_percentage).toFixed(3)}%\n\n`;

        await writeFile("./ffmpeg-log.txt", log_entry, { flag: "a+" });

        if (compressed_video.file.byteLength <= 25*1024*1024) return compressed_video.file;
        return warnIfVideoIsTooBigForEmbed();
    } catch (error) {
        console.log(error + ", sending video url instead.");
        return warnIfVideoIsTooBigForEmbed();
    }
}

function getVideoFileInfo(filename: string): FFProbeInfo {
    const ffprobe = spawnSyncWrapper(`ffprobe -v quiet -print_format json -show_streams ${filename}`);
    if (ffprobe.status != 0) throw "failed to execute ffprobe correctly";
    const ffprobe_json_text = new TextDecoder("utf-8").decode(ffprobe.stdout);
    const media_info = JSON.parse(ffprobe_json_text);
    return {
        duration_in_seconds: parseFloat(media_info.streams[0].duration),
        video_bitrate: parseInt(media_info.streams[0].bit_rate),
        audio_bitrate: parseInt(media_info.streams[1].bit_rate)
    };
}

// TODO add cleanup before throwing
async function compressVideo(video_data: ArrayBuffer, codec: string) : Promise<CompressedVideo> {
    await writeFile("original.mp4", Buffer.from(video_data));
    const video_info = getVideoFileInfo("original.mp4");

    // 4% reserved for muxing overhead
    const available_bits_per_second = (25 * 1024 * 1024 * 8 * 0.96) / video_info.duration_in_seconds;

    // SEE ffmpeg-tests.md
    // 0.80 is additional space if some video gets over +20% bitrate it was given
    const required_video_bitrate = Math.floor((available_bits_per_second - video_info.audio_bitrate) * 0.80);

    // rpi can't hv-encode videos with bitrate less than 150kb/s
    if (codec == "h264_omx")
        if (required_video_bitrate < 150_000) throw "can't compress video enough";

    const ffmpeg_cmd = `ffmpeg -i original.mp4 -y -c:a copy -b:v ${required_video_bitrate.toString()} -c:v ${codec} compressed.mp4`;
    const ffmpeg = spawnSyncWrapper(ffmpeg_cmd);
    if (ffmpeg.status != 0) throw "failed to execute ffmpeg correctly";

    const compressed_video = (await readFile("compressed.mp4")).buffer;
    const compressed_video_info = getVideoFileInfo("compressed.mp4");

    await unlink("original.mp4");
    await unlink("compressed.mp4");

    return {
        file: compressed_video,
        original_info: video_info,
        info: compressed_video_info,
        cbr_bitrate_error_percentage: compressed_video_info.video_bitrate/(required_video_bitrate*0.01) - 100,
        ffmpeg_command: ffmpeg_cmd,
    };
}

function spawnSyncWrapper(command: string) {
    const argument_tokens = command.split(" ");
    const application = argument_tokens.shift();
    if (application == undefined) throw new Error("Bad command passed to spawnSyncWrapper()");
    return spawnSync(application, argument_tokens);
}

async function validateAndGetContentLength(url: string): Promise<number> {
    const response = await fetch(url, { method: "HEAD" });
    if (response.status !== 200) throw `extracted video url is broken -> ${response.status} ${response.statusText}`;
    const content_length = response.headers.get("content-length");
    if (content_length == undefined) throw "content-length header is missing";
    return parseInt(content_length);
}
