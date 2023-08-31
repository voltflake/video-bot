import { Message } from "discord.js";

export type url_and_size = {
    url: string;
    size: number;
};

export type Settings = {
    token: string;
    enable_compression: boolean;
    codec: string;
    embeded_mode: boolean;
};

export type BackendContext = {
    message: Message;
    url: string;
    try_compressing_videos: boolean;
    always_embed_attachments: boolean;
    allowed_tries: number;
    backend_response?: BackendResponse;
    backend_last_error?: Error;
    backend: (request_url: string) => Promise<BackendResponse>;
};

export type BackendResponse = {
    videos: url_and_size[];
    images: url_and_size[];
};