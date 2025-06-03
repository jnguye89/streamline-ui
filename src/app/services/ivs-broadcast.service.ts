import { Injectable, OnDestroy } from "@angular/core";
import IVSBroadcastClient, {
  AmazonIVSBroadcastClient,
} from "amazon-ivs-web-broadcast";
import { environment } from "../../environments/environment";

@Injectable({ providedIn: "root" })
export class IvsBroadcastService implements OnDestroy {
  private client: AmazonIVSBroadcastClient | null = null;

  async init() {
    // if (!client) {
    this.client = IVSBroadcastClient.create({
      // Enter the desired stream configuration
      streamConfig: IVSBroadcastClient.STANDARD_LANDSCAPE,
      // Enter the ingest endpoint from the AWS console or CreateChannel API
      ingestEndpoint: environment.ivsIngestEndpoint,
    });
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    const micStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: true,
    });
    this.client.addVideoInputDevice(mediaStream, "camera1", { index: 0 }); // only 'index' is required for the position parameter
    this.client.addAudioInputDevice(micStream, "mic1");
  }

  ngOnDestroy(): void {
    this.client?.stopBroadcast();
  }

  startBroadcast() {
    if (!this.client) {
      throw new Error("IVS Broadcast client is not initialized.");
    }
    this.client
      .startBroadcast(environment.ivsStreamKey)
      .then((res) => console.log(res))
      .catch((error) => {
        console.log(error);
      });
  }

  stopBroadcast() {
    this.client?.stopBroadcast();
  }
}
