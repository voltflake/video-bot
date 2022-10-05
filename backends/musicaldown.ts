// Scrapes video using musicaldown.com service
// Feel free to submit pull requests if you want to improve/fix this backend

import FormData from "form-data";
import axios from "axios";

type ExtractedLinks = {
    source1?: string,
    source2?: string,
    embed_ready?: string,
    with_watermark?: string
}

// Downloads best available video 
export async function getVideoLink(url: string) {
    const html = await getData(url);
    const links = extractLinks(html);
    if (links == undefined) return null;
    let video_link: string | undefined = undefined;
    if (links.with_watermark != undefined) video_link = links.with_watermark;
    if (links.source2 != undefined) video_link = links.source2;
    if (links.source1 != undefined) video_link = links.source1;
    if (video_link == undefined) return null;
    return video_link;
}

// Gets html with links from service
async function getData(url: string): Promise<string> {
    return new Promise(async function (resolve, reject) {

        // Go to website to create needed tokens & cookies
        const init_response = await axios.get("https://musicaldown.com/id", {
            headers: {
                Accept: "*/*",
                Referer: "https://musicaldown.com",
                Origin: "https://musicaldown.com",
            }
        });

        // Collect necessary data from main page to submit POST request later based on it
        const inputs = init_response.data.match(/<input[^>]+>/g);
        const tokens = {
            link_key: inputs[0].match(/(?<=name=")[^"]+(?=")/g)[0],
            session_key: inputs[1].match(/(?<=name=")[^"]+(?=")/g)[0],
            session_value: inputs[1].match(/(?<=value=")[^"]+(?=")/g)[0],
        };

        // Make POST request
        let form_data = new FormData();
        form_data.append("verify", "1");
        form_data.append(tokens.link_key, url);
        form_data.append(tokens.session_key, tokens.session_value);
        const sessiondata_regex = init_response.headers["set-cookie"]?.toString().match(/session_data=[^;]+(?=;)/g);
        if (sessiondata_regex == undefined) {
            reject("session cookies were not granted");
            return;
        }
        const sessiondata_text = sessiondata_regex[0];
        const config = {
            method: "post",
            url: "https://musicaldown.com/download",
            headers: {
                "Origin": "https://musicaldown.com",
                "Referer": "https://musicaldown.com/id",
                "Cookie": sessiondata_text,
            },
            data: form_data
        };

        // Extract link from results page
        // TODO: extraction is too unreliable, should be using button text insted of blindly extracted links
        const response = await axios(config);
        resolve(response.data);
    });
}
function extractLinks(html: string) {
    const links_regex = html.match(/(?<=target="_blank"[\s|rel="noreferrer"]+href=")[^"]+/g);
    if (links_regex == undefined) return null;
    const links: ExtractedLinks = {
        source1: links_regex[0],
        source2: links_regex[2],
        embed_ready: links_regex[3].match(/^[^&]+/g)![0],
        with_watermark: links_regex[4]
    };
    return links;
}