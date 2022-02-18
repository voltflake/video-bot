# Discord bot which replies with video to tiktok url
To build it you need node.js and npm (or other node.js package manager) installed on your system\
Should work fine on arm64 and x86 hardware with modern node.js version

# Installation 
Don't forget to place bot token in main.js
```
cd ~
git clone https://github.com/danyildiabin/tiktok-to-discord
cd tiktok-to-discord
npm install
node main.js
```
# Autorun on linux
If you're on linux you can also set crontab to run this bot at startup
```
crontab -e
```
And write this line in that file, replacing `danyil` with your username
```
@reboot cd /home/danyil/tiktok-to-discord/ ; node main.js
```
