import { AttachmentPayload } from "discord.js";
import util from 'node:util';
import { exec } from 'node:child_process';

import { Job } from "./types.js";
import { compressVideo } from "./video_compression.js";

export async function processSingleVideo(url: string, size: number, job: Job) {

    if (job.mode == "Low-Traffic") {
        if (size <= 50 * 1024 * 1024) {
            await reply(url)
            return
        }
        throw new Error("");
    }

    if (job.mode == "Compromise") {

        if (size >= 100 * 1024 * 1024) {
            throw new Error("");
        }

        const video = await downloadVideo(url)
        if (size <= 25 * 1024 * 1024) {
            await reply("", [{ attachment: Buffer.from(video), name: `video.mp4` }])
            return
        }

        const compressed_video = await compressVideo(video);
        if (compressed_video.byteLength <= 25 * 1024 * 1024) {
            await reply("", [{ attachment: compressed_video, name: `compressed_video.mp4` }])
            return
        }

        if (size <= 50 * 1024 * 1024) {
            await reply(url)
            return
        }

        throw new Error("");
    }

    if (job.mode == "Beautiful") {

        if (size >= 100 * 1024 * 1024) {
            throw new Error("");
        }

        const video = await downloadVideo(url)
        if (size <= 25 * 1024 * 1024) {
            await reply("", [{ attachment: Buffer.from(video), name: `video.mp4` }])
            return
        }

        const compressed_video = await compressVideo(video);
        if (compressed_video.byteLength <= 25 * 1024 * 1024) {
            await reply("", [{ attachment: compressed_video, name: `compressed_video.mp4` }])
            return
        }

        throw new Error("");
    }

    console.log("processSingleVideo() recieved unknown job mode. this is a bug.")
    throw new Error("");

    async function reply(text: string, attachment?: AttachmentPayload[]) {
        await job.discord_message.reply({
            content: text,
            files: attachment,
            allowedMentions: { repliedUser: false }
        });
    }

    async function downloadVideo(url: string) {
        const response = await fetch(url);
        return await response.arrayBuffer();
    }
}

const promisified_exec = util.promisify(exec);
export async function easySpawn(command: string) {
    const { stdout, stderr } = await promisified_exec(command);
    return { stdout: stdout, stderr: stderr};
}

export async function validateAndGetContentLength(url: string): Promise<number> {
    let response;
    try {
        response = await fetch(url, { method: "HEAD" });
    } catch (error) {
        throw new Error(`HEAD request failed`);
    }
    if (response.status !== 200)
        throw new Error(`extracted video url is broken ->\n${response.status} ${response.statusText}`);
    const content_length = response.headers.get("content-length");
    if (content_length == undefined) throw new Error("content-length header is missing");
    return parseInt(content_length);
}