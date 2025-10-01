import { type Client, MessageFlags } from "disgroove";
import type { Item, Task } from "./util.ts";
import { compressVideo } from "./video_compression.ts";

export async function sendSingleVideo(task: Task, item: Item, client: Client): Promise<void> {
    // Video is too large.
    if (item.size >= 100 * 1024 * 1024) {
        throw new Error("Video is too big to even try to compress it");
    }

    // Video is in range of 10-100 MB. Try to compress to less than 10MB.
    if (item.size > 10 * 1024 * 1024) {
        let video = await downloadVideo(item.url);
        video = await compressVideo(video);

        if (video.byteLength > 10 * 1024 * 1024) {
            throw new Error("Failed to compress video enough to fit into Discord limits");
        }

        try {
            video = new ArrayBuffer(video.byteLength);
            await client.createMessage(task.message.channelID, {
                files: [{ contents: new Blob([video], { type: "video/mp4" }), name: "video.mp4" }],
                messageReference: { messageID: task.message.id, failIfNotExists: true },
                allowedMentions: { repliedUser: false },
            });
        } catch {
            throw new Error("Failed to upload message to Discord, file upload limits probably changed.");
        }

        if (task.type !== "YouTube") {
            try {
                await client.editMessage(task.message.channelID, task.message.id, {
                    flags: MessageFlags.SuppressEmbeds,
                });
            } catch {
                console.error("Failed to remove embeds from original message");
            }
        }
    }

    // No need for compression video is less than 10MB
    const video = await downloadVideo(item.url);

    try {
        await client.createMessage(task.message.channelID, {
            files: [{ contents: new Blob([video], { type: "video/mp4" }), name: "video.mp4" }],
            messageReference: { messageID: task.message.id, failIfNotExists: true },
            allowedMentions: { repliedUser: false },
        });
    } catch {
        throw new Error("Failed to upload message to Discord, file upload limits probably changed.");
    }

    if (task.type !== "YouTube") {
        try {
            await client.editMessage(task.message.channelID, task.message.id, {
                flags: MessageFlags.SuppressEmbeds,
            });
        } catch {
            console.error("Failed to remove embeds from original message");
        }
    }
}

async function downloadVideo(url: string): Promise<ArrayBuffer> {
    return await (await fetch(url)).arrayBuffer();
}
