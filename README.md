# Video Bot by voltfalke
❤️ Open source Discord bot that replies with content to messages containig recognised links  
✔️ Currently works with links from **TikTok**, **YouTube** and **Instagram**  
🤝 Feel free to sumbit an issue if you encountered a problem or need some help. Feedback is appriciated!  

## ✨ Features
- Can be hosted on Raspberry Pi. (*read Raspberry Pi section*)
- No TikTok watermark on videos.
- Compresses videos when they exceed discord upload limits.
- Generates videos with music from Instagram posts or TikTok images.
- Shows processing status/stage.
- Bot threats private/unavailable content as errors.  

## 🔧 Installation
> [!IMPORTANT]  
> These dependencies are required for bot to work properly.  
> All should be available from PATH enviroment variable.
> - [ffmpeg and ffprobe](https://ffmpeg.org/) (required for video compression and video slideshow generation)
> - [image magick](https://imagemagick.org/) (required for slideshow generation)
> - [yt-dlp](https://github.com/yt-dlp/yt-dlp) (required to support YouTube shorts and videos)
> - [Node.js](https://nodejs.org/en) (required to run the bot)

1. Make sure you have all needed dependencies installed and available in PATH
2. Download the project and navigate to project folder (where this README file is located)
3. Install Node.js dependencies and run typescript compiler to build project.
```
npm i
```
```
npx tsc
```
4. Go to [RapidAPI.com](https://rapidapi.com). Log in and subscribe to [RocketAPI](https://rapidapi.com/rocketapi/api/rocketapi-for-instagram) and [Tiktok Scraper](https://rapidapi.com/tikwm-tikwm-default/api/tiktok-scraper7). Save your key for authentification.
5. Rename `example.env` to `.env` and open it in text editor. Fill in required enviroment variables.
```
DISCORD_TOKEN - required, token to authenticate yout bot.
RAPIDAPI_KEY - required, key to your RapidAPI application.
```
> [!NOTE]  
> You can also specify additional variables if you need them.
> ```
> CODEC - optional, codec that ffmpeg should use when compressing/creating videos.
> ```
3. Now you should be able to start this bot.
```
node .
```
## 🥧 Hosting on Raspberry Pi or similar SBC
### Support for hardware accelerated video compression on RPI3 and RPI4
You have two choices here.  
1. Use Latest 32 or 64 bit Raspbian OS and specify `h264_v4l2m2m` codec for ffmpeg. (recommended)
2. Use old 32 bit [Raspbian Buster](https://downloads.raspberrypi.org/raspios_oldstable_lite_armhf/images/raspios_oldstable_lite_armhf-2023-05-03/) as your OS and  specify `h264_omx` codec.
### Getting image magick to work
Currently raspbian repo supplies older versions of this tool. You'll need to [compile it yourself](https://www.imagemagick.org/script/install-source.php#linux) to make it work with bot.  
Issue with old version that you can't use `magick identify` or `magick convert`. You have to do `identify` or `convert` instead. You can patch `slideshow_video.ts` to use older commands if you want, without compiling new tool.

## 🐧 Create a systemd service on linux to run bot at startup
1. Create service file
```
sudo nano /etc/systemd/system/video-bot.service
```
2. Fill in the file (working example)  
I prefer to have executable script that systemd runs, rather than specifying everything here. You can do as you want. Here's a [quickstart guide](https://linuxhandbook.com/create-systemd-services/).
```
[Unit]
Description=Discord Bot for easier video viewing
After=network.target

[Service]
ExecStart=/home/pi/video-bot/start.sh
Type=simple
Restart=always

[Install]
WantedBy=multi-user.target
```
3. Create `start.sh` file in project directory
```
sudo nano /home/pi/video-bot/start.sh
```
4. Fill in the file  
I added python virtual enviroment with `yt-dlp` installed there to PATH because it's not in PATH by default.
```
#!/bin/bash
PATH=/home/pi/venv/bin:$PATH
cd /home/pi/video-bot
/usr/bin/node .
```
5. Make `start.sh` executable
```
chmod +x /home/pi/video-bot/start.sh
```
6. Enable and start new service.
```
sudo systemctl daemon-reload
```
```
sudo systemctl enable video-bot.service
```
> [!NOTE]  
> Be careful with using distro-provided yt-dlp. If you do so make sure it's up to date. Youtube likes to break this stuff. 
