import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

export const TEST_PROVIDERS = [
  provideHttpClient(),
  provideHttpClientTesting(),
  provideRouter([]),
];
