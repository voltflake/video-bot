import { Message } from "discordeno";
import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";

export async function convertToProperCodec(path_to_audio_file: string) {
  await new Promise<void>((resolve) => {
    execFile("ffmpeg",
      ["-i", path_to_audio_file, "-c:a", "libopus", "-vn", `${path_to_audio_file}.ogg`],
      { encoding: "utf-8", shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.error(stdout, stderr);
          throw new Error("execFile failed (ffmpeg voice message convert)");
        }
        resolve();
      }
    );
  });
  return `${path_to_audio_file}.ogg`
}

export async function getAudioData(path_to_audio_file: string) {
  await new Promise<void>((resolve) => {
    execFile("ffmpeg",
      ["-i", path_to_audio_file, "-f", "u8", "-ac", "1", "-ar", "1000", `${path_to_audio_file}.raw`],
      { encoding: "utf-8", shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.error(stdout, stderr);
          throw new Error("execFile failed (ffmpeg waveform)");
        }
        resolve();
      }
    );
  });

  const data = Array.from(await readFile(`${path_to_audio_file}.raw`));
  const duration = data.length / 1000;
  let waveform_samples = 1 + Math.floor(data.length / 100);
  if (waveform_samples > 256) waveform_samples = 256;
  // TODO handle case where (samples == 1)
  const sample_after = Math.floor(data.length / (waveform_samples - 1));
  const waveform = new Uint8Array(waveform_samples);
  for (let i = 0; i < waveform_samples; i++) {
    const element = data[i * sample_after];
    if (!element) throw new Error("bad waveform");
    waveform[i] = volume(element);
  }

  await unlink(`${path_to_audio_file}.raw`);

  return { duration: duration, waveform: waveform };
}

function volume(byte: number) {
  if (byte >= 0x80) {
    return (byte - 0x80) * 2;
  } else {
    return (0x80 - byte) * 2;
  }
}

// NOTE: temporary workaround until discordeno properly supports voice messages
export async function sendVoiceMessage(channel_id: bigint, path_to_audio_file: string, waveform: Uint8Array, duration: number) {
  const data = await readFile(path_to_audio_file)
  const form = new FormData();
  form.append("files[0]", new Blob([data], { type: "audio/ogg" }), "song.ogg");

  const payloadJson = {
    attachments: [
      {
        id: "0",
        filename: "song.ogg",
        duration_secs: duration,
        waveform: Buffer.from(waveform).toString("base64")
      },
    ],
    flags: 1 << 13, // IS_VOICE_MESSAGE
  };

  form.append("payload_json", JSON.stringify(payloadJson));

  // Send voice message
  const response = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bot ${process.env["DISCORD_TOKEN"]}`
    },
    body: form,
  });
  if (!response.ok) throw new Error("failed to send voice message");
  return await response.json() as Message;
}