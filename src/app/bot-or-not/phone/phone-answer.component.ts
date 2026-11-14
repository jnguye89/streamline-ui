import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MAX_ANSWER_CHARS, SHOW_COUNT_FROM } from '../core/settings';
import { charCount, normalizeAnswer } from '../core/text';
import { PrivateView } from '../core/types';

/**
 * Answer pad. The prompt stays on screen while typing, Send sits right under the box so the
 * keyboard never covers it, and the count only appears from 60/80. Editable until time's up.
 */
@Component({
  selector: 'bon-phone-answer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="prompt">{{ prompt() }}</div>

    @if (me()?.submitted && !editing()) {
      <div class="sent">
        <span class="tag">Sent</span>
        <p class="mine">{{ me()?.answer }}</p>
      </div>
      <button type="button" class="ph-btn ghost" (click)="edit()">Edit</button>
      <p class="hint">You can change it until time’s up.</p>
    } @else {
      <label class="box" [class.bad]="showBlocked()">
        <textarea
          #box
          rows="3"
          [attr.maxlength]="maxChars + 8"
          placeholder="Type your answer"
          autocomplete="off"
          enterkeyhint="send"
          [value]="draft()"
          (input)="onInput($event)"
          (keydown.enter)="$event.preventDefault(); send()"
          (focus)="keepSendVisible()"
        ></textarea>
        @if (count() >= showCountFrom) {
          <span class="count" [class.max]="count() >= maxChars">{{ count() }}/{{ maxChars }}</span>
        }
      </label>
      @if (showBlocked()) {
        <p class="err">Try another answer.</p>
      }
      <button #sendBtn type="button" class="ph-btn primary" [disabled]="!canSend() || sending()" (click)="send()">Send</button>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 14px; }
    .prompt { padding: 18px 20px; border-radius: 18px; background: #eef0fe; color: #1e1b4b; font: 600 22px/1.25 var(--ph-display); letter-spacing: -0.01em; }
    .box { position: relative; display: block; }
    textarea {
      display: block; width: 100%; min-height: 112px; resize: none; padding: 16px 18px 30px; border-radius: 16px;
      border: 2px solid #e4e4ec; background: #fff; color: #0b0b10; font: 500 20px/1.35 var(--ph-ui); outline: none;
    }
    textarea:focus { border-color: #4f46e5; }
    .box.bad textarea { border-color: #dc2626; }
    .count { position: absolute; right: 14px; bottom: 10px; font: 500 15px/1 var(--ph-mono); color: #6b6b7b; }
    .count.max { color: #dc2626; }
    .err { margin: -4px 2px 0; font: 600 16px/1.3 var(--ph-ui); color: #dc2626; }
    .sent { padding: 18px 20px; border-radius: 18px; border: 2px solid #4f46e5; background: #fff; }
    .tag { display: inline-block; font: 700 13px/1 var(--ph-ui); letter-spacing: 0.06em; text-transform: uppercase; color: #4f46e5; }
    .mine { margin: 10px 0 0; font: 600 20px/1.35 var(--ph-ui); overflow-wrap: anywhere; }
    .hint { margin: 0; text-align: center; font: 500 15px/1.3 var(--ph-ui); color: #6b6b7b; }
  `,
})
export class PhoneAnswerComponent {
  readonly prompt = input('');
  readonly me = input<PrivateView | null>(null);
  readonly roundKey = input(0);
  readonly submit = output<string>();

  protected readonly maxChars = MAX_ANSWER_CHARS;
  protected readonly showCountFrom = SHOW_COUNT_FROM;
  protected readonly draft = signal('');
  protected readonly editing = signal(false);
  protected readonly sending = signal(false);
  protected readonly count = computed(() => charCount(this.draft()));
  protected readonly canSend = computed(() => normalizeAnswer(this.draft()).length > 0);
  /** What was last sent; the "try another" note goes away as soon as they change it. */
  private readonly lastSent = signal<string | null>(null);
  protected readonly showBlocked = computed(() => !!this.me()?.blocked && this.lastSent() === this.draft());

  private readonly sendBtn = viewChild<ElementRef<HTMLButtonElement>>('sendBtn');
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');

  constructor() {
    // New round: empty box, not editing.
    effect(() => {
      this.roundKey();
      untracked(() => {
        this.draft.set('');
        this.editing.set(false);
        this.lastSent.set(null);
      });
    });
    // Sent (or blocked) clears the "sending" state.
    effect(() => {
      const me = this.me();
      untracked(() => {
        this.sending.set(false);
        if (me?.submitted && !me.blocked && this.editing() && me.answer === normalizeAnswer(this.draft())) this.editing.set(false);
      });
    });
  }

  protected onInput(e: Event): void {
    const value = (e.target as HTMLTextAreaElement).value;
    const capped = Array.from(value.replace(/\n/g, ' ')).slice(0, MAX_ANSWER_CHARS).join('');
    if (capped !== value) (e.target as HTMLTextAreaElement).value = capped;
    this.draft.set(capped);
  }

  protected send(): void {
    if (!this.canSend() || this.sending()) return;
    this.sending.set(true);
    this.lastSent.set(this.draft());
    globalThis.navigator?.vibrate?.(12);
    this.submit.emit(this.draft());
    setTimeout(() => this.sending.set(false), 1500);
  }

  protected edit(): void {
    this.draft.set(this.me()?.answer ?? '');
    this.editing.set(true);
    setTimeout(() => this.box()?.nativeElement.focus(), 0);
  }

  /** When the keyboard opens, scroll so the Send button sits just above it. */
  protected keepSendVisible(): void {
    setTimeout(() => this.sendBtn()?.nativeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 320);
  }
}
