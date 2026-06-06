import { Injectable } from "@angular/core";
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
} from "@angular/common/http";
import { Observable } from "rxjs";
import { DeviceAuthService } from "../services/device-auth.service";
import { environment } from "../../environments/environment";

@Injectable()
export class OptionalAuthInterceptor implements HttpInterceptor {
  constructor(private deviceAuth: DeviceAuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!req.url.includes(environment.baseUrl)) {
      return next.handle(req);
    }

    const token = this.deviceAuth.getAccessToken();
    if (!token) return next.handle(req);

    return next.handle(req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }));
  }
}
