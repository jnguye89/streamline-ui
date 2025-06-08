import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConverseComponent } from './converse.component';

describe('ConverseComponent', () => {
  let component: ConverseComponent;
  let fixture: ComponentFixture<ConverseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConverseComponent]
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
