import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, EMPTY, of } from 'rxjs';

import { PodcastComponent } from './podcast.component';
import { CallOrchestratorService } from '../../services/agora/call-orchestrator.service';
import { AgoraService } from '../../services/agora/agora.service';
import { RtcService } from '../../services/agora/rtc.service';
import { RtmService } from '../../services/agora/rtm.service';
import { DeviceAuthService } from '../../services/device-auth.service';
import { RecordingSocketService } from '../../services/socket/recording.service';
import { TEST_PROVIDERS } from '../../../testing/test-providers';

describe('PodcastComponent', () => {
  let component: PodcastComponent;
  let fixture: ComponentFixture<PodcastComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PodcastComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: CallOrchestratorService,
          useValue: jasmine.createSpyObj('CallOrchestratorService', [
            'hangup',
            'initForUser',
            'startCall',
          ]),
        },
        { provide: AgoraService, useValue: {} },
        {
          provide: RtcService,
          useValue: { isConnected: () => false },
        },
        {
          provide: RtmService,
          useValue: {
            onlineMap$: new BehaviorSubject(new Map()),
            incomingInvite$: EMPTY,
            callSignals$: EMPTY,
          },
        },
        {
          provide: DeviceAuthService,
          useValue: {
            isAuthenticated$: of(false),
            user$: of(null),
          },
        },
        {
          provide: RecordingSocketService,
          useValue: {
            recordingStarted$: EMPTY,
            recordingStopped$: EMPTY,
          },
        },
      ],
    }).compileComponents();

    spyOn(navigator.mediaDevices, 'getUserMedia').and.resolveTo(
      new MediaStream(),
    );
    fixture = TestBed.createComponent(PodcastComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
