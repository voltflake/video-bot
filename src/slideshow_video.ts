import { readdir, unlink, writeFile } from "node:fs/promises";

import { type Item, log } from "./util.ts";

// WARNING: h264_v4l2m2m encoder on rpi4 can fail on bigger resolutions
// 756x1344 is maximum for 9:16 aspect ratio (4096 16pixel blocks) for 60fps
// or 1080p@30 max

// WARNING: libx264 doesn't encode resolutions that are not divisible by 2

export async function createSlideshowVideo(items: Item[]): Promise<Uint8Array | undefined> {
  let codec = "libx264";
  const prefered_codec = Deno.env.get("CODEC");
  if (prefered_codec) {
    codec = prefered_codec;
  }

  // download all required assets
  const timestamp = Date.now();
  const image_filenames: string[] = [];
  let image_count = 0;
  let audio_filename = "";
  for (const [index, item] of items.entries()) {
    const data = await (await fetch(item.url)).bytes();
    if (item.type === "image") {
      image_count += 1;
      // TODO: Do not assume all pictures are .png files.
      image_filenames.push(`./videos/${timestamp}-image${index}.png`);
      await writeFile(`./videos/${timestamp}-image${index}.png}`, data);
    }
    if (item.type === "audio") {
      audio_filename = `./videos/${timestamp}-audio.mp3`;
      await writeFile(audio_filename, data);
    }
  }

  // Get image resolutions.
  const image_resolutions: Array<{ width: number; height: number }> = [];
  for (const filename of image_filenames) {
    let magick_output: string;
    try {
      const command = new Deno.Command("magick", { args: ["identify", filename] });
      const { code, stdout } = await command.output();
      magick_output = new TextDecoder().decode(stdout);
      if (code !== 0) {
        log("CRITICAL", '"magick identify" exited with non 0 code.');
        return undefined;
      }
    } catch {
      log("CRITICAL", 'Spawning "magick identify" process failed.');
      return undefined;
    }

    const match = magick_output.match(/(?<width>\d+)x(?<height>\d+)/);

    if (!match) {
      log("CRITICAL", "No matches found when using regex on magick identify output.");
      return undefined;
    }
    if (!match.groups) {
      log("CRITICAL", "No groups were found in matches found when using regex on magick identify output.");
      return undefined;
    }
    image_resolutions.push({
      width: Number.parseInt(match.groups["width"]),
      height: Number.parseInt(match.groups["height"]),
    });
  }

  // calculate scaling, size and target aspect ratio
  let max_height = 0;
  let max_aspect_ratio = 3;
  for (const [index, item] of items.entries()) {
    if (item.type !== "image") {
      continue;
    }
    const resolution = image_resolutions[index];
    if (resolution.height > max_height) {
      max_height = resolution.height;
    }
    const aspect_ratio = resolution.width / resolution.height;
    if (aspect_ratio < max_aspect_ratio) {
      max_aspect_ratio = aspect_ratio;
    }
  }
  if (max_aspect_ratio < 0.5625) {
    max_aspect_ratio = 0.5625;
  }

  if (max_height > 1920) {
    max_height = 1920;
  }
  let selected_width = Math.floor(max_height * max_aspect_ratio);

  if (codec === "libx264") {
    if (selected_width % 2 === 1) {
      selected_width -= 1;
    }
    if (max_height % 2 === 1) {
      max_height -= 1;
    }
  }

  // scale each image
  const scaled_image_filenames: string[] = [];
  for (const [index, image_filename] of image_filenames.entries()) {
    const output_image_filename = `./videos/${timestamp}-image${index}-scaled.png`;
    // magick convert image1.jpg -resize "1080x1350" -background black -gravity center -extent 1080x1350 output_image2.jpg
    try {
      const command = new Deno.Command("magick", {
        args: [
          "convert",
          image_filename,
          "-resize",
          `"${selected_width}x${max_height}"`,
          "-background",
          "black",
          "-gravity",
          "center",
          "-extent",
          `${selected_width}x${max_height}`,
          output_image_filename,
        ],
      });
      const { code } = await command.output();
      if (code !== 0) {
        log("CRITICAL", '"magick convert" exited with non 0 code.');
        return undefined;
      }
    } catch {
      log("CRITICAL", 'Spawning "magick convert" process failed.');
      return undefined;
    }
    scaled_image_filenames.push(output_image_filename);
  }

  // generate looped slideshow for future final video

  // both sould be divisible by 0.1
  const transition_duration = 0.5;
  const slide_duration = 2.5;

  const loop_duration = Math.ceil((slide_duration + transition_duration) * image_count * 60);
  if (image_count === 1) {
    try {
      const ffmpeg_args = `-loop 1 -framerate 60 -i ${scaled_image_filenames[0]} -c:v ${codec} -pix_fmt yuv420p -r 60 -frames ${loop_duration} videos/${timestamp}-slideshow_loop.mp4`;
      const command = new Deno.Command("ffmpeg", {
        args: ffmpeg_args.split(" "),
      });
      const { code } = await command.output();
      if (code !== 0) {
        log("CRITICAL", "ffmpeg exited with non 0 code. (ffmpeg 1 image slideshow loop generation)");
        return undefined;
      }
    } catch {
      log("CRITICAL", "Spawning ffmpeg process failed. (ffmpeg 1 image slideshow loop generation)");
      return undefined;
    }
  } else {
    let ffmpeg_command = "ffmpeg";
    for (let i = 0; i < image_count; i++) {
      ffmpeg_command = ffmpeg_command.concat(` -loop 1 -framerate 60 -i ${scaled_image_filenames[i]}`);
    }
    ffmpeg_command = ffmpeg_command.concat(` -filter_complex "`);

    let current_filter_result = 0;
    let current_second_input = 1;
    ffmpeg_command = ffmpeg_command.concat(`[0][1]xfade=transition=slideleft:duration=${transition_duration.toFixed(1)}:offset=${slide_duration.toFixed(1)}[m0];`);
    for (let i = 2; i < image_count + 1; i++) {
      const first_input = current_filter_result;
      const second_input = current_second_input + 1 < image_count ? current_second_input + 1 : 0;
      const output = current_filter_result + 1;
      ffmpeg_command = ffmpeg_command.concat(
        `[m${first_input}][${second_input}]xfade=transition=slideleft:duration=${transition_duration.toFixed(1)}:offset=${
          ((slide_duration + transition_duration) * i - transition_duration).toFixed(1)
        }[m${output}];`,
      );
      current_filter_result += 1;
      current_second_input = second_input;
    }
    ffmpeg_command = ffmpeg_command.slice(0, -1);
    ffmpeg_command = ffmpeg_command.concat(`" -map "[m${current_filter_result}]" -c:v ${codec} -pix_fmt yuv420p -r 60 -frames ${loop_duration} videos/${timestamp}-slideshow_loop.mp4`);

    try {
      const command = new Deno.Command("ffmpeg", {
        args: ffmpeg_command.split(" ").slice(1),
      });
      const { code } = await command.output();
      if (code !== 0) {
        log("CRITICAL", "ffmpeg exited with non 0 code. (ffmpeg 2 or more images slideshow loop generation)");
        return undefined;
      }
    } catch {
      log("CRITICAL", "Spawning ffmpeg process failed. (ffmpeg 2 or more images slideshow loop generation)");
      return undefined;
    }
  }

  // create final video with music
  const ffmpeg_command2 =
    `ffmpeg -hide_banner -stream_loop -1 -i videos/${timestamp}-slideshow_loop.mp4 -i ${audio_filename} -shortest -c:v copy -c:a aac -pix_fmt yuv420p -movflags +faststart videos/${timestamp}-output-swipe.mp4`;

  try {
    const command = new Deno.Command("ffmpeg", {
      args: ffmpeg_command2.split(" ").slice(1),
    });
    const { code } = await command.output();
    if (code !== 0) {
      log("CRITICAL", "ffmpeg exited with non 0 code. (ffmpeg final slideshow generation)");
      return undefined;
    }
  } catch {
    log("CRITICAL", "Spawning ffmpeg process failed. (ffmpeg final slideshow generation)");
    return undefined;
  }

  const result = await Deno.readFile(`./videos/${timestamp}-output-swipe.mp4`);

  // cleanup temp files
  const files = await readdir("./videos");
  for (const file of files) {
    if (`./videos/${file}`.startsWith(`./videos/${timestamp}`)) {
      await unlink(`./videos/${file}`);
    }
  }

  return result;
}
