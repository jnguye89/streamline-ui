import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { ThreadModel } from "../models/thread.model";
import { environment } from "../../environments/environment";
import { Observable } from "rxjs";

@Injectable({
    providedIn: 'root'
})
export class ThreadService {
    private apiUrl = environment.baseUrl;
    constructor(private http: HttpClient) { }

    getLatestThreads(count = 50): Observable<ThreadModel[]> {
        return this.http.get<ThreadModel[]>(`${this.apiUrl}/thread/${count}`);
    }

    createThread(thread: ThreadModel): Observable<ThreadModel> {
        console.log(thread);
        return this.http.post<ThreadModel>(`${this.apiUrl}/thread`, thread)
    }
}