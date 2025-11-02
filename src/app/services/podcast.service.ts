import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { environment } from "../../environments/environment";
import { firstValueFrom } from "rxjs";

@Injectable({ providedIn: 'root' })
export class PodcastService {
    private baseUrl: string = environment.baseUrl;
    constructor(private http: HttpClient) { }

    async start(channelName: string) {
        console.log('channel name in servce: ',channelName);
        const url = `${this.baseUrl}/call/podcast/start`;
        const payload = {
            channelName
        }

        await firstValueFrom(this.http.post(url, payload));
    }

    async stop(channelName: string) {
        console.log(channelName);
        const url = `${this.baseUrl}/call/podcast/stop`;
        const payload = {
            channelName
        }

        await firstValueFrom(this.http.post(url, payload));
    }
}