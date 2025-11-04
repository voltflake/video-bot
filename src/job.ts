import { Client, type FileData, type Message, MessageFlags } from 'disgroove';
import { client } from './main.js';
import type { Content } from "./util.js";

import { extractWithYtdlp } from "./extractors/yt-dlp.js"
import { extractWithGallerydl } from "./extractors/gallery-dl.js"
import { extractWithSavegram } from "./extractors/safegram.js";

import { sendGallery } from "./send_gallery.js";

export class Job {
    url: URL;
    message: Message;
    response_message: Message | undefined = undefined;
    extraction_methods_used: number = 0;
    extractors: ((url: URL) => Promise<Content>)[] = [];
    client: Client;

    constructor(url: URL, message: Message) {
        this.url = url;
        this.message = message;
        this.client = client;
        this.setExtractors(this.url);
    }

    async set_status(text: string) {
        if (!this.response_message) {
            this.response_message = await client.createMessage(this.message.channelId, {
                content: text,
                messageReference: {messageId: this.message.id},
                allowedMentions: {repliedUser: false}
            });
        } else {
            await client.editMessage(this.message.channelId, this.response_message.id, {
                content: text,
                allowedMentions: {repliedUser: false}
            });
        }
    }

    async submit_result(files: FileData[]) {
        await client.editMessage(this.message.channelId, this.response_message!.id, {
            content: "",
            files: files,
            allowedMentions: { repliedUser: false }
        });
    }

    async remove_original_embeds() {
        await client.editMessage(this.message.channelId, this.message.id, {
            flags: MessageFlags.SuppressEmbeds,
        });
    }

    tryToExtractContent(): Promise<Content> {
        this.extraction_methods_used += 1;
        if (this.extraction_methods_used === 1) {
            return extractWithYtdlp(this.url);
        } else if (this.extraction_methods_used === 2) {
            return extractWithGallerydl(this.url);
        } else {
            return extractWithSavegram(this.url);
        }
    }

    async tryToSendContent(content: Content): Promise<void> {
        sendGallery(content, this);
    }

    private setExtractors(url: URL) {
        if (url.hostname.endsWith("instagram.com")) {
            this.extractors.push(extractWithSavegram);
            this.extractors.push(extractWithGallerydl);
            this.extractors.push(extractWithYtdlp);
        } else if (url.hostname.endsWith("tiktok.com")) {
            this.extractors.push(extractWithGallerydl);
            this.extractors.push(extractWithYtdlp);
        } else {
            this.extractors.push(extractWithYtdlp);
            this.extractors.push(extractWithGallerydl);
        }
    }
}