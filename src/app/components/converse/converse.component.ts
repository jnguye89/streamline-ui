import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit } from "@angular/core";
import { Conversation, type Mode, type VoiceConversation } from "@elevenlabs/client";
import { firstValueFrom } from "rxjs";
import { GamepadFocusableDirective } from "../../directives/gamepad-focusable.directive";
import { ElevenLabsService } from "../../services/elevenlabs.service";
import { SeoService } from "../../services/seo.service";

type ViewState = "idle" | "connecting" | "connected" | "error";

const BAR_COUNT = 5;
const IDLE_BAR_LEVEL = 0.1;

@Component({
  selector: "app-converse",
  standalone: true,
  imports: [CommonModule, GamepadFocusableDirective],
  templateUrl: "./converse.component.html",
  styleUrl: "./converse.component.scss",
})
export class ConverseComponent implements OnInit, OnDestroy {
  viewState: ViewState = "idle";
  mode: Mode = "listening";
  errorMessage = "";
  bars: number[] = new Array(BAR_COUNT).fill(IDLE_BAR_LEVEL);

  private conversation: VoiceConversation | null = null;
  private animationFrameId: number | null = null;

  constructor(
    private seo: SeoService,
    private elevenLabsService: ElevenLabsService
  ) {}

  ngOnInit() {
    this.setUpSeo();
  }

  ngOnDestroy() {
    this.stopMetering();
    this.conversation?.endSession();
  }

  get statusLabel(): string {
    switch (this.viewState) {
      case "idle":
        return "Ready to start";
      case "connecting":
        return "Connecting…";
      case "connected":
        return this.mode === "speaking" ? "AI is speaking…" : "Listening…";
      case "error":
        return "Something went wrong";
    }
  }

  get helperText(): string {
    switch (this.viewState) {
      case "idle":
        return "Click Start to begin your conversation";
      case "connecting":
        return "Requesting microphone access…";
      case "connected":
        return this.mode === "speaking"
          ? "Listen to the AI response"
          : "Go ahead, I'm listening";
      case "error":
        return this.errorMessage || "Please try again";
    }
  }

  get buttonLabel(): string {
    switch (this.viewState) {
      case "idle":
        return "Start";
      case "connecting":
        return "Connecting…";
      case "connected":
        return "End";
      case "error":
        return "Retry";
    }
  }

  get buttonIcon(): string {
    return this.viewState === "connected" ? "⏹️" : "🎙️";
  }

  async onOrbClick() {
    if (this.viewState === "connected") {
      await this.endConversation();
      return;
    }
    if (this.viewState === "connecting") {
      return;
    }
    await this.startConversation();
  }

  private async startConversation() {
    this.viewState = "connecting";
    this.errorMessage = "";

    try {
      const { signedUrl } = await firstValueFrom(
        this.elevenLabsService.getSession()
      );

      this.conversation = await Conversation.startSession({
        signedUrl,
        textOnly: false,
        onConnect: () => {
          this.viewState = "connected";
          this.startMetering();
        },
        onDisconnect: () => {
          this.stopMetering();
          this.conversation = null;
          this.viewState = "idle";
        },
        onError: (message) => {
          this.stopMetering();
          this.errorMessage = message;
          this.conversation = null;
          this.viewState = "error";
        },
        onModeChange: ({ mode }) => {
          this.mode = mode;
        },
      });
    } catch (err) {
      this.errorMessage =
        err instanceof Error ? err.message : "Unable to start conversation";
      this.viewState = "error";
    }
  }

  private async endConversation() {
    this.stopMetering();
    await this.conversation?.endSession();
    this.conversation = null;
    this.viewState = "idle";
  }

  private startMetering() {
    const tick = () => {
      if (!this.conversation) {
        return;
      }
      const data =
        this.mode === "speaking"
          ? this.conversation.getOutputByteFrequencyData()
          : this.conversation.getInputByteFrequencyData();
      this.bars = this.sampleBars(data);
      this.animationFrameId = requestAnimationFrame(tick);
    };
    this.animationFrameId = requestAnimationFrame(tick);
  }

  private stopMetering() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.bars = new Array(BAR_COUNT).fill(IDLE_BAR_LEVEL);
  }

  private sampleBars(data: Uint8Array): number[] {
    const bucketSize = Math.floor(data.length / BAR_COUNT) || 1;
    const bars: number[] = [];

    for (let i = 0; i < BAR_COUNT; i++) {
      const start = i * bucketSize;
      const end = start + bucketSize;
      let sum = 0;
      let count = 0;

      for (let j = start; j < end && j < data.length; j++) {
        sum += data[j];
        count++;
      }

      const average = count ? sum / count / 255 : 0;
      bars.push(Math.max(IDLE_BAR_LEVEL, average));
    }

    return bars;
  }

  private setUpSeo() {
    const title = "skriin AI TV";
    const description =
      "Natural-language chat with on-screen AI. Ask anything, control playback, search shows or get trivia while you watch.";
    const keywords =
      "ai voice assistant tv, talk to tv, llm search, conversational ui, smart tv chatbot";

    this.seo.setTags({
      title,
      description,
      keywords,
      path: "/watch",
      // image: "https://www.yoursite.com/assets/calls-og-image.jpg",
    });
  }
}
