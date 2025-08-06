export interface PublishInfo {
  name: string; // My Live Event
  broadcastLocation: string; // us_west_california, eu_ireland, …
  encoder: string; // other_rtmp, other_webrtc, …
  lowLatency?: boolean; // optional
  sdpUrl: string;
  application: string;
  streamName: string;
  token: string;
}
