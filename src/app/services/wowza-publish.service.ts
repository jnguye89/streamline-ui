import { Injectable } from "@angular/core";
import { WebRtcState } from "../models/webrtc-state.model";

declare const WowzaWebRTC: any;

@Injectable({
    providedIn: 'root'
})
export class WowzaPublishService {
    constructor() { }

    init(state: WebRtcState) {
        WowzaWebRTC.set({
            videoElementPublish: state.videoElementPublish,
            sdpURL: state.sdpUrl,
            streamInfo: {
                applicationName: state.applicationName,
                streamName: state.streamName
            }
        })
    }

    start() {
        WowzaWebRTC.start();
    }

    stop() {
        WowzaWebRTC.stop();
    }
}