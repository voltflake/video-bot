import { type Bot, MessageFlags } from "discordeno";
import type { Item, Task } from "./util.ts";
import { compressVideo } from "./video_compression.ts";

export async function sendSingleVideo(task: Task, item: Item, bot: Bot): Promise<void> {
    // Video is too large.
    if (item.size >= 100 * 1024 * 1024) {
        throw new Error("Video is too big to even try to compress it");
    }

    // Video is in range of 25-100 MB. Try to compress to less than 25MB.
    if (item.size > 25 * 1024 * 1024) {
        let video = await downloadVideo(item.url);
        video = await compressVideo(video);

        if (video.byteLength > 25 * 1_000_000) {
            throw new Error("Failed to compress video enough to fit into Discord limits");
        }

        try {
            await bot.helpers.sendMessage(task.message.channelId, {
                files: [{ blob: new Blob([video]), name: "video.mp4" }],
                messageReference: { messageId: task.message.id, failIfNotExists: true },
                allowedMentions: { repliedUser: false },
            });
        } catch {
            throw new Error("Failed to upload message to Discord, file upload limits probably changed.");
        }

        if (task.type !== "YouTube") {
            try {
                await bot.helpers.editMessage(task.message.channelId, task.message.id, {
                    flags: MessageFlags.SuppressEmbeds,
                });
            } catch {
                console.error("Failed to remove embeds from original message");
            }
        }
    }

    // No need for compression video is less than 25MB
    const video = await downloadVideo(item.url);

    try {
        await bot.helpers.sendMessage(task.message.channelId, {
            files: [{ blob: new Blob([video]), name: "video.mp4" }],
            messageReference: { messageId: task.message.id, failIfNotExists: true },
            allowedMentions: { repliedUser: false },
        });
    } catch {
        throw new Error("Failed to upload message to Discord, file upload limits probably changed.");
    }

    if (task.type !== "YouTube") {
        try {
            await bot.helpers.editMessage(task.message.channelId, task.message.id, {
                flags: MessageFlags.SuppressEmbeds,
            });
        } catch {
            console.error("Failed to remove embeds from original message");
        }
    }
}

async function downloadVideo(url: string): Promise<Uint8Array> {
    return await (await fetch(url)).bytes();
}
