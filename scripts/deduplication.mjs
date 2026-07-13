export class BoundedEventSet {
  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError("BoundedEventSet limit must be a positive integer");
    }

    this.limit = limit;
    this.values = new Set();
  }

  get size() {
    return this.values.size;
  }

  has(eventId) {
    return this.values.has(eventId);
  }

  add(eventId) {
    if (this.values.has(eventId)) return false;
    this.values.add(eventId);

    while (this.values.size > this.limit) {
      const oldest = this.values.values().next().value;
      this.values.delete(oldest);
    }
    return true;
  }

  delete(eventId) {
    return this.values.delete(eventId);
  }
}
