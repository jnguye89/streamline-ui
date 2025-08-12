import { Injectable } from "@angular/core";
import WowzaWebRTCPlay from "../../wowza/WowzaWebRTCPlay";

declare const wowzaWebRTCPlay: any;

@Injectable({
    providedIn: 'root'
})
export class WowzaPlayService {
    constructor() { }

    init(player: HTMLVideoElement) {
        (window as any).wowzaWebRTCPlay = new WowzaWebRTCPlay();
        wowzaWebRTCPlay.set({
            videoElementPlay: player,
            sdpURL: 'wss://9b8d039ecdad.entrypoint.cloud.wowza.com/webrtc-session.json',
            streamInfo: {
                applicationName: 'app-82XX3701',
                streamName: 'VU5rZnln'
            }
        });
    }

    play() {
        wowzaWebRTCPlay.play();
    }

    stop() {
        wowzaWebRTCPlay.stop();
    }
}