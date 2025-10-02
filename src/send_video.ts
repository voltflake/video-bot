import { type Client, MessageFlags, type Message } from "disgroove";
import type { Content } from "./util.ts";
import { compressVideo } from "./video_compression.ts";

export async function sendSingleVideo(content: Content, client: Client, message: Message): Promise<void> {
    if(!content.items[0]) return;
    const video_path = content.items[0].filepath;
    let video_file = Bun.file(video_path);
    const video_size = video_file.size;

    // Video is too large
    if (video_size >= 50 * 1024 * 1024) {
        await client.editMessage(message.channelID, message.id, {
            content: `❌ Video is too large to be sent to Discord (~${video_size/1_000_000}MB).`,
            allowedMentions: { repliedUser: false },
        });
        return;
    }

    // Video is in compressable size range. Try to compress
    if (video_size > 10 * 1024 * 1024) {
        const compressed_video = await compressVideo(video_path);
        const compressed_video_file = Bun.file(compressed_video);

        if (compressed_video_file.size > 10 * 1024 * 1024) {
            await client.editMessage(message.channelID, message.id, {
                content: `❌ Video is too large to be sent to Discord even after compression (~${compressed_video_file.size/1_000_000}MB).`,
                allowedMentions: { repliedUser: false },
            });
            return;
        }

        await client.editMessage(message.channelID, message.id, {
            files: [{ contents: new Blob([compressed_video], { type: "video/mp4" }), name: "video.mp4" }],
            allowedMentions: { repliedUser: false },
        });

        await client.editMessage(message.channelID, message.referencedMessage?.id || "", {
            flags: MessageFlags.SuppressEmbeds,
        });
        return;
    }

    // No need for compression - just send the video
    // Check if codec is okay for Discord
    const codec = await getVideoCodec(video_path);
    if (codec !== "h264") {
        // Re-encode to h264
        const reencoded_video = await reencodeToH264(video_path);
        video_file = Bun.file(reencoded_video);
    }
    const video = await video_file.arrayBuffer();

    await client.editMessage(message.channelID, message.id, {
        content: "",
        files: [{ contents: new Blob([video], { type: "video/mp4" }), name: "video.mp4" }],
        allowedMentions: { repliedUser: false },
    });

    await client.editMessage(message.channelID, message.referencedMessage?.id || "", {
        flags: MessageFlags.SuppressEmbeds,
    });
    return;
}

// reencode to h264
async function reencodeToH264(input_file: string): Promise<string> {
    await runCommand(["ffmpeg", "-i", input_file, "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "-b:a", "96k", `${input_file}_reencoded.mp4`]);
    return `${input_file}_reencoded.mp4`;
}

// ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 video.mkv
async function getVideoCodec(filename: string): Promise<string> {
    const { code, stdout, stderr } = await runCommand(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1", `${filename}`]);
    if (code !== 0) {
        console.error("ffprobe stderr -->");
        console.error(stderr);
        throw new Error("ffprobe exited with non 0 code");
    }
    return stdout.trim();
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
