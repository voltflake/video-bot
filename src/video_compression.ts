import { readFile, stat } from "node:fs/promises";
import { runCommand, toMbString } from "./util.js";

export async function compressVideo(filename_original: string): Promise<string> {
    // Locking mechanism to allow only one compression job at a time.
    console.info(`video compression: Started waiting for lock. Time: ${Date.now()}`);
    while (true) {
        if (process.env["COMPRESSING_IN_PROCESS"]) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
        }
        break;
    }
    try {
        process.env["COMPRESSING_IN_PROCESS"] = "1";
        console.info(`video compression: Lock aquired. Time: ${Date.now()}`);

        const filename_compressed = `${filename_original}_compressed.mp4`;

        const original_info = await ffprobe(filename_original);

        // 7% of file size is reserved for overhead so that file doesn't exceed Discord upload limit
        // Note that Raspberry Pi with h264_omx codec can't hv-encode videos with bitrate less than 150kb/s
        const available_bits_per_second = (10 * 1024 * 1024 * 8 * 0.93) / original_info.duration_in_seconds;
        const required_video_bitrate = Math.floor(available_bits_per_second - 96_000);

        const ffmpeg_args = ["-i", `${filename_original}`, "-y", "-c:a", "aac", "-b:a", "96K", "-b:v", `${required_video_bitrate.toString()}`];

        ffmpeg_args.push("-c:v");
        ffmpeg_args.push("libx264");
        ffmpeg_args.push(filename_compressed);

        await runCommand(["ffmpeg", ...ffmpeg_args]);

        const compressed_info = await ffprobe(filename_compressed);
        const compressed_video_file = await readFile(filename_compressed);
        const uncompressed_video_file = await readFile(filename_original);

        // Telemetry to help pick better compression settings for each codec in future
        const cbr_bitrate_error_percentage = compressed_info.video_bitrate / (required_video_bitrate * 0.01) - 100;
        const video_duration = original_info.duration_in_seconds;

        console.info(`ffmpeg info: ${ffmpeg_args}`);
        console.info(`video duration: ${video_duration.toFixed(2)}s`);
        console.info(`original file size: ${toMbString(uncompressed_video_file.byteLength)}`);
        console.info(`original video stream: bitrate=${original_info.video_bitrate} `);
        console.info(`size=${toMbString(video_duration * original_info.video_bitrate / 8)}`);
        console.info(`original audio stream: bitrate=${original_info.audio_bitrate} `);
        console.info(`size=${toMbString(video_duration * original_info.audio_bitrate / 8)}`);
        console.info(`resulted file size: ${toMbString(compressed_video_file.byteLength)}`);
        console.info(`resulted video stream: bitrate=${compressed_info.video_bitrate} `);
        console.info(`size=${toMbString(video_duration * compressed_info.video_bitrate / 8)}`);
        console.info(`resulted audio stream: bitrate=${compressed_info.audio_bitrate} `);
        console.info(`size=${toMbString(video_duration * compressed_info.audio_bitrate / 8)}`);
        console.info(`ffmpeg cbr error: ${cbr_bitrate_error_percentage.toFixed(2)}%`);
        return filename_compressed;
    } finally {
        delete process.env["COMPRESSING_IN_PROCESS"];
    }
}

async function ffprobe(filename: string): Promise<{ duration_in_seconds: number; video_bitrate: number; audio_bitrate: number }> {
    const file_info = await stat(filename);
    const { stdout } = await runCommand(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", `${filename}`]);
    const data = JSON.parse(stdout);
    const audio_bitrate = 128000; // Assume 128kbps because otherwise is too complicated
    const video_stream = data.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
    let video_bitrate = undefined;
    let duration_in_seconds = video_stream.duration ? Number.parseFloat(video_stream.duration) : undefined;
    if(!duration_in_seconds) {
        const duration_tag = video_stream.tags["DURATION"];
        if (!duration_tag) {
            throw new Error("Error when parsing video bitrate from ffprobe output");
        }
        const time_parts = duration_tag.split(":");
        if (time_parts.length !== 3) {
            throw new Error("Error when parsing video bitrate from ffprobe output");
        }
        const hours = Number.parseInt(time_parts[0]);
        const minutes = Number.parseInt(time_parts[1]);
        const seconds = Number.parseFloat(time_parts[2]);
        duration_in_seconds = hours * 3600 + minutes * 60 + seconds;
        if (isNaN(duration_in_seconds) || duration_in_seconds === 0) {
            throw new Error("Error when parsing video bitrate from ffprobe output");
        }
    }
    if (video_stream.bit_rate) {
        video_bitrate = Number.parseInt(video_stream.bit_rate);
    } else {
        video_bitrate = file_info.size * 8 / duration_in_seconds - audio_bitrate;
    }
    return {
        duration_in_seconds: duration_in_seconds,
        video_bitrate: video_bitrate,
        audio_bitrate: audio_bitrate,
    };
}
