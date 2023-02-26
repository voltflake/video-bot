# Discord bot which replies with video to TikTok or Instagram link
### Current status: ✅ Works out of the box
![Bot in action](preview.gif)
### Features✨
- [X] Lets everyone view the video directly in Discord
- [X] Sends videos as reply to original message
- [X] Supports multiple links in one message
- [X] No TikTok watermark on videos
- [X] Can be hosted on Raspberry Pi  
- [X] Configuration wizzard is built into bot  
- [X] Also supports instagram links with some additional setup  

### ⚠️🤝 If you encountered a problem or want some help feel free to sumbit an issue. Feedback is appriciated!
## Installation 
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
## settings.json file explanation  
- `token` - Discord bot token to use.
- `embeded_mode` - always send videos using URL message in Discord, may have not cleanest look but works realy fast if you have slow internet.
- `gallery_dl_path` - path to gallery-dl executable if it's not present in your PATH enviroment variable.
- `enable_compression` - setting which enables compression for videos bigger than 8MB so they can be sent as single video file to discord, without links. If compression is disabled videos will be sent as embeded link and can expire after a week or so.
- `codec_to_use` - specifies which codec ffmpeg will use during compression. You can specify this as "omx_h264" on raspberry pi to use hardware accelerated encoding. By default uses "h264".
- `ffmpeg_path` - you can specify custom ffmpeg executable path. By default it just uses executable from your PATH enviroment variable.
- `ffprobe_path` - you can specify custom ffprobe executable path. By default it just uses executable from your PATH enviroment variable.
