import { join } from "jsr:@std/path";

export async function compressVideo(data: Uint8Array): Promise<Uint8Array> {
    // Locking mechanism to allow only one compression job at a time.
    console.info(`video compression: Started waiting for lock. Time: ${Date.now()}`);
    while (true) {
        if (Deno.env.has("COMPRESSING_IN_PROCESS")) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
        }
        break;
    }
    try {
        Deno.env.set("COMPRESSING_IN_PROCESS", "");
        console.info(`video compression: Lock aquired. Time: ${Date.now()}`);

        const temp_dir = await Deno.makeTempDir();
        const filename_original = join(temp_dir, "video.mp4");
        const filename_compressed = join(temp_dir, "video_compressed.mp4");

        await Deno.writeFile(filename_original, data);
        const original_info = await ffprobe(filename_original);

        // 4% reserved for muxing overhead.
        const available_bits_per_second = (25 * 1024 * 1024 * 8 * 0.96) / original_info.duration_in_seconds;

        // 0.80 is additional space if some video gets over +10% bitrate it was given
        // Note that Raspberry Pi with h264_omx codec can't hv-encode videos with bitrate less than 150kb/s
        const required_video_bitrate = Math.floor((available_bits_per_second - original_info.audio_bitrate) * 0.9);

        const ffmpeg_args = ["-i", `${filename_original}`, "-y", "-c:a", "copy", "-b:v", `${required_video_bitrate.toString()}`];

        ffmpeg_args.push("-c:v");
        const prefered_codec = Deno.env.get("CODEC");
        ffmpeg_args.push(prefered_codec ? prefered_codec : "libx264");

        ffmpeg_args.push(filename_compressed);

        const command = new Deno.Command("ffmpeg", { args: ffmpeg_args });
        const { code } = await command.output();
        if (code !== 0) {
            throw new Error(`ffmpeg failed when compressing video. Non 0 exit code. filename: ${filename_original} Args: ${ffmpeg_args.join(" ")}`);
        }

        const compressed_info = await ffprobe(filename_compressed);
        const compressed_video = await Deno.readFile(filename_compressed);

        // Comment this section to keep temporary files after compression for testing.
        await Deno.remove(temp_dir, { recursive: true });

        // Telemetry to help pick better compression settings for each codec in future.
        const cbr_bitrate_error_percentage = compressed_info.video_bitrate / (required_video_bitrate * 0.01) - 100;
        const video_duration = original_info.duration_in_seconds;

        console.info(`ffmpeg info: ${ffmpeg_args}`);
        console.info(`video duration: ${video_duration.toFixed(2)}s`);
        console.info(`original file size: ${toMbString(data.byteLength / (1024 * 1024))}`);
        console.info(`original video stream: bitrate=${original_info.video_bitrate} `);
        console.info(`size=${toMbString(video_duration * original_info.video_bitrate * 8)}`);
        console.info(`original audio stream: bitrate=${original_info.audio_bitrate} `);
        console.info(`size=${toMbString(video_duration * original_info.audio_bitrate * 8)}`);
        console.info(`resulted file size: ${toMbString(compressed_video.byteLength / (1024 * 1024))}`);
        console.info(`resulted video stream: bitrate=${compressed_info.video_bitrate} `);
        console.info(`size=${toMbString(video_duration * compressed_info.video_bitrate * 8)}`);
        console.info(`resulted audio stream: bitrate=${compressed_info.audio_bitrate} `);
        console.info(`size=${toMbString(video_duration * compressed_info.audio_bitrate * 8)}`);
        console.info(`ffmpeg cbr error: ${cbr_bitrate_error_percentage.toFixed(2)}%`);
        return compressed_video;
    } finally {
        Deno.env.delete("COMPRESSING_IN_PROCESS");
    }
}

function toMbString(bytes: number): string {
    return `${(bytes / 1024 * 1024).toFixed(2)}MB`;
}

async function ffprobe(filename: string): Promise<{ duration_in_seconds: number; video_bitrate: number; audio_bitrate: number }> {
    const command = new Deno.Command("ffprobe", { args: ["-v", "quiet", "-print_format", "json", "-show_streams", `${filename}`] });
    const { code, stdout } = await command.output();
    const ffprobe_output = new TextDecoder().decode(stdout);
    if (code !== 0) {
        throw new Error("ffprobe exited with non 0 code");
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
