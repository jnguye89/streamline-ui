import {
  ApplicationConfig,
  importProvidersFrom,
  isDevMode,
} from "@angular/core";
import { provideRouter } from "@angular/router";

import { routes } from "./app.routes";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { provideAuth0 } from "@auth0/auth0-angular";
import { OptionalAuthInterceptor } from "./interceptors/auth0.interceptor";
import { environment } from "../environments/environment";
import { provideServiceWorker } from "@angular/service-worker";
import { PostLoginRedirectService } from "./services/post-login-redirect.service";
import { provideAnimations } from "@angular/platform-browser/animations";

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideAuth0({
      domain: environment.auth0.domain,
      clientId: environment.auth0.clientId,
      authorizationParams: {
        audience: environment.auth0.audience,
        redirect_uri: window.location.origin,
        scope: 'openid profile email'
      },
    }),
    provideHttpClient(withInterceptorsFromDi()),
    // provideAuth0HttpInterceptor(),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: OptionalAuthInterceptor,
      multi: true,
    },
    provideServiceWorker("ngsw-worker.js", {
      enabled: !isDevMode(),
      registrationStrategy: "registerWhenStable:30000",
    }),
    PostLoginRedirectService,
  ],
};
