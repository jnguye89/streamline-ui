import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom, Observable } from "rxjs";
import { environment } from "../../environments/environment";
import { UserIntegration } from "../models/user-integration.model";
import { CallEvents } from "voximplant-websdk";
import { Events } from "voximplant-websdk";

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
      null,
      // {
      //   headers: {
      //     Authorization: `Bearer ${token}`, // pass the token from Auth0
      //   },
      // }
    );
  }
  /* ---- OUTGOING call ------------------------------------------ */
  callUser(targetUser: string) {
    const call = this.client.call(
      {
        number: "6872d2d67c39260acfc71cd9", // must match Voximplant userName
        video: { sendVideo: false, receiveVideo: false },
      },
      true // display incoming video automatically
    ); // returns Call instance :contentReference[oaicite:1]{index=1}

    call.addEventListener(CallEvents.ProgressToneStart, () =>
      console.log("⏳ ringing…")
    );
    call.addEventListener(CallEvents.Connected, () =>
      console.log("✅ call connected")
    );
    call.addEventListener(CallEvents.Disconnected, () =>
      console.log("🔚 call ended")
    );

    this.currentCall = call;
  }

  /* ---- INCOMING call ------------------------------------------ */
  listen() {
    this.client.addEventListener(Events.IncomingCall, (e: { call: any }) => {
      console.log('there is an incoming call from', e.call.from);
      this.currentCall = e.call;

      this.currentCall.addEventListener(CallEvents.Connected, () =>
        console.log("✅ incoming call connected")
      );
      this.currentCall.addEventListener(CallEvents.Disconnected, () =>
        console.log("🔚 call ended")
      );

      // auto-answer with audio only
      this.currentCall.answer({
        video: { sendVideo: false, receiveVideo: false },
      });
    });
  }

  /* ---- Hang up ------------------------------------------------- */
  hangup() {
    this.currentCall?.hangup();
    this.currentCall = undefined;
  }
}
