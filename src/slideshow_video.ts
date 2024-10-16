import type { Item } from "./util.ts";
import { join } from "path";

// WARNING: h264_v4l2m2m encoder on rpi4 can fail on bigger resolutions
// 756x1344 is maximum for 9:16 aspect ratio (4096 16pixel blocks) for 60fps
// or 1080p@30 max

// WARNING: libx264 doesn't encode resolutions that are not divisible by 2

export async function createSlideshowVideo(items: Item[]): Promise<Uint8Array> {
    let codec = "libx264";
    const prefered_codec = Deno.env.get("CODEC");
    if (prefered_codec) {
        codec = prefered_codec;
    }

    const temp_dir = await Deno.makeTempDir();

    // download all required assets
    let image_count = 0;
    const audio_filename = join(temp_dir, "audio.mp3");
    for (const [index, item] of items.entries()) {
        const data = await (await fetch(item.url)).bytes();
        if (item.type === "image") {
            image_count += 1;
            // TODO: Do not assume all pictures are .png files.
            await Deno.writeFile(join(temp_dir, `image${index}.png`), data);
        }
        if (item.type === "audio") {
            await Deno.writeFile(audio_filename, data);
        }
    }

    // Get image resolutions.
    const image_resolutions: { width: number; height: number }[] = [];
    for (let i = 0; i < image_count; i++) {
        const command = new Deno.Command("magick", { args: ["identify", join(temp_dir, `image${i + 1}.png`)] });
        const { code, stdout } = await command.output();
        const magick_output = new TextDecoder().decode(stdout);
        if (code !== 0) {
            throw new Error("magick identify exited with non 0 code");
        }

        const match = magick_output.match(/(?<width>\d+)x(?<height>\d+)/);

        if (!match) {
            throw new Error("No matches found when using regex on magick identify output");
        }
        if (!match.groups) {
            throw new Error("No groups were found in matches found when using regex on magick identify output");
        }
        image_resolutions.push({
            width: Number.parseInt(match.groups["width"]),
            height: Number.parseInt(match.groups["height"]),
        });
    }

    // calculate scaling, size and target aspect ratio
    let max_height = 0;
    let max_aspect_ratio = 3;
    for (const resolution of image_resolutions) {
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
    for (let i = 0; i < image_count; i++) {
        const command = new Deno.Command("magick", {
            args: [
                "convert",
                join(temp_dir, `image${i + 1}.png`),
                "-resize",
                `${selected_width}x${max_height}`,
                "-background",
                "black",
                "-gravity",
                "center",
                "-extent",
                `${selected_width}x${max_height}`,
                join(temp_dir, `image${i + 1}-scaled.png`),
            ],
        });
        const { code, stderr } = await command.output();
        if (code !== 0) {
            console.error("magick convert output -->");
            console.error(new TextDecoder().decode(stderr));
            throw new Error("magick convert exited with non 0 code");
        }
    }

    // generate looped slideshow for future final video

    // both sould be divisible by 0.1
    const transition_duration = 0.5;
    const slide_duration = 2.5;

    const loop_duration = Math.ceil((slide_duration + transition_duration) * image_count * 60);
    if (image_count === 1) {
        const command = new Deno.Command("ffmpeg", {
            args: [
                "-loop",
                "1",
                "-framerate",
                "60",
                "-i",
                join(temp_dir, "image1-scaled.png"),
                "-c:v",
                codec,
                "-pix_fmt",
                "yuv420p",
                "-r",
                "60",
                "-frames",
                `${loop_duration}`,
                join(temp_dir, "slideshow_loop.mp4"),
            ],
        });
        const { code, stderr } = await command.output();
        if (code !== 0) {
            console.error("(ffmpeg 1 image slideshow loop generation) output -->");
            console.error(new TextDecoder().decode(stderr));
            throw new Error("ffmpeg exited with non 0 code. (ffmpeg 1 image slideshow loop generation)");
        }
    } else {
        const ffmpeg_args: string[] = [];
        for (let i = 0; i < image_count; i++) {
            ffmpeg_args.push("-loop", "1", "-framerate", "60", "-i", join(temp_dir, `image${i + 1}-scaled.png`));
        }
        ffmpeg_args.push("-filter_complex");

        let current_filter_result = 0;
        let current_second_input = 1;
        let complex_filter = "";
        complex_filter = complex_filter.concat(`[0][1]xfade=transition=slideleft:duration=${transition_duration.toFixed(1)}:offset=${slide_duration.toFixed(1)}[m0];`);
        for (let i = 2; i < image_count + 1; i++) {
            const first_input = current_filter_result;
            const second_input = current_second_input + 1 < image_count ? current_second_input + 1 : 0;
            const output = current_filter_result + 1;
            complex_filter = complex_filter.concat(
                `[m${first_input}][${second_input}]xfade=transition=slideleft:duration=${transition_duration.toFixed(1)}:offset=${
                    ((slide_duration + transition_duration) * i - transition_duration).toFixed(1)
                }[m${output}];`,
            );
            current_filter_result += 1;
            current_second_input = second_input;
        }

        ffmpeg_args.push(complex_filter);
        ffmpeg_args.push("-map", `[m${current_filter_result}]`, "-c:v", codec, "-pix_fmt", "yuv420p", "-r", "60", "-frames", `${loop_duration}`, join(temp_dir, "slideshow_loop.mp4"));

        const command = new Deno.Command("ffmpeg", {
            args: ffmpeg_args,
        });
        const { code, stderr } = await command.output();
        if (code !== 0) {
            console.error("(ffmpeg 2 or more images slideshow loop generation) output -->");
            console.error(new TextDecoder().decode(stderr));
            throw new Error("ffmpeg exited with non 0 code. (ffmpeg 2 or more images slideshow loop generation)");
        }
    }

    // create final video with music
    const ffmpeg_args: string[] = [];
    ffmpeg_args.push(
        "-hide_banner",
        "-stream_loop",
        "-1",
        "-i",
        join(temp_dir, "slideshow_loop.mp4"),
        "-i",
        audio_filename,
        "-shortest",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        join(temp_dir, "slideshow.mp4"),
    );
    const command = new Deno.Command("ffmpeg", {
        args: ffmpeg_args,
    });
    const { code, stderr } = await command.output();
    if (code !== 0) {
        console.error("(ffmpeg final slideshow generation) output -->");
        console.error(new TextDecoder().decode(stderr));
        throw new Error("ffmpeg exited with non 0 code. (ffmpeg final slideshow generation)");
    }

    const result = await Deno.readFile(join(temp_dir, "slideshow.mp4"));
    await Deno.remove(temp_dir, { recursive: true });

    return result;
}
