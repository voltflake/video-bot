// Scrapes video using musicaldown.com service
// Feel free to submit pull requests if you want to improve/fix this backend

import FormData from "form-data";
import axios from "axios";

// Downloads best available video 
export default async function getVideoLink(url: URL): Promise<string> {
    try {
        const html = await getData(url);
        return extractLink(html);
    } catch (err) {
        throw err + "\nmusicaldown backend failed";
    }
}

// Gets html with links from service
async function getData(url: URL): Promise<string> {
    return new Promise<string>(async function (resolve, reject) {

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
        form_data.append(tokens.link_key, url.toString());
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
        const response = await axios(config);
        resolve(response.data);
    });
}

// Extract link from results page
// TODO: extraction is too unreliable, should be using button text insted of blindly extracted links
function extractLink(html: string) {
    const links_regex = html.match(/(?<=target="_blank"[\s|rel="noreferrer"]+href=")[^"]+/g);
    if (links_regex != undefined)
        if (links_regex.length >= 4)
            return links_regex[3].match(/^[^&]+/g)![0];
    throw "failed to extract links from html";
}