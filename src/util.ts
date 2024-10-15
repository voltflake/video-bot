import type { Message } from "npm:discordeno";

export type ContentType = "image" | "video" | "audio";
export type SocialMedia = "TikTok" | "Instagram" | "YouTube" | "YouTubeShorts";
export type LogLevel = "INFO" | "FAULT" | "CRITICAL";

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

const encoder = new TextEncoder();
export function log(level: LogLevel, message: string): void {
    Deno.writeFileSync("log.txt", encoder.encode(`[${level}] ${message}\n`), { append: true });
}

export async function getContentLength(url: string): Promise<number | undefined> {
    let response: undefined | Response;
    try {
        response = await fetch(url, { method: "HEAD" });
    } catch {
        log("FAULT", `Failed to submit HEAD request to ${url}`);
    }

    let content_length: undefined | number;
    if (response) {
        if (response.status === 200) {
            content_length = extractLength(response.headers);
            if (content_length) {
                return content_length;
            }
        } else {
            log("FAULT", `Server responded with non-200 code to HEAD request when fetching for content-length headers. Code: ${response?.status} URL: ${url}`);
        }
    }

    log("INFO", "Switching to GET request...");
    try {
        response = await fetch(url, { method: "GET" });
    } catch {
        log("FAULT", `Failed to submit GET request to ${url}`);
        return;
    }

    if (response.status === 200) {
        content_length = extractLength(response.headers);
        if (content_length) {
            return content_length;
        }
    }

    log("CRITICAL", `HEAD and GET requests both failed when fetching for content-length headers. Server responded with code ${response.status} to GET request.`);
    return;

    function extractLength(headers: Headers): number | undefined {
        let header_value = headers.get("content-length");
        if (header_value) {
            return Number.parseInt(header_value);
        }

        header_value = headers.get("Content-Length");
        if (header_value) {
            return Number.parseInt(header_value);
        }
        return undefined;
    }
}
