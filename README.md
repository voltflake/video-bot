## **Discord bot which replies with video to (YouTube & Instagram & TikTok) links**  
### ✅ Should work out of the box  
### ⚠️🤝 If you encountered a problem or want some help feel free to sumbit an issue. Feedback is appriciated!  
### Features✨
- [X] Lets everyone view the video directly in Discord
- [X] Sends videos as reply to original message
- [X] Supports multiple links in one message
- [X] No TikTok watermark on videos
- [X] Can be hosted on Raspberry Pi (read Raspberry Pi section)
- [X] Settings wizzard is built into bot
- [X] Also supports Instagram and YouTube links with some additional setup

![Bot in action](preview.gif)  

# Installation
1. Make sure recent version of node.js and npm is installed on your system
2. Build bot with these commands
```
cd ~
git clone https://github.com/voltflake/video-bot
cd video-bot
npm install
npx tsc
```
3. Now you can start this bot
```
node .
```
# Getting Raspberry Pi to work
Required to run
---
Instalation should be pretty straighfoward.  
Download [Node Version Manager](https://github.com/nvm-sh/nvm#install--update-script)  
Install Node with nvm (v18.16.1 should work fine on raspbian buster, newer may fail)  
```
nvm install --lts node
```
Follow above instalation instructions
  
Support Instagram links
---
Install python3 and python3-pip  
```
sudo apt install python3 python3-pip
```
Install gallery-dl python package
```
pip3 install gallery-dl
```
Update PATH variable if you get a warning that script is not in PATH
```
PATH=$PATH:/home/pi/.local/bin
```
Log into instagram.com from your browser and exctract cookies.txt from it.  
Place cookies.txt into video-bot folder and Instagram feature should work fine.  

Support YouTube links
---
Install python3 and python3-pip  
```
sudo apt install python3 python3-pip
```
Install yt-dlp python package
```
pip3 install yt-dlp
```
Update PATH variable if you get a warning that script is not in PATH
```
PATH=$PATH:/home/pi/.local/bin
```

Support hardware accelerated video compression
---
Make sure your OS is **Raspbian Buster** also known as **Raspbian Legacy**,  
h264_omx hardware encoder doesn't work on newer **Raspbian Bulseye** on my 3A+ board.  
Install ffmpeg
```
sudo apt install ffmpeg
```

Run bot on system startup (systemd service)
---
1. Create service file
```
sudo nano /etc/systemd/system/video-bot.service
```
2. Fill in the file (working example)
```
[Unit]
Description=Discord Bot for easier video viewing
After=network.target

[Service]
Environment=PATH=/home/pi/.local/bin:/home/pi/.nvm/versions/node/v18.16.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/games
Type=simple
User=pi
WorkingDirectory=/home/pi/video-bot
ExecStart=/home/pi/video-bot/start.sh

[Install]
WantedBy=multi-user.target
```
3. Create `start.sh` file in project directory
```
sudo nano /home/pi/video-bot/start.sh
```
4. Fill in the file
```
#!/bin/sh
node .
```
5. Make `start.sh` executable
```
chmod +x /home/pi/video-bot/start.sh
```

## Explanation of `settings.json`
- `token` - Discord bot token to use.
- `embeded_mode` - always send videos using URL message in Discord, may have not cleanest look but works realy fast if you have slow internet.
- `enable_compression` - setting which enables compression for videos bigger than 8MB so they can be sent as single video file to discord, without links. If compression is disabled videos will be sent as embeded link and can expire after a week or so.
- `codec_to_use` - specifies which codec ffmpeg will use during compression. You can specify this as "omx_h264" on raspberry pi to use hardware accelerated encoding. By default uses "h264".
