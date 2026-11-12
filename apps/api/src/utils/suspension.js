// A suspended workplace cannot sign in or clock in until a platform admin reinstates it.
export const SUSPENDED_MESSAGE = 'This workplace has been suspended. Please contact Frankiecode Solutions.';
export const orgIsSuspended = (org) => !!org?.suspended?.at;
