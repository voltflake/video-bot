import { access, constants, readFile, unlink, writeFile } from "node:fs/promises";
import { log } from "./util.ts";

export async function compressVideo(data: Blob): Promise<Blob | undefined> {
    // Locking mechanism to allow only one compression job at a time.
    const filename_lock = "./videos/compressing.lock";

    log("INFO", `video compression: Started waiting for lock. Time: ${Date.now()}`);
    while (true) {
        try {
            await access(filename_lock, constants.F_OK);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch {
            break;
        }
    }
    await writeFile(filename_lock, "");
    log("INFO", `video compression: Lock aquired. Time: ${Date.now()}`);

    const timestamp = Date.now();
    const filename = `./videos/${timestamp}.mp4`;
    const filename_compressed = `./videos/${timestamp}_compressed.mp4`;

    await writeFile(filename, await data.bytes());
    const original_info = await ffprobe(filename);
    if (!original_info) {
        return undefined;
    }

    // 4% reserved for muxing overhead.
    const available_bits_per_second = (25 * 1024 * 1024 * 8 * 0.96) / original_info.duration_in_seconds;

    // 0.80 is additional space if some video gets over +10% bitrate it was given
    // Note that Raspberry Pi with h264_omx codec can't hv-encode videos with bitrate less than 150kb/s
    const required_video_bitrate = Math.floor((available_bits_per_second - original_info.audio_bitrate) * 0.9);

    const ffmpeg_args = ["-i", `${filename}`, "-y", "-c:a", "copy", "-b:v", `${required_video_bitrate.toString()}`];
    const prefered_codec = Deno.env.get("CODEC");
    if (prefered_codec) {
        ffmpeg_args.push("-c:v");
        ffmpeg_args.push(prefered_codec);
    }
    ffmpeg_args.push(filename_compressed);

    try {
        const command = new Deno.Command("ffmpeg", { args: ffmpeg_args });
        const { code } = await command.output();
        if (code !== 0) {
            log("CRITICAL", `ffmpeg failed when compressing video to lower it's size. filename: ${filename} Args: ${ffmpeg_args.join(" ")}`);
            await unlink(filename_lock);
            return undefined;
        }
    } catch {
        log("CRITICAL", 'Spawning "ffprobe" process failed.');
        await unlink(filename_lock);
        return undefined;
    }

    const compressed_info = await ffprobe(filename_compressed);
    if (!compressed_info) {
        return undefined;
    }

    const compressed_video = new Blob([await readFile(filename_compressed, { encoding: "binary" })]);

    // Comment this section to keep temporary files after compression for testing.
    await unlink(filename);
    await unlink(filename_compressed);

    // Telemetry to help pick better compression settings for each codec in future.
    const cbr_bitrate_error_percentage = compressed_info.video_bitrate / (required_video_bitrate * 0.01) - 100;
    const bits_in_1MB = 8 * 1024 * 1024;
    const video_duration = original_info.duration_in_seconds;
    function calcSize(bitrate: number): number {
        return (bitrate * video_duration) / bits_in_1MB;
    }
    log("INFO", `ffmpeg info: ${ffmpeg_args}`);
    log("INFO", `video duration: ${video_duration.toFixed(2)}s`);
    log("INFO", `original file size: ${(data.size / (1024 * 1024)).toFixed(2)}MB`);
    log("INFO", `original video stream: bitrate=${original_info.video_bitrate} `);
    log("INFO", `size=${calcSize(original_info.video_bitrate).toFixed(2)}MB`);
    log("INFO", `original audio stream: bitrate=${original_info.audio_bitrate} `);
    log("INFO", `size=${calcSize(original_info.audio_bitrate).toFixed(2)}MB`);
    log("INFO", `resulted file size: ${(compressed_video.size / (1024 * 1024)).toFixed(2)}MB`);
    log("INFO", `resulted video stream: bitrate=${compressed_info.video_bitrate} `);
    log("INFO", `size=${calcSize(compressed_info.video_bitrate).toFixed(2)}MB`);
    log("INFO", `resulted audio stream: bitrate=${compressed_info.audio_bitrate} `);
    log("INFO", `size=${calcSize(compressed_info.audio_bitrate).toFixed(2)}MB`);
    log("INFO", `ffmpeg cbr error: ${cbr_bitrate_error_percentage.toFixed(2)}%`);

    await unlink(filename_lock);
    return compressed_video;
}

async function ffprobe(filename: string): Promise<{ duration_in_seconds: number; video_bitrate: number; audio_bitrate: number } | undefined> {
    let ffprobe_output: string;
    try {
        const command = new Deno.Command("ffprobe", { args: ["-v", "quiet", "-print_format", "json", "-show_streams", `${filename}`] });
        const { code, stdout } = await command.output();
        ffprobe_output = new TextDecoder().decode(stdout);
        if (code !== 0) {
            log("CRITICAL", '"ffprobe" exited with non 0 code.');
            return undefined;
        }
    } catch {
        log("CRITICAL", 'Spawning "ffprobe" process failed.');
        return undefined;
    }
    const data = JSON.parse(ffprobe_output);
    const duration_in_seconds = Number.parseFloat(data.streams[0].duration);
    const video_bitrate = Number.parseInt(data.streams[0].bit_rate);
    const audio_bitrate = Number.parseInt(data.streams[1].bit_rate);
    return {
        duration_in_seconds: duration_in_seconds,
        video_bitrate: video_bitrate,
        audio_bitrate: audio_bitrate,
    };
}
