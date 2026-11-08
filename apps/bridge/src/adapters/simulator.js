// Pretends to be a reader so the kiosk, bridge and API can be tested without hardware.
// Each identify() returns the next queued ID, or SIM_USER_ID, or nothing (not recognised).
export function createSimulator({ queue = [], fixedId = '' } = {}) {
  const enrolled = new Set();
  return {
    name: 'simulator',
    async isReady() { return true; },
    async identify() { return queue.shift() ?? (fixedId || null); },
    async enroll(id) { enrolled.add(id); },
    async remove(id) { return enrolled.delete(id); },
    _enrolled: enrolled,
  };
}
