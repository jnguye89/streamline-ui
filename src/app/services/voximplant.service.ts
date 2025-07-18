import { ElementRef, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom, Observable } from "rxjs";
import { environment } from "../../environments/environment";
import { UserIntegration } from "../models/user-integration.model";
// import { CallEvents } from "voximplant-websdk";
// import { Events } from "voximplant-websdk";

declare const VoxImplant: any; // global from <script src="voximplant.min.js">

@Injectable({ providedIn: "root" })
export class VoximplantService {
  private client = VoxImplant?.getInstance();
  private currentCall?: any;

  constructor(private http: HttpClient) {
    if (!this.client) {
      throw new Error("Voximplant script missing from index.html");
    }
  }

  /** Boot the SDK and open the WebSocket exactly once */
  private async ensureConnected(
    node: "NODE_1" | "NODE_2" = "NODE_2"
  ): Promise<void> {
    // if (this.client.getClientState() === VoxImplant.ClientState.CONNECTED) return;

    /* 1️⃣  wait for SDKReady */
    await new Promise<void>((res) => {
      const ready = () => {
        this.client.removeEventListener(VoxImplant.Events.SDKReady, ready);
        res();
      };

      this.client.addEventListener("*", (event: any) => {
        console.log(`[CLIENT EVENT] ${event.type}`, event);
      });
      this.client.addEventListener(VoxImplant.Events.SDKReady, ready);
      this.client.init({ node, micRequired: true }); // kicks off WebRTC init
    });

    /* 2️⃣  wait for ConnectionEstablished */
    await new Promise<void>((res) => {
      const open = () => {
        this.client.removeEventListener(
          VoxImplant.Events.ConnectionEstablished,
          open
        );
        res();
      };
      this.client.addEventListener(
        VoxImplant.Events.ConnectionEstablished,
        open
      );
      this.client.connect(); // opens WebSocket
    });
  }

  /** One-time-key login */
  async login(userId: string): Promise<void> {
    // console.log()
    userId = userId.split("|")[0]; // remove any Auth0 prefix
    const fullUser = `${userId}@skriin.jnguye89.n2.voximplant.com`;

    await this.ensureConnected(); // <-- the critical line

    /* AuthResult handler (attach **before** asking for the key) */
    const auth = async (e: any) => {
      if (e.key) {
        const { token } = await firstValueFrom(
          this.http.post<{ token: string }>(
            `${environment.baseUrl}/user/integration/voximplant/token`,
            { key: e.key }
          )
        );
        await this.client.loginWithOneTimeKey(fullUser, token);
      } else if (e.result) {
        console.log("✅ Voximplant login successful");
        this.client.removeEventListener(VoxImplant.Events.AuthResult, auth);
      } else {
        console.error(`❌ Login failed (code ${e.code})`);
      }
    };
    this.client.addEventListener(VoxImplant.Events.AuthResult, auth);

    /* Finally safe to request the key */
    this.client.requestOneTimeLoginKey(fullUser);
  }

  getVoxImplantUser(): Observable<UserIntegration> {
    return this.http.post<UserIntegration>(
      `${environment.baseUrl}/user/integration/voximplant`,
      null
    );
  }
  /* ---- OUTGOING call ------------------------------------------ */
  callUser(targetUser: string, remoteAudio: ElementRef<HTMLAudioElement>) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
      console.log("🎙️ Caller mic access granted");
      const call = this.client.call(
        {
          number: targetUser,
          sendAudio: true,
          receiveAudio: true,
          video: { sendVideo: false, receiveVideo: false },
        },
        true
      );

      call.addEventListener(VoxImplant.CallEvents.ProgressToneStart, () =>
        console.log("⏳ ringing…")
      );
      // call.addEventListener(VoxImplant.CallEvents.Connected, () =>
      //   console.log("✅ call connected")
      // );
      call.addEventListener(VoxImplant.CallEvents.Disconnected, () =>
        console.log("🔚 call ended")
      );
      call.addEventListener("Failed", (e: any) => {
        console.error("❌ Call failed", {
          code: e.code,
          reason: e.reason,
          headers: e.headers,
        });
      });
      call.addEventListener("Connected", () => {
        setTimeout(() => {
          const streams = call.getRemoteStreams?.();
          console.log("📥 [caller] getRemoteStreams:", streams);
          if (streams?.length) {
            remoteAudio.nativeElement.srcObject = streams[0];
            remoteAudio.nativeElement.play().catch(console.error);
          } else {
            console.warn("⚠️ [caller] No remote stream found");
          }
        }, 500);
      });

      this.currentCall = call;

      // this.currentCall = call;
      console.log("📞 [DEBUG] call instance", this.currentCall);
      console.log(
        "📞 [DEBUG] typeof getLocalStreams:",
        typeof this.currentCall.getLocalStreams
      );
      // this.setupCallMedia(call, remoteAudio);
    });
  }

  /* ---- INCOMING call ------------------------------------------ */
  listen(remoteAudio: ElementRef<HTMLAudioElement>) {
    this.client.addEventListener(
      VoxImplant.Events.IncomingCall,
      (e: { call: any }) => {
        console.log("📞 Incoming call from", e.call.from);

        this.currentCall = e.call;

        this.currentCall.addEventListener(VoxImplant.CallEvents.Connected, () =>
          console.log("✅ Incoming call connected")
        );
        // this.currentCall.on(VoxImplant.CallEvents.Connected, () =>
        //   console.log("✅ Incoming call connected")
        // );

        // this.currentCall.on(VoxImplant.CallEvents.Disconnected, () =>
        //   console.log("🔚 Call ended")
        // );

        this.currentCall.addEventListener(
          VoxImplant.CallEvents.Disconnected,
          () => console.log("🔚 Call ended")
        );

        this.currentCall.addEventListener("StreamAdded", (event: any) => {
          console.log("🎧 [callee] StreamAdded fired", event);
          const stream = event.stream;
          if (stream) {
            remoteAudio.nativeElement.srcObject = stream;
            remoteAudio.nativeElement.play().catch(console.error);
          }
        });

        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then(() => {
            console.log("🎤 Callee mic access granted");
            this.currentCall.answer({
              sendAudio: true,
              receiveAudio: true,
              video: { sendVideo: false, receiveVideo: false },
            });
          })
          .catch(console.error);

        // this.setupCallMedia(this.currentCall, remoteAudio);
        // navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
        //   console.log("🎙️ Callee mic access granted");
        //   // Auto-answer with audio only
        //   this.currentCall.answer({
        //     video: { sendVideo: false, receiveVideo: false },
        //     sendAudio: true,
        //     receiveAudio: true,
        //   });
        // });
      }
    );
  }

  /* ---- Hang up ------------------------------------------------- */
  hangup() {
    this.currentCall?.hangup();
    this.currentCall = undefined;
  }

  private setupCallMedia(call: any, remoteAudio: ElementRef<HTMLAudioElement>) {
    const originalCallDispatch = call.dispatchEvent;
    call.dispatchEvent = function (event: any) {
      console.log(`[CALL dispatchEvent]`, event?.type, event);
      return originalCallDispatch.call(this, event);
    };
    console.log("in steam added 1");

    call.addEventListener("Connected", () => {
      setTimeout(() => {
        const localStreams = call.getLocalStreams?.();
        console.log("📤 Local stream on callee:", localStreams);
        const streams = call.getRemoteStreams?.();
        if (streams?.length > 0) {
          remoteAudio.nativeElement.srcObject = streams[0];
          remoteAudio.nativeElement.play().catch(console.error);
        } else {
          console.warn("⚠️ Still no remote stream after delay");
        }
      }, 500); // try 500ms or more
    });
  }
}
