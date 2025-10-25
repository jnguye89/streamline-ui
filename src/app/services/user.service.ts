import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { Auth0User } from "../models/auth0-user.model";
import { environment } from "../../environments/environment";

@Injectable({
    providedIn: 'root'
})
export class UserService {
    constructor(private http: HttpClient) {}

    getUsers(): Observable<Auth0User[]> {
        return this.http.get<Auth0User[]>(`${environment.baseUrl}/user`)
    }
}