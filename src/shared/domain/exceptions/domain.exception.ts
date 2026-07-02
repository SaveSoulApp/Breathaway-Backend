export abstract class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper prototype chain in transpiled TypeScript
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
