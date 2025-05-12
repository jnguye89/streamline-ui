import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAuth0 } from '@auth0/auth0-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes), 
    provideClientHydration(), 
    provideAnimationsAsync(), 
    provideHttpClient(withInterceptors([])), 
    provideAuth0({
      domain: 'dev-6z6sz1d404izb1ge.us.auth0.com',
      clientId: 'Vlunm6En7MF2N8dzGFOl5sTzcCWX7QRi',
      authorizationParams: {
        redirect_uri: window.location.origin
      }
    })]
};
