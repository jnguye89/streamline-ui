export interface LiveStream {
    id: number,
    wowzaId: string,
    broadcastLocation: string,
    applicationName: string,
    wssStreamUrl: string,
    streamName: string,
    phase: string,
    lastWowzaState: string,
    errorMessage: string,
    isProvisioning: boolean,
    provisonedUser: string
}