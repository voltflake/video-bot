import type { Message } from "discordeno";

export type ContentType = "image" | "video" | "audio";
export type SocialMedia = "TikTok" | "Instagram" | "YouTube" | "YouTubeShorts";

export type Item = {
    type: ContentType;
    url: string;
    size: number;
};

export type Task = {
    message: Message;
    url: string;
    type: SocialMedia;
};

export async function getContentLength(url: string): Promise<number> {
    try {
        const response = await fetch(url, { method: "HEAD" });
        if (response.ok) {
            return extractLength(response.headers);
        }
    } catch {
        console.error("Fault: Failed to extract content-length with HEAD method.");
    }

    try {
        const response = await fetch(url, { method: "GET" });
        if (response.ok) {
            return extractLength(response.headers);
        }
    } catch {
        console.error("Fault: Failed to extract content-length with GET method.");
    }

    throw new Error("Failed to get content-length headers. URL might be broken/unavailable.");
}

function extractLength(headers: Headers): number {
    let header_value = headers.get("content-length");
    if (header_value) {
        return Number.parseInt(header_value);
    }

    header_value = headers.get("Content-Length");
    if (header_value) {
        return Number.parseInt(header_value);
    }

    throw new Error("No content-length headers were found.");
}
