export type WifiState =
  | 'Idle'
  | 'CheckingConnection'
  | 'WaitingForPhone'
  | 'Connecting'
  | 'Connected'
  | 'Failed';

// Mirrors the JSON shape served by the SkriinWifiSetup Windows service's
// local status endpoint (see the wifi-setup repo, KioskStatusServer.cs).
export interface WifiStatus {
  state: WifiState;
  ssid: string | null;
  message: string | null;
  timestamp: string;
}
