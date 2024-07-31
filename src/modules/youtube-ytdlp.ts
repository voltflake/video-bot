import { validateAndGetContentLength } from "../helper_functions.js";
import type { Item } from "../types.js";
import { execFile } from 'node:child_process';

export async function ytdlp(youtubeUrl: string) {
  const program_output: string = await new Promise((resolve) => {
    execFile("yt-dlp", ["-f", "mp4", "--print", "urls", `${youtubeUrl}`],
      { encoding: "utf-8" },
      (error, stdout) => {
        if (error == null) resolve(stdout);
        else throw new Error("execFile failed");
      });
  });

  const links = program_output.split("\n");

  if (links[0] == null) {
    throw new Error("unexpected output from child process.");
  }

  const videoSize = await validateAndGetContentLength(links[0]);
  const result: Item[] = [{ url: links[0], size: videoSize, type: "Video" }];
  return result;
}
