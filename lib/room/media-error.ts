export type MediaDeviceKind = "camera" | "microphone";

function errorName(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const name = "name" in error ? error.name : undefined;
  return typeof name === "string" ? name : "";
}

export function describeMediaDeviceError(kind: MediaDeviceKind, error: unknown) {
  const name = errorName(error);
  const device = kind === "camera" ? "camera" : "microphone";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return `${device[0].toUpperCase()}${device.slice(1)} access is blocked for this site. Allow it in the browser site settings and try again.`;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return `No ${device} was found on this device.`;
    case "NotReadableError":
    case "TrackStartError":
      return `The ${device} is already being used by another app, or the operating system blocked access.`;
    case "SecurityError":
      return `The browser blocked ${device} access because this page is not running in a permitted secure context.`;
    case "OverconstrainedError":
      return `The available ${device} does not meet the requested settings.`;
    default:
      return `${device[0].toUpperCase()}${device.slice(1)} could not be enabled${name ? ` (${name})` : ""}. Check browser and device settings.`;
  }
}
