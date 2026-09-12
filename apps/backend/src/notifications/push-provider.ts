/** Push port. Adding Slack/Teams/email later is a new adapter, not a pipeline change. */
export interface PushMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly sound: boolean;
  /** Deep-link payload: the app routes on `incidentId`. */
  readonly data: { readonly incidentId: string; readonly kind: string };
}

export interface PushSendResult {
  readonly token: string;
  readonly ok: boolean;
  readonly error: string | null;
}

export interface PushProvider {
  readonly id: string;
  isAvailable(): boolean;
  send(messages: readonly PushMessage[]): Promise<PushSendResult[]>;
}
