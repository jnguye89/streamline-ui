import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { ConverseComponent } from './converse.component';

describe('ConverseComponent', () => {
  let component: ConverseComponent;
  let fixture: ComponentFixture<ConverseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConverseComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ConverseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
