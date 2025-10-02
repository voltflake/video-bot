import { type Client, MessageFlags, type Message } from "disgroove";
import type { Content } from "./util.ts";
import { compressVideo } from "./video_compression.ts";

export async function sendSingleVideo(content: Content, client: Client, message: Message): Promise<void> {
    if(!content.items[0]) return;
    const video_path = content.items[0].filepath;
    const video_file = Bun.file(video_path);
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
    const video = await video_file.arrayBuffer();

    await client.editMessage(message.channelID, message.id, {
        files: [{ contents: new Blob([video], { type: "video/mp4" }), name: "video.mp4" }],
        allowedMentions: { repliedUser: false },
    });

    await client.editMessage(message.channelID, message.referencedMessage?.id || "", {
        flags: MessageFlags.SuppressEmbeds,
    });
    return;
}