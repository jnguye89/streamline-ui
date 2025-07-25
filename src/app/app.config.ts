import {
  ApplicationConfig,
  importProvidersFrom,
  isDevMode,
} from "@angular/core";
import { provideRouter } from "@angular/router";

import { routes } from "./app.routes";
import { provideClientHydration } from "@angular/platform-browser";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptors,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { provideAuth0 } from "@auth0/auth0-angular";
import { provideAuth0HttpInterceptor } from "./interceptors/autho-interceptor.provider"; // custom file
import { OptionalAuthInterceptor } from "./interceptors/auth0.interceptor";
import { environment } from "../environments/environment";
import { provideServiceWorker } from "@angular/service-worker";
import { PostLoginRedirectService } from "./services/post-login-redirect.service";

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideClientHydration(),
    provideAnimationsAsync(),
    provideAuth0({
      domain: environment.auth0.domain,
      clientId: environment.auth0.clientId,
      authorizationParams: {
        audience: environment.auth0.audience,
        redirect_uri: window.location.origin,
      },
      cacheLocation: "localstorage", // required for refresh tokens in SPAs
      useRefreshTokens: true,
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
