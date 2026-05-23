export type PhoneCallEvent =
  | 'Incoming'
  | 'Offhook'
  | 'Disconnected'
  | 'Missed'
  | 'Connected'
  | 'Dialing';

export type CallDetectorCallback = (
  event: PhoneCallEvent,
  phoneNumber?: string
) => void;

export type CallDetectorHandle = {
  dispose: () => void;
};

export type CallDetectorSupport = {
  supported: boolean;
  reason?: string;
};
