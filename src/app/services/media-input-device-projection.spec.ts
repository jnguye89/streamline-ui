import { projectMediaInputDevice } from './media-input-device-projection';

function device(
  kind: 'videoinput' | 'audioinput',
  label: string,
  deviceId = label,
): MediaDeviceInfo {
  return {
    deviceId,
    groupId: 'group',
    kind,
    label,
    toJSON: () => ({}),
  };
}

describe('projectMediaInputDevice', () => {
  it('aliases supported SC0710 video inputs despite punctuation and spacing variations', () => {
    expect(
      projectMediaInputDevice(
        device('videoinput', 'SC0710 PCI, Video 01 Capture'),
      )?.displayLabel,
    ).toBe('Console Video 1');
    expect(
      projectMediaInputDevice(
        device('videoinput', 'yuan sc-0710 pci video-02 capture device'),
      )?.displayLabel,
    ).toBe('Console Video 2');
  });

  it('aliases supported SC0710 audio inputs independently', () => {
    expect(
      projectMediaInputDevice(
        device('audioinput', 'SC0710 PCI, Analog 01 Audio (SC0710 PCI)'),
      )?.displayLabel,
    ).toBe('Console Audio 1');
    expect(
      projectMediaInputDevice(
        device('audioinput', 'SC 0710 PCI Analog-02 Audio'),
      )?.displayLabel,
    ).toBe('Console Audio 2');
  });

  it('aliases the Realtek microphone with loose punctuation matching', () => {
    expect(
      projectMediaInputDevice(
        device('audioinput', 'Microphone [Realtek R Audio]'),
      )?.displayLabel,
    ).toBe('Skriin Microphone');
  });

  it('hides browser default and communications aliases', () => {
    expect(
      projectMediaInputDevice(
        device('audioinput', 'Default - Microphone (Realtek(R) Audio)'),
      ),
    ).toBeNull();
    expect(
      projectMediaInputDevice(
        device('audioinput', '  Communications - USB Headset'),
      ),
    ).toBeNull();
  });

  it('hides reserved Chromium audio aliases without relying on English labels', () => {
    expect(
      projectMediaInputDevice(
        device('audioinput', 'Predeterminado - Micrófono', 'default'),
      ),
    ).toBeNull();
    expect(
      projectMediaInputDevice(
        device('audioinput', '', 'communications'),
      ),
    ).toBeNull();
  });

  it('does not apply Chromium audio alias IDs to video inputs', () => {
    expect(
      projectMediaInputDevice(
        device('videoinput', 'Camera named Default', 'default'),
      )?.displayLabel,
    ).toBe('Camera named Default');
  });

  it('preserves unknown and unsupported device labels', () => {
    expect(
      projectMediaInputDevice(
        device('videoinput', 'YUAN SC400N2 Video'),
      )?.displayLabel,
    ).toBe('YUAN SC400N2 Video');
    expect(
      projectMediaInputDevice(device('audioinput', 'Studio Microphone'))
        ?.displayLabel,
    ).toBe('Studio Microphone');
  });
});
