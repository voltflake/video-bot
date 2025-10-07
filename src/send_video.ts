import { type Client, MessageFlags, type Message } from "disgroove";
import { runCommand, toMbString, type Content } from "./util.ts";
import { compressVideo } from "./video_compression.ts";
import { readFile, stat } from "node:fs/promises";

export async function sendSingleVideo(content: Content, client: Client, message: Message): Promise<void> {
    if (!content.items[0]) return;
    const video_path = content.items[0].filepath;
    let video_file = await stat(video_path);
    const video_size = video_file.size;

    // Video is too large
    if (video_size >= 30 * 1024 * 1024) {
        await client.editMessage(message.channelId, message.id, {
            content: `❌ Video is too large to be sent to Discord. (${video_size / 1_000_000}MB)`,
            allowedMentions: { repliedUser: false },
        });
        return;
    }

    // Video is in compressable size range. Try to compress
    if (video_size > 10 * 1024 * 1024) {
        const status_update = client.editMessage(message.channelId, message.id, {
            content: `Compressing video to fit Discord limits... (${toMbString(video_size)})`,
            allowedMentions: { repliedUser: false },
        });

        try {
            const compressed_video = await compressVideo(video_path);
            await status_update;
            const compressed_video_file = await readFile(compressed_video);

            if (compressed_video_file.byteLength > 10 * 1024 * 1024) {
                await client.editMessage(message.channelId, message.id, {
                    content: `❌ Video is too large to be sent to Discord even after compression. (${toMbString(compressed_video_file.byteLength)})`,
                    allowedMentions: { repliedUser: false },
                });
                return;
            }

            await client.editMessage(message.channelId, message.id, {
                content: "",
                files: [{ contents: new Blob([new Uint8Array(compressed_video_file)], { type: "video/mp4" }), name: "video.mp4" }],
                allowedMentions: { repliedUser: false },
            });

            await client.editMessage(message.channelId, message.referencedMessage?.id || "", {
                flags: MessageFlags.SuppressEmbeds,
            });
            return;
        } catch {
            await client.editMessage(message.channelId, message.id, {
                content: "❌ Error occured during compression. Unable to send video.",
                allowedMentions: { repliedUser: false },
            });
            return;
        }
    }

    // No need for compression - just send the video
    // Check if codec is okay for Discord
    let video: Buffer;
    try {
        const codec = await getVideoCodec(video_path);
        if (codec !== "h264") {
            // Re-encode to h264
            try {
                await client.editMessage(message.channelId, message.id, {
                    content: "Re-encoding video so it will be playable on all discord clients...",
                    allowedMentions: { repliedUser: false },
                });
                const reencoded_video = await reencodeToH264(video_path);
                video = await readFile(reencoded_video);
            } catch (error) {
                await client.editMessage(message.channelId, message.id, {
                    content: "❌ Error occured when reencoding video to proper format.",
                    allowedMentions: { repliedUser: false },
                });
                return;
            }
        } else {
            video = await readFile(video_path);
        }
    } catch (error) {
        await client.editMessage(message.channelId, message.id, {
            content: "❌ Error occured when validating video format before sending it to Discord.",
            allowedMentions: { repliedUser: false },
        });
        return;
    }

    await client.editMessage(message.channelId, message.id, {
        content: "",
        files: [{ contents: new Blob([new Uint8Array(video)], { type: "video/mp4" }), name: "video.mp4" }],
        allowedMentions: { repliedUser: false },
    });

    try {
        await client.editMessage(message.channelId, message.referencedMessage?.id || "", {
            flags: MessageFlags.SuppressEmbeds,
        });
    } catch {}
}

// reencode to h264
async function reencodeToH264(input_file: string): Promise<string> {
    await runCommand(["ffmpeg", "-y", "-i", input_file, "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "-b:a", "96k", `${input_file}_reencoded.mp4`]);
    return `${input_file}_reencoded.mp4`;
}

// ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 video.mkv
async function getVideoCodec(filename: string): Promise<string> {
    const { stdout } = await runCommand(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1", `${filename}`]);
    return stdout.trim();
}
