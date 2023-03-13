export type VideoData = {
    url: string;
    size: number;
};

export type Settings = {
    token: string;
    enable_compression: boolean;
    codec_to_use: string,
    embeded_mode: boolean;
    ffmpeg_path: string;
    ffprobe_path: string;
    gallery_dl_path: string;
};
