// src/app/state.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LiveStream } from '../models/live-stream.model';

@Injectable({
    providedIn: 'root' // Makes the service a singleton and available throughout the app
})
export class StreamStateService {
    private _dataSubject = new BehaviorSubject<LiveStream | null>(null); // Initial value can be an empty object or specific data structure
    public data$ = this._dataSubject.asObservable(); // Expose as Observable for components to subscribe

    constructor() { }

    // Method to update the state
    setData(newData: LiveStream) {
        this._dataSubject.next(newData);
    }

    // Method to get the current state value (optional, can also subscribe to data$)
    getCurrentData(): LiveStream | null {
        return this._dataSubject.getValue();
    }
}