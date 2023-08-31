import { writeFile, readFile, unlink, mkdir, access} from "node:fs/promises";
import { easySpawn } from "./helper_functions.js";

// rpi can't hv-encode videos with bitrate less than 150kb/s
// change codec to "h264_omx" in settings.json if you want to use Raspberry Pi hardware encoding
export async function compressVideo(data: ArrayBuffer) {
    const { codec } = JSON.parse((await readFile("./settings.json")).toString());
    try {
        await access("./logs");
    } catch (error) {
        await mkdir("./logs");
    }
    const timestamp = Date.now();
    const filename = `./logs/${timestamp}.mp4`;
    const filename_compressed = `./logs/${timestamp}_compressed.mp4`;
    const filename_log = `./logs/${timestamp}.txt`;
    await writeFile(filename, new Uint8Array(data));
    const original_info = await ffprobe(filename);

    // 4% reserved for muxing overhead
    const available_bits_per_second = (25 * 1024 * 1024 * 8 * 0.96) / original_info.duration_in_seconds;

    // 0.80 is additional space if some video gets over +20% bitrate it was given
    const required_video_bitrate = Math.floor((available_bits_per_second - original_info.audio_bitrate) * 0.80);

    const ffmpeg_cmd = `ffmpeg -i ${filename} -y -c:a copy -b:v ${required_video_bitrate.toString()} -c:v ${codec} ${filename_compressed}`;
    await easySpawn(ffmpeg_cmd);

    const compressed_video = await readFile(filename_compressed);
    const compressed_info = await ffprobe(filename_compressed);

    // uncomment this to delete intermidiate files files
    // await unlink(filename);
    // await unlink(filename_compressed);

    // some telemetry to help pick better compression settings for each codec in future
    const cbr_bitrate_error_percentage = compressed_info.video_bitrate/(required_video_bitrate*0.01) - 100;
    const log_entry = `ffmpeg cmd: ${ffmpeg_cmd}\n` +
        `video duration: ${original_info.duration_in_seconds.toFixed(2)}s\n` +
        `original file size: ${(data.byteLength / (1024 * 1024)).toFixed(2)}MB\n` +
        `original video stream: bitrate=${original_info.video_bitrate} ` +
        `size=${(original_info.video_bitrate * original_info.duration_in_seconds / (8 * 1024 * 1024)).toFixed(2)}MB\n` +
        `original audio stream: bitrate=${original_info.audio_bitrate} ` +
        `size=${(original_info.audio_bitrate * original_info.duration_in_seconds / (8 * 1024 * 1024)).toFixed(2)}MB\n` +
        `resulted file size: ${(compressed_video.byteLength / (1024 * 1024)).toFixed(2)}MB\n` +
        `resulted video stream: bitrate=${compressed_info.video_bitrate} ` +
        `size=${(compressed_info.video_bitrate * compressed_info.duration_in_seconds / (8 * 1024 * 1024)).toFixed(2)}MB\n` +
        `resulted audio stream: bitrate=${compressed_info.audio_bitrate} ` +
        `size=${(compressed_info.audio_bitrate * compressed_info.duration_in_seconds / (8 * 1024 * 1024)).toFixed(2)}MB\n` +
        `ffmpeg cbr error: ${cbr_bitrate_error_percentage > 0 ? "+" : "-"}` +
        `${Math.abs(cbr_bitrate_error_percentage).toFixed(3)}%\n\n`;

    await writeFile(filename_log, log_entry);
    return compressed_video;
}

async function ffprobe(filename: string) {
    const ffprobe = await easySpawn(`ffprobe -v quiet -print_format json -show_streams ${filename}`);
    const data = JSON.parse(ffprobe.stdout);
    const duration_in_seconds = parseFloat(data.streams[0].duration);
    const video_bitrate = parseInt(data.streams[0].bit_rate);
    const audio_bitrate = parseInt(data.streams[1].bit_rate);
    return {
        duration_in_seconds: duration_in_seconds,
        video_bitrate: video_bitrate,
        audio_bitrate: audio_bitrate
    }
}