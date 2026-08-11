import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListenComponent } from './listen.component';
import { TEST_PROVIDERS } from '../../../testing/test-providers';

describe('ListenComponent', () => {
  let component: ListenComponent;
  let fixture: ComponentFixture<ListenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListenComponent],
      providers: TEST_PROVIDERS,
    }).compileComponents();

    fixture = TestBed.createComponent(ListenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
