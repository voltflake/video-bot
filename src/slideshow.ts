import { type Item } from "./util.js";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { execFile } from 'node:child_process';

// WARNING: h264_v4l2m2m encoder on rpi4 can fail on bigger resolutions
// 756x1344 is maximum for 9:16 aspect ratio (4096 16pixel blocks) for 60fps
// or 1080p@30 max

// WARNING: libx264 doesn't encode resolutions that are not divisible by 2

export async function createSlideshowVideo(items: Array<Item>) {
    let codec = "libx264";
    if (process.env["CODEC"] != null) {
        codec = process.env["CODEC"];
    }

    // download all required assets
    const timestamp = Date.now()
    const image_filenames: Array<string> = [];
    let image_count = 0;
    let audio_filename: string = "";
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) throw new Error("unreachable");
        if (!item.variants[0]) throw new Error("unreachable");
        const data = await (await fetch(item.variants[0].href)).arrayBuffer();
        if (item.type === "image") {
            image_count += 1;
            image_filenames.push(`./videos/${timestamp}-image${i}.${item.variants[0].file_extention}`);
            await writeFile(`./videos/${timestamp}-image${i}.${item.variants[0].file_extention}`, Buffer.from(data));
        }
        if (item.type === "audio") {
            audio_filename = `./videos/${timestamp}-audio.mp3`;
            await writeFile(audio_filename, Buffer.from(data));
        }
    }

    // identify image resolutions
    const image_resolutions: Array<{ width: number; height: number }> = [];
    for (let i = 0; i < image_count; i++) {
        const element = image_filenames[i];
        if (!element) throw new Error("unreachable");
        await new Promise<void>((resolve) => {
            execFile("magick",
                ["identify", element],
                { encoding: "utf-8", shell: true },
                (error, stdout, stderr) => {
                    if (error) {
                        console.error(stdout, stderr);
                        throw new Error("execFile failed (magick identify)");
                    }
                    const match = stdout.match(/(?<width>\d+)x(?<height>\d+)/);
                    if (!match) throw new Error("unreachable");
                    if (!match.groups) throw new Error("unreachable");
                    image_resolutions.push({ width: Number.parseInt(match.groups["width"]!), height: Number.parseInt(match.groups["height"]!) });
                    resolve();
                }
            );
        });
    }

    // calculate scaling, size and target aspect ratio
    let max_height = 0;
    let max_aspect_ratio = 3;
    for (let i = 0; i < image_count; i++) {
        const item = items[i];
        if (!item) throw new Error("unreachable");
        if (item.type !== "image") continue;
        const resolution = image_resolutions[i];
        if (!resolution) throw new Error("unreachable");

        if (resolution.height > max_height) max_height = resolution.height;
        const aspect_ratio = resolution.width / resolution.height;
        if (aspect_ratio < max_aspect_ratio) max_aspect_ratio = aspect_ratio;
    }
    if (max_aspect_ratio < 0.5625) max_aspect_ratio = 0.5625;

    if (max_height > 1920) max_height = 1920;
    let selected_width = max_height * max_aspect_ratio;

    if (codec === "libx264") {
        if (selected_width % 2 === 1) selected_width -= 1;
        if (max_height % 2 === 1) max_height -= 1;
    }

    // scale each image
    const scaled_image_filenames: Array<string> = [];
    for (let i = 0; i < image_count; i++) {
        const image_filename = image_filenames[i];
        if (!image_filename) throw new Error("unreachable");
        const output_image_filename = `./videos/${timestamp}-image${i}-scaled.png`
        // magick convert image1.jpg -resize "1080x1350" -background black -gravity center -extent 1080x1350 output_image2.jpg
        await new Promise<void>((resolve) => {
            execFile("magick",
                ["convert", image_filename, "-resize", `"${selected_width}x${max_height}"`, "-background", "black", "-gravity", "center", "-extent", `${selected_width}x${max_height}`, output_image_filename],
                { encoding: "utf-8", shell: true },
                (error, stdout, stderr) => {
                    if (error) {
                        console.error(stdout, stderr);
                        throw new Error("execFile failed (magick convert)");
                    }
                    resolve();
                }
            );
        });
        scaled_image_filenames.push(output_image_filename);
    }

    // generate looped slideshow for future final video

    // both sould be divisible by 0.1
    const transition_duration = 0.5;
    const slide_duration = 2.5;

    const loop_duration = Math.ceil((slide_duration + transition_duration) * image_count * 60);
    if (image_count === 1) {
        const ffmpeg_args = `-loop 1 -framerate 60 -i ${scaled_image_filenames[0]} -c:v ${codec} -pix_fmt yuv420p -framerate 60 -frames ${loop_duration} videos/${timestamp}-slideshow_loop.mp4`;
        await new Promise<void>((resolve) => {
            execFile("ffmpeg", ffmpeg_args.split(" "),
                { encoding: "utf-8", shell: true },
                (error, stdout, stderr) => {
                    if (error) {
                        console.error("ffmpeg " + ffmpeg_args);
                        console.error(stdout, stderr);
                        throw new Error("execFile failed (ffmpeg creating loop video)");
                    }
                    resolve();
                })
        });
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
            const second_input = (current_second_input + 1 < image_count) ? current_second_input + 1 : 0;
            const output = current_filter_result + 1;
            ffmpeg_command = ffmpeg_command.concat(`[m${first_input}][${second_input}]xfade=transition=slideleft:duration=${transition_duration.toFixed(1)}:offset=${((slide_duration + transition_duration) * i - transition_duration).toFixed(1)}[m${output}];`);
            current_filter_result += 1;
            current_second_input = second_input;
        }
        ffmpeg_command = ffmpeg_command.slice(0, -1);
        ffmpeg_command = ffmpeg_command.concat(`" -map "[m${current_filter_result}]" -c:v ${codec} -pix_fmt yuv420p -framerate 60 -frames ${loop_duration} videos/${timestamp}-slideshow_loop.mp4`);

        await new Promise<void>((resolve) => {
            execFile("ffmpeg", ffmpeg_command.split(" ").slice(1),
                { encoding: "utf-8", shell: true },
                (error, stdout, stderr) => {
                    if (error) {
                        console.error(ffmpeg_command);
                        console.error(stdout, stderr);
                        throw new Error("execFile failed (ffmpeg creating loop video)");
                    }
                    resolve();
                })
        });
    }

    // create final video with music
    const ffmpeg_command2 = `ffmpeg -hide_banner -stream_loop -1 -i videos/${timestamp}-slideshow_loop.mp4 -i ${audio_filename} -shortest -c:v copy -c:a aac -pix_fmt yuv420p -movflags +faststart videos/${timestamp}-output-swipe.mp4`;
    await new Promise<void>((resolve) => {
        execFile("ffmpeg", ffmpeg_command2.split(" ").slice(1),
            { encoding: "utf-8", shell: true },
            (error, stdout, stderr) => {
                if (error) {
                    console.error(ffmpeg_command2);
                    console.error(stdout, stderr);
                    throw new Error("execFile failed (ffmpeg creating final slideshow)");
                }
                resolve();
            });
    });

    const result = new Blob([await readFile(`./videos/${timestamp}-output-swipe.mp4`)]);

    // cleanup temp files
    const files = await readdir("./videos");
    for (const file of files) {
        if (("./videos/" + file).startsWith("./videos/" + timestamp.toFixed())) {
            await unlink("./videos/".concat(file));
        }
    }

    return result;
}