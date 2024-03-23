import { writeFile, readFile, unlink, mkdir, access, constants } from "node:fs/promises";
import { easySpawn } from "./helper_functions.js";

// rpi can't hv-encode videos with bitrate less than 150kb/s
// change codec to "h264_omx" in settings.json if you want to use Raspberry Pi hardware encoding
export async function compressVideo(data: ArrayBuffer) {
    const { codec } = JSON.parse((await readFile("./settings.json")).toString());

    try {
        await access("./logs");
    } catch {
        await mkdir("./logs");
    }

    try {
        await access("./videos");
    } catch {
        await mkdir("./videos");
    }

    // locking mechanism to allow only one compression job at a time
    const filename_lock = "./videos/compressing.lock";
    while (true) {
        try {
            await access(filename_lock, constants.F_OK);
            sleep(100);
        } catch {
            break;
        }
    }
    await writeFile(filename_lock, "");

    const timestamp = Date.now();
    const filename = `./videos/${timestamp}.mp4`;
    const filename_compressed = `./videos/${timestamp}_compressed.mp4`;
    const filename_log = `./logs/${timestamp}.txt`;

    await writeFile(filename, new Uint8Array(data));
    const original_info = await ffprobe(filename);

    // 4% reserved for muxing overhead
    const available_bits_per_second = (25 * 1024 * 1024 * 8 * 0.96) / original_info.duration_in_seconds;

    // 0.80 is additional space if some video gets over +10% bitrate it was given
    const required_video_bitrate = Math.floor((available_bits_per_second - original_info.audio_bitrate) * 0.9);

    const ffmpeg_cmd = `ffmpeg -i ${filename} -y -c:a copy -b:v ${required_video_bitrate.toString()} -c:v ${codec} ${filename_compressed}`;
    await easySpawn(ffmpeg_cmd);

    const compressed_video = await readFile(filename_compressed);
    const compressed_info = await ffprobe(filename_compressed);

    // Uncomment this section to remove temporary files after compression.
    // Commented out for debuging purposes.
    // await unlink(filename);
    // await unlink(filename_compressed);

    // some telemetry to help pick better compression settings for each codec in future
    const cbr_bitrate_error_percentage = compressed_info.video_bitrate / (required_video_bitrate * 0.01) - 100;
    const bits_in_1MB = 8 * 1024 * 1024;
    const video_duration = original_info.duration_in_seconds;
    function calcSize(bitrate: number) {
        return (bitrate * video_duration) / bits_in_1MB;
    }
    const log = [];
    log.push(`ffmpeg cmd: ${ffmpeg_cmd}\n`);
    log.push(`video duration: ${video_duration.toFixed(2)}s\n`);
    log.push(`original file size: ${(data.byteLength / (1024 * 1024)).toFixed(2)}MB\n`);
    log.push(`original video stream: bitrate=${original_info.video_bitrate} `);
    log.push(`size=${calcSize(original_info.video_bitrate).toFixed(2)}MB\n`);
    log.push(`original audio stream: bitrate=${original_info.audio_bitrate} `);
    log.push(`size=${calcSize(original_info.audio_bitrate).toFixed(2)}MB\n`);
    log.push(`resulted file size: ${(compressed_video.byteLength / (1024 * 1024)).toFixed(2)}MB\n`);
    log.push(`resulted video stream: bitrate=${compressed_info.video_bitrate} `);
    log.push(`size=${calcSize(compressed_info.video_bitrate).toFixed(2)}MB\n`);
    log.push(`resulted audio stream: bitrate=${compressed_info.audio_bitrate} `);
    log.push(`size=${calcSize(compressed_info.audio_bitrate).toFixed(2)}MB\n`);
    log.push(`ffmpeg cbr error: ${cbr_bitrate_error_percentage.toFixed(2)}%\n\n`);
    await writeFile(filename_log, log.join(""));

    await unlink(filename_lock);
    return compressed_video;
}

async function ffprobe(filename: string) {
    const ffprobe = await easySpawn(`ffprobe -v quiet -print_format json -show_streams ${filename}`);
    const data = JSON.parse(ffprobe.stdout);
    const duration_in_seconds = Number.parseFloat(data.streams[0].duration);
    const video_bitrate = Number.parseInt(data.streams[0].bit_rate);
    const audio_bitrate = Number.parseInt(data.streams[1].bit_rate);
    return {
        duration_in_seconds: duration_in_seconds,
        video_bitrate: video_bitrate,
        audio_bitrate: audio_bitrate
    };
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
