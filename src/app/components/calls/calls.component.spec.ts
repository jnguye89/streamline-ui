import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, EMPTY, of } from 'rxjs';

import { CallsComponent } from './calls.component';
import { CallOrchestratorService } from '../../services/agora/call-orchestrator.service';
import { AgoraService } from '../../services/agora/agora.service';
import { RtcService } from '../../services/agora/rtc.service';
import { RtmService } from '../../services/agora/rtm.service';
import { DeviceAuthService } from '../../services/device-auth.service';
import { TEST_PROVIDERS } from '../../../testing/test-providers';

describe('CallsComponent', () => {
  let component: CallsComponent;
  let fixture: ComponentFixture<CallsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CallsComponent],
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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CallsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
