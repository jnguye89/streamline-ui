import 'webrtc-adapter'; // side-effect: sets window.adapter
import '../wowza/WowzaMungeSDP.js'; // side-effect script
import WowzaWebRTC from '../wowza/WowzaWebRTCPublish.js';
// import WowzaWebRTCPlay from '../wowza/WowzaWebRTCPlay.js';
(window as any).WowzaWebRTC = WowzaWebRTC;
