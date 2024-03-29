import type { AttachmentPayload, Message } from "discord.js";
import { type Job, Mode } from "./types.js";
import { compressVideo } from "./video_compression.js";

export async function processSingleVideo(url: string, size: number, job: Job) {
    switch (job.mode) {
        case Mode.low_traffic: {
            handleLowTrafficMode(job, url, size);
            break;
        }
        case Mode.compromise: {
            handleCompromiseMode(job, url, size);
            break;
        }
        case Mode.beautiful: {
            handleBeautifulMode(job, url, size);
            break;
        }
        default: {
            throw new Error("");
        }
    }
}

async function handleLowTrafficMode(job: Job, url: string, size: number) {
    if (size <= 50 * 1024 * 1024) {
        await reply(job.discord_message, url);
        return;
    }
    throw new Error("");
}

async function handleCompromiseMode(job: Job, url: string, size: number) {
    if (size >= 100 * 1024 * 1024) {
        throw new Error("");
    }

    const video = await downloadVideo(url);
    if (size <= 25 * 1024 * 1024) {
        await reply(job.discord_message, "", [{ attachment: Buffer.from(video), name: "video.mp4" }]);
        return;
    }

    const compressed_video = await compressVideo(video);
    if (compressed_video.byteLength <= 25 * 1024 * 1024) {
        await reply(job.discord_message, "", [{ attachment: compressed_video, name: "compressed_video.mp4" }]);
        return;
    }

    if (size <= 50 * 1024 * 1024) {
        await reply(job.discord_message, url);
        return;
    }

    throw new Error("");
}

async function handleBeautifulMode(job: Job, url: string, size: number) {
    if (size >= 100 * 1024 * 1024) {
        throw new Error("");
    }

    const video = await downloadVideo(url);
    if (size <= 25 * 1024 * 1024) {
        await reply(job.discord_message, "", [{ attachment: Buffer.from(video), name: "video.mp4" }]);
        return;
    }

    const compressed_video = await compressVideo(video);
    if (compressed_video.byteLength <= 25 * 1024 * 1024) {
        await reply(job.discord_message, "", [{ attachment: compressed_video, name: "compressed_video.mp4" }]);
        return;
    }

    throw new Error("");
}

async function reply(message: Message, text: string, attachment?: AttachmentPayload[]) {
    await message.reply({
        content: text,
        files: attachment,
        allowedMentions: { repliedUser: false }
    });
}

async function downloadVideo(url: string) {
    const response = await fetch(url);
    return await response.arrayBuffer();
}
