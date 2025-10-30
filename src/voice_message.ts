import type { Message } from "disgroove";
import { parse, join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { runCommand } from "./util.js";

export async function convertToProperCodec(path_to_audio_file: string): Promise<string> {
    const path_info = parse(path_to_audio_file);
    const output_filename = join(path_info.dir, `${path_info.name}.ogg`);
    await runCommand(["ffmpeg", "-y", "-i", path_to_audio_file, "-c:a", "libopus", "-vn", output_filename]);
    return output_filename;
}

export async function getAudioData(path_to_audio_file: string): Promise<{ duration: number; waveform: Uint8Array }> {
    const path_info = parse(path_to_audio_file);
    const output_filename = join(path_info.dir, `${path_info.name}.raw`);
    await runCommand(["ffmpeg", "-y", "-i", path_to_audio_file, "-f", "u8", "-ac", "1", "-ar", "1000", output_filename]);

    const rawBuffer = await readFile(output_filename);
    const data = Array.from(rawBuffer);
    const duration = data.length / 1000;
    let waveform_samples = 1 + Math.floor(data.length / 100);
    if (waveform_samples > 256) {
        waveform_samples = 256;
    }

    // TODO handle case where (samples == 1)
    const sample_length = Math.floor(data.length / (waveform_samples - 1));
    const waveform = new Uint8Array(waveform_samples);
    for (let i = 0; i < waveform_samples; i++) {
        const element = data[i * sample_length];
        if (!element) {
            throw new Error("Error when parsing raw waveform");
        }
        waveform[i] = volume(element);
    }

    try {
        await rm(output_filename, { force: true });
    } catch {
        console.error("Failed to remove temporary raw audio file");
    }

    return { duration: duration, waveform: waveform };
}

function volume(byte: number): number {
    if (byte >= 0x80) {
        return (byte - 0x80) * 2;
    }
    return (0x80 - byte) * 2;
}

// NOTE: temporary workaround until discordeno properly supports voice messages
export async function sendVoiceMessage(channel_id: string | bigint, path_to_audio_file: string, waveform: Uint8Array, duration: number): Promise<Message> {
    const fileData = await readFile(path_to_audio_file);
    const arrayBuffer = toArrayBuffer(new Uint8Array(fileData));
    const form = new FormData();
    form.append("files[0]", new Blob([arrayBuffer], { type: "audio/ogg" }), "song.ogg");

    const payloadJson = {
        attachments: [
            {
                id: "0",
                filename: "song.ogg",
                duration_secs: duration,
                waveform: encodeBase64(waveform),
            },
        ],
        flags: 1 << 13, // IS_VOICE_MESSAGE
    };

    form.append("payload_json", JSON.stringify(payloadJson));

    const bot_key = process.env["DISCORD_TOKEN"];
    if (!bot_key) {
        throw new Error("DISCORD_TOKEN is not in enviroment");
    }

    // Send voice message
    const response = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bot ${bot_key}`,
        },
        body: form,
    });

    if (!response.ok) {
        throw new Error("Failed to send voice message to discord");
    }
    
    const message: Message = await response.json();
    return message;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    if (bytes.buffer instanceof ArrayBuffer) {
        if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
            return bytes.buffer;
        }
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    return bytes.slice().buffer;
}

function encodeBase64(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64");
}
