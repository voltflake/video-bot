import { validateAndGetContentLength, type Item } from "./util.js";
import { execFile } from 'node:child_process';

export async function extractYoutubeContent(url: string) {
  return ytdlp(url);
}

async function ytdlp(url: string) {
  for (let i = 3; i > 0; i--) {
    const program_output: string = await new Promise((resolve) => {
      execFile("yt-dlp", ["-f", "mp4", "--print", "urls", `${url}`],
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
    let videoSize: number;
    try {
      videoSize = await validateAndGetContentLength(links[0]);
    } catch (error) {
      if (i === 1) {
        throw new Error("yt-dlp provided bad URLs multiple times.");
      }
      continue;
    }
    const result: Item[] = [{ url: links[0], size: videoSize, type: "Video" }];
    return result;
  }
  throw new Error("unreachable");
}
