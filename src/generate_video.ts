import { runCommand, type Item } from "./util.js";

// WARNING: h264_v4l2m2m encoder on rpi4 can fail on bigger resolutions
// 756x1344 is maximum for 9:16 aspect ratio (4096 16pixel blocks) for 60fps
// or 1080p@30 max
// Only for posts without video items
export async function createSlideshowVideo(items: Item[]): Promise<string> {
    let codec = "libx264";
    let video_count = items.filter((item) => item.type === "video").length;
    if (video_count > 0) {
        throw new Error("createSlideshowVideo() called with video items present");
    }
    const audio_filename = items.find((item) => item.type === "audio")?.filepath;
    if (!audio_filename) {
        throw new Error("Cannot generate slideshow video without audio provided");
    }
    let image_paths = [...items.filter((item) => item.type === "image").map((item) => item.filepath)];
    let image_count = image_paths.length;

    // Get image resolutions.
    const image_resolutions: { width: number; height: number }[] = [];
    for (const path of image_paths) {
        try {
            const proc = await runCommand(["magick", "identify", path]);
            const match = proc.stdout.match(/(?<width>\d+)x(?<height>\d+)/);
            if (!match) {
                throw new Error("No matches found when using regex on magick identify output");
            }
            if (!match.groups) {
                throw new Error("No groups were found in matches found when using regex on magick identify output");
            }
            image_resolutions.push({
                width: Number.parseInt(match.groups["width"]!),
                height: Number.parseInt(match.groups["height"]!),
            });
        } catch (error) {
            throw new Error("magick identify step failed");
        }
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

    // WARNING: libx264 doesn't encode odd resolutions
    if (codec === "libx264") {
        if (selected_width % 2 === 1) {
            selected_width -= 1;
        }
        if (max_height % 2 === 1) {
            max_height -= 1;
        }
    }

    // scale each image
    for (const path of image_paths) {
        try {
            await runCommand([
            "magick",
            "convert",
            path,
            "-resize",
            `${selected_width}x${max_height}`,
            "-background",
            "black",
            "-gravity",
            "center",
            "-extent",
            `${selected_width}x${max_height}`,
            `${path}-scaled.png`,
        ]);
        } catch (error) {
            throw new Error("magick convert exited with non 0 code");
        }
    }

    // generate looped slideshow for future final video

    // both sould be divisible by 0.1
    const transition_duration = 0.5;
    const slide_duration = 2.5;

    const loop_duration = Math.ceil((slide_duration + transition_duration) * image_count * 60);
    if (image_count === 1) {
        try {
            await runCommand([
                "ffmpeg", "-y",
                "-loop", "1",
                "-framerate", "60",
                "-i", `${image_paths[0]}-scaled.png`,
                "-c:v", codec,
                "-pix_fmt", "yuv420p",
                "-r", "60",
                "-frames", `${loop_duration}`,
                `${image_paths[0]}-slideshow-loop.mp4`,
            ]);
        } catch (error) {
            throw new Error("ffmpeg exited with non 0 code. (ffmpeg 1 image slideshow loop generation)");
        }
    } else {
        const ffmpeg_args: string[] = ["ffmpeg", "-y"];
        for (const path of image_paths) {
            ffmpeg_args.push("-loop", "1", "-framerate", "60", "-i", `${path}-scaled.png`);
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
        complex_filter = complex_filter.slice(0, -1);
        ffmpeg_args.push(complex_filter);
        ffmpeg_args.push("-map", `[m${current_filter_result}]`, "-c:v", codec, "-pix_fmt", "yuv420p", "-r", "60", "-frames", `${loop_duration}`, `${image_paths[0]}-slideshow-loop.mp4`);

        try {
            await runCommand(ffmpeg_args);
        } catch (error) {
            throw new Error("ffmpeg exited with non 0 code. (ffmpeg 2 or more images slideshow loop generation)");
        }
    }

    // create final video with music
    const ffmpeg_args: string[] = [
        "ffmpeg", "-y",
        "-hide_banner",
        "-stream_loop",
        "-1",
        "-i",
        `${image_paths[0]}-slideshow-loop.mp4`,
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
        `${image_paths[0]}-slideshow.mp4`,
    ];

    try {
        await runCommand(ffmpeg_args);
    } catch (error) {
        throw new Error("ffmpeg exited with non 0 code. (ffmpeg final slideshow generation)");
    }

    return `${image_paths[0]}-slideshow.mp4`;
}
