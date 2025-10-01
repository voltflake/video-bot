import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function compressVideo(data: ArrayBuffer): Promise<ArrayBuffer> {
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

        const temp_dir = await mkdtemp(join(tmpdir(), "video-bot-"));
        const filename_original = join(temp_dir, "video.mp4");
        const filename_compressed = join(temp_dir, "video_compressed.mp4");

        await writeFile(filename_original, new Uint8Array(data));
        const original_info = await ffprobe(filename_original);

        // 4% of file size is reserved for muxing overhead
        const available_bits_per_second = (10 * 1024 * 1024 * 8 * 0.96) / original_info.duration_in_seconds;

        // Leave 10% of maximum video stream size just to be sure codec won't exceed hard size limit
        // Note that Raspberry Pi with h264_omx codec can't hv-encode videos with bitrate less than 150kb/s
        const required_video_bitrate = Math.floor((available_bits_per_second - original_info.audio_bitrate) * 0.9);

        const ffmpeg_args = ["-i", `${filename_original}`, "-y", "-c:a", "copy", "-b:v", `${required_video_bitrate.toString()}`];

        ffmpeg_args.push("-c:v");
        const prefered_codec = process.env["CODEC"];
        ffmpeg_args.push(prefered_codec ? prefered_codec : "libx264");

        ffmpeg_args.push(filename_compressed);

        const { code, stderr } = await runCommand(["ffmpeg", ...ffmpeg_args]);
        if (code !== 0) {
            console.error("ffmpeg compression stderr -->");
            console.error(stderr);
            throw new Error(`ffmpeg failed when compressing video. Non 0 exit code. filename: ${filename_original} Args: ${ffmpeg_args.join(" ")}`);
        }

        const compressed_info = await ffprobe(filename_compressed);
    const compressed_video_temp = await readFile(filename_compressed);
    const compressed_video = new Uint8Array(compressed_video_temp);


        // Comment this section to keep temporary files after compression for testing
        await rm(temp_dir, { recursive: true, force: true });

        // Telemetry to help pick better compression settings for each codec in future
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
    return compressed_video.buffer;
    } finally {
        delete process.env["COMPRESSING_IN_PROCESS"];
    }
}

function toMbString(bytes: number): string {
    return `${(bytes / 1024 * 1024).toFixed(2)}MB`;
}

async function ffprobe(filename: string): Promise<{ duration_in_seconds: number; video_bitrate: number; audio_bitrate: number }> {
    const { code, stdout, stderr } = await runCommand(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", `${filename}`]);
    if (code !== 0) {
        console.error("ffprobe stderr -->");
        console.error(stderr);
        throw new Error("ffprobe exited with non 0 code");
    }
    const data = JSON.parse(stdout);
    const video_stream = data.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
    const video_bitrate = Number.parseInt(video_stream.bit_rate);
    const audio_stream = data.streams.find((stream: { codec_type: string }) => stream.codec_type === "audio");
    const audio_bitrate = Number.parseInt(audio_stream.bit_rate);
    const duration_in_seconds = Number.parseFloat(video_stream.duration);
    return {
        duration_in_seconds: duration_in_seconds,
        video_bitrate: video_bitrate,
        audio_bitrate: audio_bitrate,
    };
}

async function runCommand(cmd: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    if (cmd.length === 0) {
        throw new Error("runCommand requires at least one argument");
    }
    const binary = cmd[0];
    if (!binary) {
        throw new Error("runCommand requires a binary name");
    }
    const args = cmd.slice(1);
    const process = Bun.spawn({ cmd: [binary, ...args], stdout: "pipe", stderr: "pipe" });
    const [code, stdout, stderr] = await Promise.all([
        process.exited,
        process.stdout ? new Response(process.stdout).text() : "",
        process.stderr ? new Response(process.stderr).text() : "",
    ]);
    return { code, stdout, stderr };
}
