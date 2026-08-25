export class ModalStack<T extends string> {
  private entries: T[] = [];

  public get active(): T | null {
    return this.entries.at(-1) ?? null;
  }

  public get isEmpty(): boolean {
    return this.entries.length === 0;
  }

  public includes(entry: T): boolean {
    return this.entries.includes(entry);
  }

  public replace(entry: T): void {
    this.entries = [entry];
  }

  public replaceChild(root: T, child: T): void {
    this.entries = [root, child];
  }

  public pop(): T | null {
    return this.entries.pop() ?? null;
  }

  public clear(): void {
    this.entries = [];
  }
}
