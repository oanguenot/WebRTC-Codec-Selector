# WebRTC Codecs & Quality Tools by Alcatel-Lucent Enterprise (Dec'14)

## Description

WebRTC utility tools for:
- Selecting Audio and Video codecs
- Making P2P audio and Video call
- Checking quality perceived versus packets losts, framerate 

# INSTALL & USE
- Download and copy all files into your directory
- Open a command tool and launch npm install (node.js should be installed)
- Launch node server.js
- Configure the manifest.json file for configuring & tuning the demo


# TODO
 - To complete


# HISTORY

## Version 1.0.4
 - FEATURE: Limit the audio & video bandwidth

## Version 1.0.3
 - FIX: Media displayed (audio only)
 - FEATURE: Add the possibility to force to G722
 - REWORK: Media selector

## Version 1.0.1 & 1.0.2
 - FIX: Firefox glitch
 - FEATURE: Add manifest file for easy configuration & tuning
 - FEATURE: Display statistics helper to know the difference between "Call" quality and "Instant" quality

## Version 1.0.0
 - FEATURE: Select audio & Video codecs
 - FEATURE: Audio & Video call
 - FEATURE: Display graph of packets lost for Audio & Video media
 - FEATURE: Display Codecs negociated
 - FEATURE: Display Framerate

# DEPENDENCIES
 - Jquery 2.1.1 (MIT)
 - D3 (MIT)
 - Ricksaw (MIT)
 - Bootstrap 3.3.1 (MIT)
 - Sonotone (MIT)